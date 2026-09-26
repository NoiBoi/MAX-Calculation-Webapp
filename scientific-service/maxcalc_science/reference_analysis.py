from __future__ import annotations

from datetime import datetime, timezone
import math
import platform
from uuid import uuid4

import lmfit
import numpy as np
import pybaselines
import scipy
from scipy.optimize import least_squares, linear_sum_assignment

from . import __version__
from .errors import ScientificError
from .models import (
    XRDHkl,
    XRDLatticeRefinementRequest,
    XRDLatticeRefinementResult,
    XRDMatchCandidate,
    XRDPeakMatch,
    XRDReferenceMatchingRequest,
    XRDReferenceMatchingResult,
    XRDRefinedParameter,
    XRDReflectionResidual,
    XRDRefinementDiagnostics,
    XRDScientificProvenance,
)


def _provenance() -> XRDScientificProvenance:
    return XRDScientificProvenance(
        service_version=__version__, python_version=platform.python_version(),
        numpy_version=np.__version__, scipy_version=scipy.__version__,
        pybaselines_version=pybaselines.__version__, lmfit_version=lmfit.__version__,
    )


def _reflection_id(index: int) -> str:
    return f"reflection-{index}"


def match_reference_peaks(request: XRDReferenceMatchingRequest) -> XRDReferenceMatchingResult:
    analysis, pattern, config = request.peak_analysis, request.reference_pattern, request.config
    _system(pattern.crystal_system)
    wavelength = request.experimental_wavelength_angstrom
    if wavelength is None:
        raise ScientificError("WAVELENGTH_REQUIRED", "Experimental wavelength is required before reference matching.", 422)
    if not math.isclose(wavelength, pattern.radiation.wavelength_angstrom, rel_tol=1e-7, abs_tol=1e-7):
        raise ScientificError(
            "WAVELENGTH_MISMATCH",
            "Experimental and reference wavelengths differ. Recalculate the reference pattern at the experimental wavelength.",
            422,
        )
    peaks = [
        peak for peak in analysis.fitted_peaks
        if peak.fitted_center_two_theta_deg is not None and peak.diagnostics.success
        and (not config.ignore_excluded_stage3_peaks or peak.included)
    ]
    if not peaks:
        raise ScientificError("NO_FITTED_PEAKS", "No successful fitted experimental peaks are available for matching.", 422)
    reflections = pattern.reflections
    if not reflections:
        raise ScientificError("NO_MATCHES", "The selected reference contains no reflections in its calculated range.", 422)
    experimental_min = min(float(peak.fitted_center_two_theta_deg) for peak in peaks)
    experimental_max = max(float(peak.fitted_center_two_theta_deg) for peak in peaks)
    if experimental_max < pattern.two_theta_range.min_deg or experimental_min > pattern.two_theta_range.max_deg:
        raise ScientificError("NO_MATCHES", "Experimental fitted peaks do not overlap the calculated reference 2theta range.", 422)

    n_exp, n_ref = len(peaks), len(reflections)
    size = n_exp + n_ref
    unmatched_cost = config.maximum_delta_two_theta_deg + 1.0
    forbidden = unmatched_cost * 1_000_000
    cost = np.full((size, size), forbidden, dtype=float)
    maximum_height = max((peak.height or 0.0) for peak in peaks)
    for i, peak in enumerate(peaks):
        center = float(peak.fitted_center_two_theta_deg)
        for j, reflection in enumerate(reflections):
            delta = abs(center - reflection.two_theta_deg)
            if delta <= config.maximum_delta_two_theta_deg:
                tie = 0.0
                if config.intensity_usage == "tie-breaker" and peak.height is not None and maximum_height > 0:
                    # Bounded weak term only; position remains dominant.
                    tie = config.intensity_tie_break_weight * abs(reflection.relative_intensity / 100.0 - peak.height / maximum_height)
                cost[i, j] = delta + tie
        cost[i, n_ref + i] = unmatched_cost
    for j in range(n_ref):
        cost[n_exp + j, j] = unmatched_cost
    cost[n_exp:, n_ref:] = 0.0
    rows, columns = linear_sum_assignment(cost)

    matches: list[XRDPeakMatch] = []
    matched_exp: set[int] = set()
    matched_ref: set[int] = set()
    for row, column in zip(rows.tolist(), columns.tolist(), strict=True):
        if row >= n_exp or column >= n_ref or cost[row, column] >= unmatched_cost:
            continue
        peak, reflection = peaks[row], reflections[column]
        center = float(peak.fitted_center_two_theta_deg)
        delta = center - reflection.two_theta_deg
        alternatives: list[XRDMatchCandidate] = []
        for j, candidate in enumerate(reflections):
            candidate_delta = center - candidate.two_theta_deg
            if abs(candidate_delta) <= config.maximum_delta_two_theta_deg:
                alternatives.append(XRDMatchCandidate(
                    reference_reflection_id=_reflection_id(j), reference_two_theta_deg=candidate.two_theta_deg,
                    delta_two_theta_deg=candidate_delta, absolute_delta_two_theta_deg=abs(candidate_delta),
                    calculated_relative_intensity=candidate.relative_intensity, hkls=candidate.hkls,
                ))
        alternatives.sort(key=lambda item: (item.absolute_delta_two_theta_deg, item.reference_reflection_id))
        ambiguous = any(item.reference_reflection_id != _reflection_id(column) and abs(item.absolute_delta_two_theta_deg - abs(delta)) <= config.ambiguity_threshold_deg for item in alternatives)
        selected_hkl = _safe_group_hkl(pattern.crystal_system, reflection.hkls)
        notes = []
        if ambiguous:
            notes.append("Multiple reference reflections have similarly close peak positions.")
        if selected_hkl is None:
            notes.append("Grouped hkl contributors require researcher selection before refinement.")
        match_id = f"match-{uuid4()}"
        matches.append(XRDPeakMatch(
            match_id=match_id, experimental_peak_id=peak.peak_id, reference_reflection_id=_reflection_id(column),
            experimental_two_theta_deg=center, reference_two_theta_deg=reflection.two_theta_deg,
            delta_two_theta_deg=delta, absolute_delta_two_theta_deg=abs(delta), experimental_fwhm_deg=peak.fwhm_deg,
            experimental_intensity=peak.height, center_stderr_deg=peak.center_stderr_deg,
            calculated_relative_intensity=reflection.relative_intensity, candidate_hkls=reflection.hkls,
            selected_hkl=selected_hkl, alternative_candidates=alternatives, ambiguous=ambiguous,
            include_in_refinement=selected_hkl is not None, notes=notes,
        ))
        matched_exp.add(row); matched_ref.add(column)
    if not matches:
        raise ScientificError("NO_MATCHES", "No reference reflections fall within the configured 2theta tolerance.", 422)
    warnings: list[str] = []
    if any(match.ambiguous for match in matches):
        warnings.append("Ambiguous positional matches require researcher review.")
    if any(match.selected_hkl is None for match in matches):
        warnings.append("Some grouped reflections require an explicit hkl selection before refinement.")
    return XRDReferenceMatchingResult(
        matching_result_id=f"xrd-matching-{uuid4()}", parent_peak_analysis_id=analysis.peak_analysis_id,
        parent_processed_representation_id=analysis.parent_processed_representation_id,
        parent_measurement_id=analysis.parent_measurement_id, selected_reference=pattern.reference,
        reference_cif_sha256=pattern.reference.cif_sha256, raw_artifact_sha256=analysis.raw_artifact_sha256,
        wavelength_angstrom=wavelength, config=config, proposed_matches=matches,
        unmatched_experimental_peak_ids=[peak.peak_id for i, peak in enumerate(peaks) if i not in matched_exp],
        unmatched_reference_reflection_ids=[_reflection_id(i) for i in range(n_ref) if i not in matched_ref],
        ambiguous_match_ids=[match.match_id for match in matches if match.ambiguous], warnings=warnings,
        scientific_provenance=_provenance(), created_at=datetime.now(timezone.utc),
    )


