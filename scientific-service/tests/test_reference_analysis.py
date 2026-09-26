from datetime import UTC, datetime
import math

import pytest

from maxcalc_science.errors import ScientificError
from maxcalc_science.models import (
    CalculatedXRDPattern, CalculationProvenance, CrystalLattice, XRDFitDiagnostics,
    XRDFittedPeak, XRDHkl, XRDLatticeRefinementConfig, XRDLatticeRefinementRequest,
    XRDPeakAnalysis, XRDPeakDetectionConfig, XRDPeakFittingConfig, XRDReferenceMatchConfig,
    XRDReferenceMatchingRequest, XRDReferenceMatchingResult, XRDReflection, XRDReferenceMetadata,
    XRDRadiation, TwoThetaRange, XRDScientificProvenance,
)
from maxcalc_science.reference_analysis import match_reference_peaks, refine_lattice

NOW = datetime(2026, 9, 25, tzinfo=UTC)
SHA = "a" * 64
PROV = XRDScientificProvenance(service_version="test", python_version="3", numpy_version="2", scipy_version="1", pybaselines_version="1", lmfit_version="1")
FIT_OK = XRDFitDiagnostics(success=True, message="ok")
REFERENCE = XRDReferenceMetadata(source_type="user-cif", source_id="synthetic", formula="X", phase_name=None, space_group=None, crystal_system="cubic", publication=None, doi=None, reference_status="theoretical", retrieved_at=NOW, source_revision="1", cif_sha256=SHA, source_url=None)


def two_theta(d, wavelength=1.5406, shift=0.0):
    return math.degrees(2 * math.asin(wavelength / (2 * d))) + shift


def d_spacing(system, params, hkl):
    h, k, l = hkl
    if system == "cubic": reciprocal = (h*h+k*k+l*l)/params[0]**2
    elif system == "tetragonal": reciprocal = (h*h+k*k)/params[0]**2+l*l/params[1]**2
    elif system == "hexagonal": reciprocal = (4/3)*(h*h+h*k+k*k)/params[0]**2+l*l/params[1]**2
    else: reciprocal = h*h/params[0]**2+k*k/params[1]**2+l*l/params[2]**2
    return reciprocal**-0.5


def analysis(centers):
    fitted = [XRDFittedPeak(peak_id=f"p{i}", candidate_id=f"c{i}", fitted_center_two_theta_deg=value, center_stderr_deg=0.01, amplitude=100, height=50, fwhm_deg=.1, fit_window_min_deg=value-.2, fit_window_max_deg=value+.2, point_count=20, source="AUTO", included=True, group_id=f"g{i}", diagnostics=FIT_OK) for i, value in enumerate(centers)]
    return XRDPeakAnalysis(peak_analysis_id="analysis", parent_processed_representation_id="processed", parent_measurement_id="measurement", raw_artifact_sha256=SHA, created_at=NOW, detection_config=XRDPeakDetectionConfig(minimum_prominence=1), fitting_config=XRDPeakFittingConfig(), candidate_peaks=[], fitted_peaks=fitted, fit_groups=[], excluded_candidate_ids=[], manual_edits=[], warnings=[], scientific_provenance=PROV)


def pattern(positions, hkls=None, crystal_system="cubic", wavelength=1.5406):
    groups = hkls or [[(i+1, 0, 0)] for i in range(len(positions))]
    reflections = [XRDReflection(two_theta_deg=value, relative_intensity=100-i, d_angstrom=2, hkls=[XRDHkl(h=h, k=k, l=l, multiplicity=1) for h, k, l in groups[i]]) for i, value in enumerate(positions)]
    reference = REFERENCE.model_copy(update={"crystal_system": crystal_system})
    return CalculatedXRDPattern(reference=reference, radiation=XRDRadiation(kind="explicit", label="synthetic", wavelength_angstrom=wavelength), two_theta_range=TwoThetaRange(min_deg=5, max_deg=120), lattice=CrystalLattice(a_angstrom=4, b_angstrom=4, c_angstrom=4, alpha_deg=90, beta_deg=90, gamma_deg=90), crystal_system=crystal_system, space_group="synthetic", reflections=reflections, calculation_provenance=CalculationProvenance(engine_version="test", service_version="test", calculated_at=NOW, input_cif_sha256=SHA))


