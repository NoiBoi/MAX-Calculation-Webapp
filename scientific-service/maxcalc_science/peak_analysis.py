from __future__ import annotations

import hashlib
import json
import platform
from datetime import datetime, timezone
from importlib.metadata import version
from math import ceil, isfinite
from uuid import uuid4

import lmfit
import numpy as np
import pybaselines
import scipy
from lmfit.models import ConstantModel, LinearModel, PseudoVoigtModel
from pybaselines import Baseline
from scipy.signal import find_peaks, peak_widths, savgol_filter

from . import __version__
from .errors import ScientificError
from .models import (
    ProcessedXRDRepresentation,
    XRDFitDiagnostics,
    XRDFitGroup,
    XRDFittedPeak,
    XRDPeakAnalysis,
    XRDPeakCandidate,
    XRDPeakDetectionRequest,
    XRDPeakDetectionResult,
    XRDPeakFitRequest,
    XRDProcessRequest,
    XRDProcessingDiagnostics,
    XRDScientificProvenance,
)


def _provenance() -> XRDScientificProvenance:
    return XRDScientificProvenance(
        service_version=__version__, python_version=platform.python_version(),
        numpy_version=np.__version__, scipy_version=scipy.__version__,
        pybaselines_version=pybaselines.__version__, lmfit_version=lmfit.__version__,
    )


