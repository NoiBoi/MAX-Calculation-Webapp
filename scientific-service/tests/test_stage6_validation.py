import math
from pathlib import Path

import pytest
import numpy as np
from lmfit.models import PseudoVoigtModel

from maxcalc_science.experimental_xrd import generic_text_parser
from maxcalc_science.models import DirectCIFMetadata, PatternSettings, RadiationInput, TwoThetaRange, XRDParserOverride, XRDProcessRequest, XRDProcessingConfig, XRDBaselineConfig, XRDSmoothingConfig, XRDPeakDetectionRequest, XRDPeakDetectionConfig, XRDPeakFitRequest, XRDPeakFittingConfig, XRDReferenceMatchingRequest, XRDReferenceMatchConfig, XRDLatticeRefinementRequest, XRDLatticeRefinementConfig
from maxcalc_science.peak_analysis import process_measurement, detect_peaks, fit_peaks
from maxcalc_science.reference_analysis import match_reference_peaks, refine_lattice
from maxcalc_science.xrd import calculate_pattern

FIXTURES = Path(__file__).parent / "fixtures"


def settings(preset: str) -> PatternSettings:
    return PatternSettings(radiation=RadiationInput(preset=preset), two_theta_range=TwoThetaRange(min_deg=5, max_deg=100))


def bragg_two_theta(d_angstrom: float, wavelength_angstrom: float) -> float:
    return math.degrees(2 * math.asin(wavelength_angstrom / (2 * d_angstrom)))


def test_pymatgen_copper_presets_are_exact_and_unambiguous(silicon_cif: str) -> None:
    average = calculate_pattern(silicon_cif, settings("CuKa"), direct_metadata=DirectCIFMetadata(source_id="silicon"))
    alpha1 = calculate_pattern(silicon_cif, settings("CuKa1"), direct_metadata=DirectCIFMetadata(source_id="silicon"))
    assert average.radiation.wavelength_angstrom == pytest.approx(1.54184, abs=1e-12)
    assert alpha1.radiation.wavelength_angstrom == pytest.approx(1.54056, abs=1e-12)
    assert "weighted average" in average.radiation.label
    assert alpha1.radiation.label == "Cu Kα1"
    assert average.reflections[0].two_theta_deg > alpha1.reflections[0].two_theta_deg


def test_silicon_cubic_reflection_matches_independent_bragg_law(silicon_cif: str) -> None:
    result = calculate_pattern(silicon_cif, settings("CuKa1"), direct_metadata=DirectCIFMetadata(source_id="silicon"))
    reflection = next(item for item in result.reflections if any((h.h, h.k, h.l) == (1, 1, 1) for h in item.hkls))
    independent_d = result.lattice.a_angstrom / math.sqrt(3)
    assert reflection.d_angstrom == pytest.approx(independent_d, abs=2e-5)
    assert reflection.two_theta_deg == pytest.approx(bragg_two_theta(independent_d, 1.54056), abs=2e-4)


def test_max_like_hexagonal_fixture_matches_analytical_d_and_bragg_law() -> None:
    cif = (FIXTURES / "ti3alc2.cif").read_text(encoding="utf-8")
    result = calculate_pattern(cif, settings("CuKa1"), direct_metadata=DirectCIFMetadata(source_id="ti3alc2-stage6"))
    candidates = [(reflection, hkl) for reflection in result.reflections for hkl in reflection.hkls if (hkl.h, hkl.k, hkl.l) != (0, 0, 0)]
    reflection, hkl = candidates[0]
    inverse_d_squared = 4 / 3 * (hkl.h**2 + hkl.h*hkl.k + hkl.k**2) / result.lattice.a_angstrom**2 + hkl.l**2 / result.lattice.c_angstrom**2
    independent_d = 1 / math.sqrt(inverse_d_squared)
    assert reflection.d_angstrom == pytest.approx(independent_d, abs=3e-5)
    assert reflection.two_theta_deg == pytest.approx(bragg_two_theta(independent_d, 1.54056), abs=3e-4)
    assert result.crystal_system == "hexagonal"


def test_same_exact_wavelength_is_deterministic(silicon_cif: str) -> None:
    explicit = PatternSettings(radiation=RadiationInput(wavelength_angstrom=1.54056), two_theta_range=TwoThetaRange(min_deg=5, max_deg=100))
    first = calculate_pattern(silicon_cif, explicit, direct_metadata=DirectCIFMetadata(source_id="silicon"))
    second = calculate_pattern(silicon_cif, explicit, direct_metadata=DirectCIFMetadata(source_id="silicon"))
    assert [item.two_theta_deg for item in first.reflections] == pytest.approx([item.two_theta_deg for item in second.reflections], abs=1e-12)


