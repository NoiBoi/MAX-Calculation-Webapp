from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient
from lmfit.models import PseudoVoigtModel
from pydantic import ValidationError

from maxcalc_science.errors import ScientificError
from maxcalc_science.main import app
from maxcalc_science.models import (
    XRDPeakCandidate, XRDPeakDetectionRequest, XRDPeakFitRequest, XRDProcessRequest, XRDSmoothingConfig,
)
from maxcalc_science.peak_analysis import detect_peaks, fit_peaks, process_measurement

HASH = "a" * 64


def profile(x: np.ndarray, center: float, fwhm: float, amplitude: float, fraction: float = 0.5) -> np.ndarray:
    model = PseudoVoigtModel()
    return np.asarray(model.eval(x=x, center=center, sigma=fwhm / 2, amplitude=amplitude, fraction=fraction))


def processing_request(x: np.ndarray, y: np.ndarray, baseline: dict | None = None, smoothing: dict | None = None) -> XRDProcessRequest:
    return XRDProcessRequest(
        parentMeasurementId="measurement-1", rawArtifactSha256=HASH, twoThetaDeg=x.tolist(), intensity=y.tolist(),
        processingConfig={"baseline": {"enabled": baseline is not None, **(baseline or {})}, "smoothing": {"enabled": smoothing is not None, **(smoothing or {})}},
    )


def candidate(center: float, index: int, width: float = 0.2, status: str = "AUTO") -> XRDPeakCandidate:
    return XRDPeakCandidate(
        candidateId=f"candidate-{index}", approximateTwoThetaDeg=center, approximateIntensity=100,
        prominence=50, estimatedWidthDeg=width, sourceIndex=index, detectionConfigId="config", status=status,
    )


def fit_request(x: np.ndarray, y: np.ndarray, candidates: list[XRDPeakCandidate], **fitting: object) -> XRDPeakFitRequest:
    return XRDPeakFitRequest(
        parentProcessedRepresentationId="processed-1", parentMeasurementId="measurement-1", rawArtifactSha256=HASH,
        twoThetaDeg=x.tolist(), analysisIntensity=y.tolist(), detectionConfig={"minimumProminence": 1},
        fittingConfig=fitting, candidates=candidates,
    )


def test_processing_disabled_is_exact_and_does_not_mutate_inputs() -> None:
    x = np.linspace(10, 20, 101); y = np.sin(x) + 4; original = y.copy()
    result = process_measurement(processing_request(x, y))
    assert result.analysis_intensity == y.tolist()
    assert result.raw_intensity == y.tolist()
    assert result.transformation_order == ["raw"]
    assert result.estimated_baseline is None and result.smoothed_intensity is None
    np.testing.assert_array_equal(y, original)


@pytest.mark.parametrize("algorithm", ["arpls", "asls"])
def test_baseline_methods_are_finite_deterministic_and_record_diagnostics(algorithm: str) -> None:
    x = np.linspace(10, 50, 1001); y = 4 + 0.08 * x + profile(x, 30, 0.25, 40)
    config = {"algorithm": algorithm, "lam": 1e6, "maxIter": 100}
    first = process_measurement(processing_request(x, y, baseline=config))
    second = process_measurement(processing_request(x, y, baseline=config))
    assert first.estimated_baseline == second.estimated_baseline
    assert len(first.estimated_baseline or []) == x.size
    assert np.all(np.isfinite(first.estimated_baseline))
    assert first.diagnostics.baseline_algorithm == algorithm
    assert first.transformation_order == ["raw", "baseline-subtraction"]


def test_baseline_handles_broad_curvature_with_narrow_peaks() -> None:
    x = np.linspace(10, 80, 2001); baseline = 3 + 0.002 * (x - 45) ** 2
    y = baseline + profile(x, 30, 0.18, 35) + profile(x, 55, 0.3, 50)
    result = process_measurement(processing_request(x, y, baseline={"algorithm": "arpls", "lam": 1e7}))
    estimate = np.asarray(result.estimated_baseline)
    # arPLS is not a ground-truth baseline oracle; this bound catches a grossly
    # wrong integration while allowing its expected curvature bias.
    assert np.median(np.abs(estimate - baseline)) < 0.8


def test_savgol_valid_and_preserves_parent_arrays() -> None:
    rng = np.random.default_rng(42); x = np.linspace(20, 40, 501); y = profile(x, 30, 0.3, 50) + rng.normal(0, 0.4, x.size)
    result = process_measurement(processing_request(x, y, smoothing={"enabled": True, "windowLength": 11, "polynomialOrder": 3}))
    assert result.raw_intensity == y.tolist()
    assert result.analysis_intensity == result.smoothed_intensity
    assert np.std(np.diff(result.analysis_intensity)) < np.std(np.diff(y))