def _identity(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(payload).hexdigest()[:24]


def _arrays(x_values: list[float], y_values: list[float]) -> tuple[np.ndarray, np.ndarray]:
    x = np.asarray(x_values, dtype=float)
    y = np.asarray(y_values, dtype=float)
    if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
        raise ScientificError("INVALID_PROCESSING_CONFIG", "XRD analysis arrays must contain only finite values.", 422)
    return x, y


def _spacing(x: np.ndarray) -> tuple[float, bool]:
    differences = np.diff(x)
    if np.any(differences <= 0):
        raise ScientificError("INVALID_PROCESSING_CONFIG", "Stage 3 requires strictly increasing 2theta values; the raw Stage 2 measurement remains unchanged.", 422)
    median = float(np.median(differences))
    irregular = bool(np.max(np.abs(differences - median)) > max(1e-12, median * 0.02))
    return median, irregular


def process_measurement(request: XRDProcessRequest) -> ProcessedXRDRepresentation:
    x, raw = _arrays(request.two_theta_deg, request.intensity)
    config = request.processing_config
    current = raw.copy()
    baseline_values: np.ndarray | None = None
    corrected: np.ndarray | None = None
    smoothed: np.ndarray | None = None
    warnings: list[str] = []
    order: list[str] = ["raw"]
    diagnostics = XRDProcessingDiagnostics()

    if config.baseline.enabled or config.smoothing.enabled:
        _median_spacing, irregular = _spacing(x)
        if irregular and config.smoothing.enabled:
            raise ScientificError("SMOOTHING_FAILED", "Savitzky-Golay smoothing requires regularly spaced 2theta values. No resampling was performed.", 422)

    if config.baseline.enabled:
        settings = config.baseline
        try:
            fitter = Baseline(x_data=x, check_finite=True, assume_sorted=True)
            common = dict(lam=settings.lam, diff_order=settings.diff_order, max_iter=settings.max_iter, tol=settings.tol)
            if settings.algorithm == "arpls":
                baseline_values, params = fitter.arpls(current, **common)
            else:
                baseline_values, params = fitter.asls(current, p=settings.p, **common)
        except Exception as exc:
            raise ScientificError("BASELINE_FAILED", f"{settings.algorithm} baseline estimation failed.", 422, str(exc)[:500]) from exc
        if not np.all(np.isfinite(baseline_values)):
            raise ScientificError("BASELINE_FAILED", "Baseline estimation returned non-finite values.", 422)
        tolerance_history = np.asarray(params.get("tol_history", []), dtype=float)
        iteration_count = max(0, int(tolerance_history.size) - 1) if tolerance_history.size else None
        final_tolerance = float(tolerance_history[-1]) if tolerance_history.size else None
        converged = final_tolerance is None or final_tolerance < settings.tol
        diagnostics = XRDProcessingDiagnostics(
            baseline_algorithm=settings.algorithm, converged=converged,
            iteration_count=iteration_count, final_tolerance=final_tolerance,
        )
        if not converged:
            warnings.append(f"{settings.algorithm} reached its iteration limit before satisfying the requested tolerance.")
        corrected = current - baseline_values
        current = corrected.copy()
        order.append("baseline-subtraction")

    if config.smoothing.enabled:
        settings = config.smoothing
        if settings.window_length > current.size:
            raise ScientificError("SMOOTHING_FAILED", "Savitzky-Golay windowLength exceeds the number of samples.", 422)
        try:
            smoothed = savgol_filter(current, settings.window_length, settings.polynomial_order, mode="interp")
        except ValueError as exc:
            raise ScientificError("SMOOTHING_FAILED", "Savitzky-Golay smoothing configuration is invalid.", 422, str(exc)[:500]) from exc
        current = np.asarray(smoothed, dtype=float)
        order.append("savitzky-golay")

    return ProcessedXRDRepresentation(
        processed_representation_id=f"xrd-processed-{uuid4()}",
        parent_measurement_id=request.parent_measurement_id,
        raw_artifact_sha256=request.raw_artifact_sha256,
        created_at=datetime.now(timezone.utc), processing_config=config,
        two_theta_deg=x.tolist(), raw_intensity=raw.tolist(),
        estimated_baseline=None if baseline_values is None else baseline_values.tolist(),
        baseline_corrected_intensity=None if corrected is None else corrected.tolist(),
        smoothed_intensity=None if smoothed is None else np.asarray(smoothed).tolist(),
        analysis_intensity=current.tolist(), transformation_order=order,
        warnings=warnings, diagnostics=diagnostics, scientific_provenance=_provenance(),
    )


def detect_peaks(request: XRDPeakDetectionRequest) -> XRDPeakDetectionResult:
    x, y = _arrays(request.two_theta_deg, request.analysis_intensity)
    median_spacing, irregular = _spacing(x)
    config = request.detection_config
    warnings: list[str] = []
    if irregular:
        warnings.append("2theta spacing is irregular; degree-based distance and width constraints use the median spacing and reported widths are interpolated on the original axis.")
    distance = None if config.minimum_distance_deg is None else max(1, ceil(config.minimum_distance_deg / median_spacing))
    width: tuple[float | None, float | None] | None = None
    if config.minimum_width_deg is not None or config.maximum_width_deg is not None:
        width = (
            None if config.minimum_width_deg is None else config.minimum_width_deg / median_spacing,
            None if config.maximum_width_deg is None else config.maximum_width_deg / median_spacing,
        )
    try:
        indices, properties = find_peaks(
            y, prominence=config.minimum_prominence, height=config.minimum_height,
            distance=distance, width=width,
        )
    except ValueError as exc:
        raise ScientificError("PEAK_DETECTION_FAILED", "Peak detection configuration could not be applied.", 422, str(exc)[:500]) from exc
    widths = peak_widths(y, indices, rel_height=0.5) if indices.size else ([], [], [], [])
    config_id = _identity(config.model_dump(mode="json", by_alias=True))
    candidates: list[XRDPeakCandidate] = []
    for position, index in enumerate(indices):
        left = float(np.interp(float(widths[2][position]), np.arange(x.size), x))
        right = float(np.interp(float(widths[3][position]), np.arange(x.size), x))
        candidates.append(XRDPeakCandidate(
            candidate_id=f"candidate-{uuid4()}", approximate_two_theta_deg=float(x[index]),
            approximate_intensity=float(y[index]), prominence=float(properties["prominences"][position]),
            estimated_width_deg=max(0.0, right - left), source_index=int(index), detection_config_id=config_id,
        ))
    return XRDPeakDetectionResult(
        processed_representation_id=request.processed_representation_id,
        detection_config=config, detection_config_id=config_id, candidates=candidates,
        warnings=warnings, scientific_provenance=_provenance(),
    )


def _candidate_window(candidate: XRDPeakCandidate, request: XRDPeakFitRequest) -> tuple[float, float]:
    if candidate.manual_window_min_deg is not None and candidate.manual_window_max_deg is not None:
        return candidate.manual_window_min_deg, candidate.manual_window_max_deg
    config = request.fitting_config
    estimated = candidate.estimated_width_deg or config.minimum_fwhm_deg * 4
    full_width = min(config.maximum_window_deg, max(config.minimum_window_deg, estimated * config.width_multiplier))
    return candidate.approximate_two_theta_deg - full_width / 2, candidate.approximate_two_theta_deg + full_width / 2


def _groups(candidates: list[XRDPeakCandidate], request: XRDPeakFitRequest) -> tuple[list[list[XRDPeakCandidate]], list[str]]:
    ordered = sorted(candidates, key=lambda item: item.approximate_two_theta_deg)
    groups: list[list[XRDPeakCandidate]] = []
    warnings: list[str] = []
    for candidate in ordered:
        if not groups:
            groups.append([candidate])
            continue
        previous = groups[-1]
        previous_right = max(_candidate_window(item, request)[1] for item in previous)
        current_left = _candidate_window(candidate, request)[0]
        if current_left <= previous_right and len(previous) < request.fitting_config.maximum_group_peaks:
            previous.append(candidate)
        else:
            if current_left <= previous_right:
                warnings.append(f"An overlapping fit group exceeded the {request.fitting_config.maximum_group_peaks}-peak safeguard and was split.")
            groups.append([candidate])
    return groups, warnings


def _diagnostics(result: lmfit.model.ModelResult | None, message: str | None = None) -> XRDFitDiagnostics:
    if result is None:
        return XRDFitDiagnostics(success=False, message=message or "Fit was not attempted.")
    values = [result.chisqr, result.redchi, result.aic, result.bic]
    finite = all(isfinite(float(value)) for value in values)
    success = bool(result.success and finite and np.all(np.isfinite(result.best_fit)))
    return XRDFitDiagnostics(
        success=success, message=str(result.message)[:500], method=result.method, evaluations=result.nfev,
        chi_square=float(result.chisqr) if isfinite(result.chisqr) else None,
        reduced_chi_square=float(result.redchi) if isfinite(result.redchi) else None,
        akaike_information_criterion=float(result.aic) if isfinite(result.aic) else None,
        bayesian_information_criterion=float(result.bic) if isfinite(result.bic) else None,
        r_squared=float(result.rsquared) if result.rsquared is not None and isfinite(result.rsquared) else None,
    )


def fit_peaks(request: XRDPeakFitRequest) -> XRDPeakAnalysis:
    x, y = _arrays(request.two_theta_deg, request.analysis_intensity)
    active = [candidate for candidate in request.candidates if candidate.status != "EXCLUDED"]
    groups, warnings = _groups(active, request)
    fitted: list[XRDFittedPeak] = []
    fit_groups: list[XRDFitGroup] = []
    config = request.fitting_config

    for candidates in groups:
        group_id = f"fit-group-{uuid4()}"
        lower = max(float(np.min(x)), min(_candidate_window(item, request)[0] for item in candidates))
        upper = min(float(np.max(x)), max(_candidate_window(item, request)[1] for item in candidates))
        mask = (x >= lower) & (x <= upper)
        local_x, local_y = x[mask], y[mask]
        minimum_points = max(8, len(candidates) * 4 + (2 if config.local_background == "linear" else 1))
        if local_x.size < minimum_points:
            diagnostics = _diagnostics(None, f"Insufficient fit points: {local_x.size}; at least {minimum_points} required.")
            warnings.append(f"Fit group near {candidates[0].approximate_two_theta_deg:.4g} degrees has insufficient points.")
            for candidate in candidates:
                fitted.append(XRDFittedPeak(
                    peak_id=f"peak-{uuid4()}", candidate_id=candidate.candidate_id,
                    fit_window_min_deg=lower, fit_window_max_deg=upper, point_count=int(local_x.size),
                    source="AUTO" if candidate.status == "AUTO" else candidate.status,
                    included=True, group_id=group_id, diagnostics=diagnostics,
                ))
            fit_groups.append(XRDFitGroup(
                group_id=group_id, candidate_ids=[item.candidate_id for item in candidates],
                two_theta_deg=local_x.tolist(), observed_intensity=local_y.tolist(), diagnostics=diagnostics,
            ))
            continue

        background = LinearModel(prefix="background_") if config.local_background == "linear" else ConstantModel(prefix="background_")
        model = background
        for index, _candidate in enumerate(candidates):
            model = model + PseudoVoigtModel(prefix=f"p{index}_")
        params = background.make_params()
        edge_count = max(1, local_y.size // 8)
        if config.local_background == "linear":
            slope = float((np.mean(local_y[-edge_count:]) - np.mean(local_y[:edge_count])) / max(local_x[-1] - local_x[0], 1e-12))
            params["background_slope"].set(value=slope)
            params["background_intercept"].set(value=float(np.mean(local_y[:edge_count]) - slope * local_x[0]))
        else:
            params["background_c"].set(value=float(np.percentile(local_y, 10)))
        local_floor = float(np.percentile(local_y, 10))
        for index, candidate in enumerate(candidates):
            prefix = f"p{index}_"
            peak_model = PseudoVoigtModel(prefix=prefix)
            params.update(peak_model.make_params())
            fwhm = min(config.maximum_fwhm_deg, max(config.minimum_fwhm_deg, candidate.estimated_width_deg or config.minimum_fwhm_deg * 4))
            seed_mask = np.abs(local_x - candidate.approximate_two_theta_deg) <= config.center_bound_deg
            seed_x = local_x[seed_mask]
            seed_y = local_y[seed_mask]
            seed_center = float(seed_x[int(np.argmax(seed_y))]) if seed_x.size else candidate.approximate_two_theta_deg
            height = max(float((np.max(seed_y) if seed_y.size else candidate.approximate_intensity) - local_floor), np.finfo(float).eps)
            params[prefix + "center"].set(
                value=seed_center,
                min=max(lower, candidate.approximate_two_theta_deg - config.center_bound_deg),
                max=min(upper, candidate.approximate_two_theta_deg + config.center_bound_deg),
            )
            params[prefix + "sigma"].set(value=fwhm / 2, min=config.minimum_fwhm_deg / 2, max=config.maximum_fwhm_deg / 2)
            params[prefix + "amplitude"].set(value=max(height * fwhm, np.finfo(float).eps), min=0)
            params[prefix + "fraction"].set(value=0.5, min=0, max=1)
        try:
            result = model.fit(local_y, params, x=local_x, nan_policy="raise")
            diagnostics = _diagnostics(result)
        except Exception as exc:
            result = None
            diagnostics = _diagnostics(None, f"Peak fit failed: {str(exc)[:400]}")
        if not diagnostics.success:
            warnings.append(f"Fit group near {candidates[0].approximate_two_theta_deg:.4g} degrees did not produce a stable successful result.")

        for index, candidate in enumerate(candidates):
            prefix = f"p{index}_"
            def value(name: str) -> float | None:
                if result is None or prefix + name not in result.params:
                    return None
                number = float(result.params[prefix + name].value)
                return number if isfinite(number) else None
            def stderr(name: str) -> float | None:
                if result is None or prefix + name not in result.params:
                    return None
                number = result.params[prefix + name].stderr
                return float(number) if number is not None and isfinite(number) else None
            fitted.append(XRDFittedPeak(
                peak_id=f"peak-{uuid4()}", candidate_id=candidate.candidate_id,
                fitted_center_two_theta_deg=value("center") if diagnostics.success else None,
                center_stderr_deg=stderr("center") if diagnostics.success else None,
                amplitude=value("amplitude") if diagnostics.success else None,
                amplitude_stderr=stderr("amplitude") if diagnostics.success else None,
                height=value("height") if diagnostics.success else None,
                fwhm_deg=value("fwhm") if diagnostics.success else None,
                fwhm_stderr_deg=stderr("fwhm") if diagnostics.success else None,
                fraction=value("fraction") if diagnostics.success else None,
                fit_window_min_deg=lower, fit_window_max_deg=upper, point_count=int(local_x.size),
                source="AUTO" if candidate.status == "AUTO" else candidate.status,
                included=True, group_id=group_id, diagnostics=diagnostics,
            ))
        if result is None:
            fit_groups.append(XRDFitGroup(
                group_id=group_id, candidate_ids=[item.candidate_id for item in candidates],
                two_theta_deg=local_x.tolist(), observed_intensity=local_y.tolist(), diagnostics=diagnostics,
            ))
        else:
            components = result.eval_components(x=local_x)
            background_values = np.zeros_like(local_x)
            component_curves: dict[str, list[float]] = {}
            for name, curve in components.items():
                values = np.asarray(curve, dtype=float)
                if name.startswith("background_"):
                    background_values += values
                else:
                    component_curves[name] = values.tolist()
            fit_groups.append(XRDFitGroup(
                group_id=group_id, candidate_ids=[item.candidate_id for item in candidates],
                two_theta_deg=local_x.tolist(), observed_intensity=local_y.tolist(),
                best_fit=np.asarray(result.best_fit).tolist(), local_background=background_values.tolist(),
                component_curves=component_curves, residual=np.asarray(result.residual).tolist(), diagnostics=diagnostics,
            ))

    return XRDPeakAnalysis(
        peak_analysis_id=f"xrd-analysis-{uuid4()}",
        parent_processed_representation_id=request.parent_processed_representation_id,
        parent_measurement_id=request.parent_measurement_id,
        raw_artifact_sha256=request.raw_artifact_sha256,
        created_at=datetime.now(timezone.utc), detection_config=request.detection_config,
        fitting_config=config, candidate_peaks=request.candidates, fitted_peaks=fitted,
        fit_groups=fit_groups,
        excluded_candidate_ids=[item.candidate_id for item in request.candidates if item.status == "EXCLUDED"],
        manual_edits=request.manual_edits, warnings=warnings, scientific_provenance=_provenance(),
    )