def matched(system, true_params, initial_params, hkls, noise=None, shift=0.0):
    centers = [two_theta(d_spacing(system, true_params, hkl), shift=shift) + (noise[i] if noise else 0) for i, hkl in enumerate(hkls)]
    pat = pattern(centers, [[hkl] for hkl in hkls], system)
    result = match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=analysis(centers), reference_pattern=pat, experimental_wavelength_angstrom=1.5406, config=XRDReferenceMatchConfig(maximum_delta_two_theta_deg=.2)))
    lattice = CrystalLattice(a_angstrom=initial_params[0], b_angstrom=initial_params[0] if len(initial_params)<3 else initial_params[1], c_angstrom=initial_params[-1], alpha_deg=90, beta_deg=90, gamma_deg=120 if system == "hexagonal" else 90)
    return result, lattice


def test_global_assignment_avoids_conflicting_nearest_neighbor_matches():
    result = match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=analysis([10.06, 10.10]), reference_pattern=pattern([10.00, 10.11]), experimental_wavelength_angstrom=1.5406, config=XRDReferenceMatchConfig(maximum_delta_two_theta_deg=.12)))
    assert len(result.proposed_matches) == 2
    assert {m.reference_reflection_id for m in result.proposed_matches} == {"reflection-0", "reflection-1"}


def test_outside_tolerance_and_impurity_are_unmatched():
    result = match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=analysis([10, 30]), reference_pattern=pattern([10.02, 40]), experimental_wavelength_angstrom=1.5406, config=XRDReferenceMatchConfig(maximum_delta_two_theta_deg=.05)))
    assert result.unmatched_experimental_peak_ids == ["p1"]
    assert "reflection-1" in result.unmatched_reference_reflection_ids


def test_ambiguity_and_grouped_hkls_are_preserved():
    result = match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=analysis([10.02]), reference_pattern=pattern([10, 10.04], [[(1,0,0),(0,1,0)], [(1,1,0)]]), experimental_wavelength_angstrom=1.5406, config=XRDReferenceMatchConfig(maximum_delta_two_theta_deg=.1, ambiguity_threshold_deg=.03)))
    assert result.proposed_matches[0].ambiguous
    assert len(result.proposed_matches[0].candidate_hkls) == 2
    assert result.proposed_matches[0].selected_hkl is not None  # cubic-equivalent family is safe


def test_wavelength_mismatch_is_blocked():
    with pytest.raises(ScientificError) as caught:
        match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=analysis([10]), reference_pattern=pattern([10]), experimental_wavelength_angstrom=1.0))
    assert caught.value.code == "WAVELENGTH_MISMATCH"


def test_unsupported_crystal_system_is_blocked_before_matching():
    with pytest.raises(ScientificError) as caught:
        match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=analysis([10]), reference_pattern=pattern([10], crystal_system="monoclinic"), experimental_wavelength_angstrom=1.5406))
    assert caught.value.code == "UNSUPPORTED_CRYSTAL_SYSTEM"


@pytest.mark.parametrize(("system", "true_params", "initial", "hkls", "tolerance"), [
    ("cubic", [4.12], [4.0], [(1,0,0),(1,1,0),(1,1,1),(2,0,0)], 1e-8),
    ("tetragonal", [3.2, 5.1], [3.1, 5.0], [(1,0,0),(0,0,1),(1,0,1),(1,1,2)], 1e-8),
    ("hexagonal", [3.08, 18.6], [3.0, 18.2], [(1,0,0),(0,0,2),(1,0,2),(1,1,0),(1,0,4)], 1e-7),
    ("orthorhombic", [3.1, 4.2, 5.3], [3.0, 4.0, 5.0], [(1,0,0),(0,1,0),(0,0,1),(1,1,0),(1,0,1)], 1e-7),
])
def test_noise_free_lattice_recovery(system, true_params, initial, hkls, tolerance):
    matching, lattice = matched(system, true_params, initial, hkls)
    result = refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system=system))
    assert [p.refined_value for p in result.parameters] == pytest.approx(true_params, abs=tolerance)
    assert result.diagnostics.rms_delta_two_theta_deg < 1e-7