def test_seeded_max_like_golden_pipeline_recovers_a_and_c() -> None:
    cif = (FIXTURES / "ti3alc2.cif").read_text(encoding="utf-8")
    reference = calculate_pattern(cif, settings("CuKa1"), direct_metadata=DirectCIFMetadata(source_id="ti3alc2-stage6"))
    true_a, true_c, wavelength = reference.lattice.a_angstrom * 1.002, reference.lattice.c_angstrom * 0.9985, 1.54056
    usable = []
    for index, reflection in enumerate(reference.reflections):
        if not (12 < reflection.two_theta_deg < 82) or len(reflection.hkls) != 1 or reflection.relative_intensity < 7:
            continue
        hkl = reflection.hkls[0]
        inv_d2 = 4 / 3 * (hkl.h**2 + hkl.h*hkl.k + hkl.k**2) / true_a**2 + hkl.l**2 / true_c**2
        center = bragg_two_theta(1 / math.sqrt(inv_d2), wavelength)
        if all(abs(center - previous[1]) > 0.45 for previous in usable):
            usable.append((index, center, reflection.relative_intensity))
    usable = usable[:10]
    assert len(usable) >= 5
    x = np.linspace(10, 85, 7501)
    rng = np.random.default_rng(20260925)
    y = 80 + 0.55*x + 18*np.exp(-0.5*((x-48)/10)**2) + rng.normal(0, 0.8, x.size)
    model = PseudoVoigtModel()
    for _, center, intensity in usable:
        y += model.eval(x=x, center=center, sigma=0.07, amplitude=25 + intensity*1.8, fraction=0.45)
    raw = "\n".join(f"{angle:.5f} {intensity:.7f}" for angle, intensity in zip(x, y)).encode()
    parsed = generic_text_parser.parse(raw, "ti3alc2-golden.xy", "text/plain", XRDParserOverride())
    processed = process_measurement(XRDProcessRequest(parent_measurement_id=parsed.measurement.measurement_id, raw_artifact_sha256=parsed.raw_artifact.sha256, two_theta_deg=parsed.measurement.two_theta_deg, intensity=parsed.measurement.intensity, processing_config=XRDProcessingConfig(baseline=XRDBaselineConfig(enabled=True, algorithm="arpls", lam=1e6), smoothing=XRDSmoothingConfig(enabled=True, window_length=9, polynomial_order=3))))
    detection_config = XRDPeakDetectionConfig(minimum_prominence=15, minimum_distance_deg=0.35, minimum_width_deg=0.05, maximum_width_deg=0.5)
    detected = detect_peaks(XRDPeakDetectionRequest(processed_representation_id=processed.processed_representation_id, two_theta_deg=processed.two_theta_deg, analysis_intensity=processed.analysis_intensity, detection_config=detection_config))
    fitted = fit_peaks(XRDPeakFitRequest(parent_processed_representation_id=processed.processed_representation_id, parent_measurement_id=parsed.measurement.measurement_id, raw_artifact_sha256=parsed.raw_artifact.sha256, two_theta_deg=processed.two_theta_deg, analysis_intensity=processed.analysis_intensity, detection_config=detection_config, fitting_config=XRDPeakFittingConfig(), candidates=detected.candidates))
    matched = match_reference_peaks(XRDReferenceMatchingRequest(peak_analysis=fitted, reference_pattern=reference, experimental_wavelength_angstrom=wavelength, config=XRDReferenceMatchConfig(maximum_delta_two_theta_deg=0.3)))
    refined = refine_lattice(XRDLatticeRefinementRequest(matching_result=matched, reference_lattice=reference.lattice, crystal_system="hexagonal", config=XRDLatticeRefinementConfig()))
    recovered = {item.name: item.refined_value for item in refined.parameters}
    assert parsed.measurement.characterization.point_count == 7501
    assert len([peak for peak in fitted.fitted_peaks if peak.diagnostics.success]) >= 5
    assert len(refined.included_match_ids) >= 4
    assert recovered["a"] == pytest.approx(true_a, abs=0.002)
    assert recovered["c"] == pytest.approx(true_c, abs=0.015)
    assert refined.diagnostics.rms_delta_two_theta_deg < 0.03