def _system(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {"cubic": "cubic", "tetragonal": "tetragonal", "hexagonal": "hexagonal", "orthorhombic": "orthorhombic"}
    if normalized not in aliases:
        raise ScientificError("UNSUPPORTED_CRYSTAL_SYSTEM", f"Crystal system '{value}' is not supported for Stage 4 refinement.", 422)
    return aliases[normalized]


def _coefficients(system: str, hkl: XRDHkl) -> np.ndarray:
    h, k, l = hkl.h, hkl.k, hkl.l
    if h == 0 and k == 0 and l == 0:
        raise ScientificError("INVALID_HKL", "The (0 0 0) reflection is not physically valid.", 422)
    if system == "cubic": return np.array([h*h + k*k + l*l], dtype=float)
    if system == "tetragonal": return np.array([h*h + k*k, l*l], dtype=float)
    if system == "hexagonal": return np.array([(4.0/3.0)*(h*h + h*k + k*k), l*l], dtype=float)
    return np.array([h*h, k*k, l*l], dtype=float)


def _safe_group_hkl(crystal_system: str, hkls: list[XRDHkl]) -> XRDHkl | None:
    try:
        system = _system(crystal_system)
    except ScientificError:
        return None
    first = _coefficients(system, hkls[0])
    return hkls[0] if all(np.array_equal(first, _coefficients(system, item)) for item in hkls[1:]) else None


def _parameter_names(system: str) -> list[str]:
    return {"cubic": ["a"], "tetragonal": ["a", "c"], "hexagonal": ["a", "c"], "orthorhombic": ["a", "b", "c"]}[system]


def _initial(system: str, lattice) -> np.ndarray:
    return np.array({"cubic": [lattice.a_angstrom], "tetragonal": [lattice.a_angstrom, lattice.c_angstrom], "hexagonal": [lattice.a_angstrom, lattice.c_angstrom], "orthorhombic": [lattice.a_angstrom, lattice.b_angstrom, lattice.c_angstrom]}[system], dtype=float)


def _d_spacing(system: str, parameters: np.ndarray, hkl: XRDHkl) -> float:
    coeff = _coefficients(system, hkl)
    reciprocal = float(np.sum(coeff / np.square(parameters)))
    if reciprocal <= 0 or not math.isfinite(reciprocal):
        raise ValueError("invalid reciprocal d-spacing")
    return 1.0 / math.sqrt(reciprocal)


def _two_theta(d: float, wavelength: float) -> float:
    ratio = wavelength / (2.0 * d)
    if not 0 < ratio < 1:
        raise ValueError("reflection is outside the physical Bragg domain")
    return math.degrees(2.0 * math.asin(ratio))


def refine_lattice(request: XRDLatticeRefinementRequest) -> XRDLatticeRefinementResult:
    matching, config = request.matching_result, request.config
    system = _system(request.crystal_system)
    selected = [match for match in matching.proposed_matches if match.accepted and match.include_in_refinement and match.provenance_state != "REJECTED"]
    if not selected:
        raise ScientificError("NO_MATCHES", "No accepted matches are included in lattice refinement.", 422)
    if any(match.selected_hkl is None for match in selected):
        raise ScientificError("AMBIGUOUS_ASSIGNMENT", "Every included match requires one crystallographically usable hkl assignment.", 422)
    hkls = [match.selected_hkl for match in selected if match.selected_hkl is not None]
    design = np.vstack([_coefficients(system, hkl) for hkl in hkls])
    lattice_parameter_count = len(_parameter_names(system))
    design_rank = int(np.linalg.matrix_rank(design))
    if design_rank < lattice_parameter_count:
        raise ScientificError("INSUFFICIENT_INDEPENDENT_REFLECTIONS", "Included hkls do not independently constrain every lattice parameter.", 422)
    total_parameter_count = lattice_parameter_count + int(config.refine_zero_shift)
    if len(selected) < total_parameter_count:
        raise ScientificError("UNDERDETERMINED_LATTICE", "There are fewer included reflections than fitted parameters.", 422)

    initial_lattice = _initial(system, request.reference_lattice)
    initial = np.append(initial_lattice, 0.0) if config.refine_zero_shift else initial_lattice
    lower = np.append(initial_lattice * 0.5, -config.maximum_absolute_zero_shift_deg) if config.refine_zero_shift else initial_lattice * 0.5
    upper = np.append(initial_lattice * 1.5, config.maximum_absolute_zero_shift_deg) if config.refine_zero_shift else initial_lattice * 1.5
    observed = np.array([match.experimental_two_theta_deg for match in selected], dtype=float)

    def residual(values: np.ndarray) -> np.ndarray:
        lattice_values = values[:lattice_parameter_count]
        zero = float(values[-1]) if config.refine_zero_shift else 0.0
        try:
            predicted = np.array([_two_theta(_d_spacing(system, lattice_values, hkl), matching.wavelength_angstrom) + zero for hkl in hkls])
        except ValueError:
            return np.full(len(hkls), 1e6)
        return observed - predicted

    fit = least_squares(residual, initial, bounds=(lower, upper), method="trf", loss="linear")
    jac_rank = int(np.linalg.matrix_rank(fit.jac))
    singular_values = np.linalg.svd(fit.jac, compute_uv=False)
    condition = float(singular_values[0] / singular_values[-1]) if singular_values.size and singular_values[-1] > 0 else None
    warnings: list[str] = []
    if jac_rank < total_parameter_count:
        raise ScientificError("ILL_CONDITIONED_REFINEMENT", "The nonlinear refinement Jacobian is rank deficient.", 422)
    if condition is None or condition > 1e10:
        warnings.append("ILL_CONDITIONED_REFINEMENT: fitted parameters are strongly correlated or poorly scaled.")
    dof = len(selected) - total_parameter_count
    covariance = None
    correlation = None
    standard_errors: list[float | None] = [None] * total_parameter_count
    if dof > 0 and condition is not None and condition <= 1e10 and 2.0 * fit.cost > np.finfo(float).eps:
        try:
            covariance_array = np.linalg.inv(fit.jac.T @ fit.jac) * (2.0 * fit.cost / dof)
            diagonal = np.diag(covariance_array)
            if np.all(np.isfinite(covariance_array)) and np.all(diagonal >= 0):
                standard_errors = np.sqrt(diagonal).tolist()
                scale = np.sqrt(diagonal)
                if np.all(scale > 0):
                    correlation_array = covariance_array / np.outer(scale, scale)
                    if np.all(np.isfinite(correlation_array)):
                        covariance, correlation = covariance_array.tolist(), correlation_array.tolist()
        except (np.linalg.LinAlgError, FloatingPointError):
            pass
    if covariance is None:
        warnings.append("Fit covariance is unavailable; parameter standard errors are not reported.")
    if dof == 0:
        warnings.append("The fit has zero degrees of freedom; additional independent reflections are recommended.")
    if config.refine_zero_shift:
        warnings.append("The fitted 2theta zero shift is a nuisance parameter, not an instrument calibration.")

    final_lattice = fit.x[:lattice_parameter_count]
    zero_shift = float(fit.x[-1]) if config.refine_zero_shift else 0.0
    residual_values = residual(fit.x)
    residual_rows: list[XRDReflectionResidual] = []
    d_residuals: list[float] = []
    for match, hkl, delta in zip(selected, hkls, residual_values.tolist(), strict=True):
        theta = math.radians(match.experimental_two_theta_deg / 2.0)
        observed_d = matching.wavelength_angstrom / (2.0 * math.sin(theta))
        predicted_d = _d_spacing(system, final_lattice, hkl)
        predicted_two_theta = _two_theta(predicted_d, matching.wavelength_angstrom) + zero_shift
        d_residuals.append(observed_d - predicted_d)
        residual_rows.append(XRDReflectionResidual(
            match_id=match.match_id, experimental_peak_id=match.experimental_peak_id,
            reference_reflection_id=match.reference_reflection_id, hkl=hkl,
            experimental_two_theta_deg=match.experimental_two_theta_deg, predicted_two_theta_deg=predicted_two_theta,
            delta_two_theta_deg=match.experimental_two_theta_deg - predicted_two_theta,
            observed_d_angstrom=observed_d, predicted_d_angstrom=predicted_d, included=True,
            center_stderr_deg=match.center_stderr_deg,
        ))
    names = _parameter_names(system)
    parameters = [XRDRefinedParameter(name=name, initial_value=float(initial_lattice[i]), refined_value=float(final_lattice[i]), standard_error=standard_errors[i], unit="angstrom") for i, name in enumerate(names)]
    excluded = [match.match_id for match in matching.proposed_matches if match not in selected]
    diagnostics = XRDRefinementDiagnostics(
        optimizer_success=bool(fit.success), optimizer_message=str(fit.message), rank=jac_rank,
        parameter_count=total_parameter_count, condition_number=condition, degrees_of_freedom=dof,
        rms_delta_two_theta_deg=float(np.sqrt(np.mean(np.square(residual_values)))),
        mean_delta_two_theta_deg=float(np.mean(residual_values)),
        maximum_absolute_delta_two_theta_deg=float(np.max(np.abs(residual_values))),
        rms_d_spacing_residual_angstrom=float(np.sqrt(np.mean(np.square(d_residuals)))),
        covariance=covariance, correlation=correlation,
    )
    if not fit.success:
        warnings.append("LATTICE_REFINEMENT_FAILED: the optimizer did not report convergence.")
    return XRDLatticeRefinementResult(
        refinement_id=f"xrd-refinement-{uuid4()}", parent_matching_result_id=matching.matching_result_id,
        parent_peak_analysis_id=matching.parent_peak_analysis_id,
        parent_processed_representation_id=matching.parent_processed_representation_id,
        parent_measurement_id=matching.parent_measurement_id, raw_artifact_sha256=matching.raw_artifact_sha256,
        selected_reference=matching.selected_reference, reference_cif_sha256=matching.reference_cif_sha256,
        wavelength_angstrom=matching.wavelength_angstrom, crystal_system=system, config=config,
        reference_lattice=request.reference_lattice, parameters=parameters,
        zero_shift_deg=zero_shift if config.refine_zero_shift else None,
        zero_shift_standard_error_deg=standard_errors[-1] if config.refine_zero_shift else None,
        included_match_ids=[match.match_id for match in selected], excluded_match_ids=excluded,
        residuals=residual_rows, diagnostics=diagnostics, warnings=warnings,
        scientific_provenance=_provenance(), created_at=datetime.now(timezone.utc), library_reference=matching.library_reference,
    )