@pytest.mark.parametrize("config", [{"windowLength": 10}, {"windowLength": 5, "polynomialOrder": 5}])
def test_invalid_savgol_schema_is_rejected(config: dict[str, int]) -> None:
    with pytest.raises(ValidationError):
        XRDSmoothingConfig(enabled=True, **config)


def test_too_large_savgol_window_is_explicit_failure() -> None:
    x = np.linspace(1, 2, 9); y = x.copy()
    with pytest.raises(ScientificError, match="windowLength") as caught:
        process_measurement(processing_request(x, y, smoothing={"enabled": True, "windowLength": 11}))
    assert caught.value.code == "SMOOTHING_FAILED"


def test_irregular_spacing_is_not_silently_resampled_for_smoothing() -> None:
    x = np.array([1, 1.1, 1.21, 1.3, 1.4, 1.5, 1.6]); y = np.arange(x.size, dtype=float)
    with pytest.raises(ScientificError) as caught:
        process_measurement(processing_request(x, y, smoothing={"enabled": True, "windowLength": 5}))
    assert caught.value.code == "SMOOTHING_FAILED"


def test_detects_single_and_multiple_known_peaks() -> None:
    x = np.linspace(20, 50, 3001); y = profile(x, 27, 0.22, 30) + profile(x, 38, 0.35, 55)
    result = detect_peaks(XRDPeakDetectionRequest(processedRepresentationId="p", twoThetaDeg=x.tolist(), analysisIntensity=y.tolist(), detectionConfig={"minimumProminence": 5, "minimumDistanceDeg": 0.2}))
    assert [item.approximate_two_theta_deg for item in result.candidates] == pytest.approx([27, 38], abs=0.011)


def test_detection_prominence_and_distance_are_effective() -> None:
    x = np.linspace(20, 30, 2001); y = profile(x, 25, 0.18, 40) + profile(x, 25.4, 0.15, 8)
    low = detect_peaks(XRDPeakDetectionRequest(processedRepresentationId="p", twoThetaDeg=x.tolist(), analysisIntensity=y.tolist(), detectionConfig={"minimumProminence": 0.5, "minimumDistanceDeg": 0.1}))
    high = detect_peaks(XRDPeakDetectionRequest(processedRepresentationId="p", twoThetaDeg=x.tolist(), analysisIntensity=y.tolist(), detectionConfig={"minimumProminence": 5, "minimumDistanceDeg": 1.0}))
    assert len(low.candidates) == 2
    assert len(high.candidates) == 1


def test_detection_returns_no_candidates_for_flat_pattern() -> None:
    x = np.linspace(20, 30, 101); y = np.ones_like(x)
    result = detect_peaks(XRDPeakDetectionRequest(processedRepresentationId="p", twoThetaDeg=x.tolist(), analysisIntensity=y.tolist(), detectionConfig={"minimumProminence": 1}))
    assert result.candidates == []


def test_irregular_detection_warns_and_retains_original_axis() -> None:
    x = np.linspace(20, 30, 401); x[200:] += np.linspace(0, 0.25, 201); y = profile(x, 25, 0.2, 30)
    result = detect_peaks(XRDPeakDetectionRequest(processedRepresentationId="p", twoThetaDeg=x.tolist(), analysisIntensity=y.tolist(), detectionConfig={"minimumProminence": 1, "minimumWidthDeg": 0.05}))
    assert result.warnings and abs(result.candidates[0].approximate_two_theta_deg - 25) < 0.03


@pytest.mark.parametrize("background", ["constant", "linear"])
def test_single_pseudo_voigt_recovers_center_fwhm_amplitude_and_fraction(background: str) -> None:
    rng = np.random.default_rng(8); x = np.linspace(28, 32, 801)
    y = 5 + (0.15 * x if background == "linear" else 0) + profile(x, 30.123, 0.28, 45, 0.35) + rng.normal(0, 0.05, x.size)
    result = fit_peaks(fit_request(x, y, [candidate(30.10, 400, 0.3)], localBackground=background))
    peak = result.fitted_peaks[0]
    assert peak.diagnostics.success
    assert peak.fitted_center_two_theta_deg == pytest.approx(30.123, abs=0.003)
    assert peak.fwhm_deg == pytest.approx(0.28, abs=0.01)
    assert peak.amplitude == pytest.approx(45, rel=0.03)
    assert peak.fraction == pytest.approx(0.35, abs=0.04)
    assert peak.center_stderr_deg is not None


def test_moderate_noise_and_imperfect_seed_still_recover_center() -> None:
    rng = np.random.default_rng(71); x = np.linspace(30, 34, 501); y = 2 + profile(x, 32, 0.35, 25, 0.7) + rng.normal(0, 0.25, x.size)
    peak = fit_peaks(fit_request(x, y, [candidate(31.9, 240, 0.4)])).fitted_peaks[0]
    assert peak.diagnostics.success and peak.fitted_center_two_theta_deg == pytest.approx(32, abs=0.015)