def test_hexagonal_small_noise_recovers_parameters():
    matching, lattice = matched("hexagonal", [3.08, 18.6], [3.0, 18.2], [(1,0,0),(0,0,2),(1,0,2),(1,1,0),(1,0,4)], noise=[.005,-.003,.002,-.004,.001])
    result = refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="hexagonal"))
    assert [p.refined_value for p in result.parameters] == pytest.approx([3.08, 18.6], rel=5e-4)
    assert result.diagnostics.rms_delta_two_theta_deg < .01


@pytest.mark.parametrize("hkls", [[(0,0,2),(0,0,4),(0,0,6)], [(1,0,0),(1,1,0),(2,0,0)]])
def test_hexagonal_single_direction_reflections_are_rejected(hkls):
    matching, lattice = matched("hexagonal", [3.08, 18.6], [3.0, 18.2], hkls)
    with pytest.raises(ScientificError) as caught:
        refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="hexagonal"))
    assert caught.value.code == "INSUFFICIENT_INDEPENDENT_REFLECTIONS"


def test_manual_exclusion_removes_outlier_from_fit():
    hkls = [(1,0,0),(1,1,0),(1,1,1),(2,0,0)]
    matching, lattice = matched("cubic", [4.1], [4.0], hkls, noise=[0,0,0,.5])
    matching.proposed_matches[-1].include_in_refinement = False
    result = refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="cubic"))
    assert result.parameters[0].refined_value == pytest.approx(4.1, abs=1e-7)
    assert matching.proposed_matches[-1].match_id in result.excluded_match_ids


@pytest.mark.parametrize("shift", [.05, -.05, 0.0])
def test_optional_zero_shift_recovery(shift):
    matching, lattice = matched("cubic", [4.1], [4.0], [(1,0,0),(1,1,0),(1,1,1),(2,0,0),(2,1,0)], shift=shift)
    result = refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="cubic", config=XRDLatticeRefinementConfig(refine_zero_shift=True)))
    assert result.parameters[0].refined_value == pytest.approx(4.1, abs=1e-7)
    assert result.zero_shift_deg == pytest.approx(shift, abs=1e-7)


def test_sparse_zero_shift_fit_is_rejected_as_underdetermined():
    matching, lattice = matched("cubic", [4.1], [4.0], [(1, 0, 0)], shift=.05)
    with pytest.raises(ScientificError) as caught:
        refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="cubic", config=XRDLatticeRefinementConfig(refine_zero_shift=True)))
    assert caught.value.code == "UNDERDETERMINED_LATTICE"


def test_covariance_is_finite_for_well_conditioned_noisy_case():
    matching, lattice = matched("cubic", [4.1], [4.0], [(1,0,0),(1,1,0),(1,1,1),(2,0,0)], noise=[.002,-.001,.001,-.002])
    result = refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="cubic"))
    assert result.parameters[0].standard_error is not None
    assert result.diagnostics.covariance is not None


def test_incorrect_hkl_assignment_degrades_residual():
    matching, lattice = matched("cubic", [4.1], [4.0], [(1,0,0),(1,1,0),(1,1,1),(2,0,0)])
    matching.proposed_matches[-1].selected_hkl = XRDHkl(h=2, k=1, l=0, multiplicity=1)
    result = refine_lattice(XRDLatticeRefinementRequest(matching_result=matching, reference_lattice=lattice, crystal_system="cubic"))
    assert result.diagnostics.rms_delta_two_theta_deg > 1