def test_two_overlapping_peaks_are_fit_as_one_group() -> None:
    rng = np.random.default_rng(22); x = np.linspace(29, 32, 1201)
    y = 3 + 0.05 * x + profile(x, 30.2, 0.28, 30, 0.4) + profile(x, 30.62, 0.24, 24, 0.6) + rng.normal(0, 0.03, x.size)
    result = fit_peaks(fit_request(x, y, [candidate(30.19, 480, 0.3), candidate(30.63, 650, 0.25)]))
    assert len(result.fit_groups) == 1 and len(result.fit_groups[0].candidate_ids) == 2
    centers = [item.fitted_center_two_theta_deg for item in result.fitted_peaks]
    assert centers == pytest.approx([30.2, 30.62], abs=0.015)


def test_three_peak_overlap_is_bounded_and_retains_components() -> None:
    x = np.linspace(29, 32, 1401); truths = [30.0, 30.35, 30.7]
    y = 2 + sum((profile(x, center, 0.24, 20 - index * 2) for index, center in enumerate(truths)), start=np.zeros_like(x))
    result = fit_peaks(fit_request(x, y, [candidate(center, 400 + i * 150, 0.25) for i, center in enumerate(truths)]))
    assert len(result.fit_groups) == 1
    assert len(result.fit_groups[0].component_curves) == 3
    assert [item.fitted_center_two_theta_deg for item in result.fitted_peaks] == pytest.approx(truths, abs=0.02)


def test_group_safeguard_splits_more_than_maximum_peaks_and_warns() -> None:
    x = np.linspace(20, 22, 801); y = np.ones_like(x)
    candidates = [candidate(20.5 + i * 0.15, 200 + i * 60, 0.3) for i in range(4)]
    result = fit_peaks(fit_request(x, y, candidates, maximumGroupPeaks=2))
    assert len(result.fit_groups) == 2
    assert any("safeguard" in warning for warning in result.warnings)


def test_insufficient_fit_points_returns_failure_without_nan_success() -> None:
    x = np.linspace(20, 21, 6); y = profile(x, 20.5, 0.2, 10)
    result = fit_peaks(fit_request(x, y, [candidate(20.5, 3, 0.1)]))
    peak = result.fitted_peaks[0]
    assert not peak.diagnostics.success
    assert peak.fitted_center_two_theta_deg is None
    assert "Insufficient" in peak.diagnostics.message


def test_excluded_candidate_is_preserved_but_not_fit() -> None:
    x = np.linspace(20, 30, 501); y = profile(x, 25, 0.2, 10)
    excluded = candidate(25, 250, status="EXCLUDED")
    result = fit_peaks(fit_request(x, y, [excluded]))
    assert result.candidate_peaks == [excluded]
    assert result.excluded_candidate_ids == [excluded.candidate_id]
    assert result.fitted_peaks == []


def test_manual_window_is_used_exactly() -> None:
    x = np.linspace(20, 30, 1001); y = profile(x, 25, 0.2, 10)
    manual = candidate(25, 500, status="MANUAL_EDITED").model_copy(update={"manual_window_min_deg": 24.7, "manual_window_max_deg": 25.4})
    peak = fit_peaks(fit_request(x, y, [manual])).fitted_peaks[0]
    assert peak.fit_window_min_deg == pytest.approx(24.7)
    assert peak.fit_window_max_deg == pytest.approx(25.4)


def test_stage3_api_endpoints_return_versioned_contracts() -> None:
    client = TestClient(app); x = np.linspace(20, 30, 501); y = (2 + profile(x, 25, 0.2, 12)).tolist()
    process_response = client.post("/v1/xrd/data/process", json={"parentMeasurementId": "m", "rawArtifactSha256": HASH, "twoThetaDeg": x.tolist(), "intensity": y, "processingConfig": {"baseline": {"enabled": False}, "smoothing": {"enabled": False}}})
    assert process_response.status_code == 200 and process_response.json()["schemaVersion"] == "1.0.0"
    processed = process_response.json()
    detection_response = client.post("/v1/xrd/peaks/detect", json={"processedRepresentationId": processed["processedRepresentationId"], "twoThetaDeg": x.tolist(), "analysisIntensity": y, "detectionConfig": {"minimumProminence": 1}})
    assert detection_response.status_code == 200 and len(detection_response.json()["candidates"]) == 1


def test_api_validation_hides_stack_traces() -> None:
    response = TestClient(app).post("/v1/xrd/data/process", json={"parentMeasurementId": "m"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert "Traceback" not in response.text
