"""Offline, deterministic Stage 6 XRD performance profile.

Run from the repository root with:
scientific-service/.venv/Scripts/python scientific-service/scripts/profile_xrd_stage6.py
"""
from __future__ import annotations

import time
import numpy as np

from maxcalc_science.experimental_xrd import generic_text_parser
from maxcalc_science.models import XRDParserOverride, XRDProcessRequest, XRDProcessingConfig, XRDBaselineConfig, XRDSmoothingConfig, XRDPeakDetectionRequest, XRDPeakDetectionConfig
from maxcalc_science.peak_analysis import detect_peaks, process_measurement


def milliseconds(operation):
    started = time.perf_counter(); result = operation(); return result, (time.perf_counter() - started) * 1000


for point_count in (5_000, 20_000, 100_000):
    x = np.linspace(10, 90, point_count)
    y = 100 + 0.5*x + 800*np.exp(-0.5*((x-35)/0.12)**2) + 400*np.exp(-0.5*((x-61)/0.25)**2)
    raw = "\n".join(f"{a:.8f} {b:.8f}" for a, b in zip(x, y)).encode()
    _, parse_ms = milliseconds(lambda: generic_text_parser.parse(raw, "profile.xy", "text/plain", XRDParserOverride()))
    smoothing = XRDProcessingConfig(smoothing=XRDSmoothingConfig(enabled=True, window_length=11, polynomial_order=3))
    processed, smoothing_ms = milliseconds(lambda: process_measurement(XRDProcessRequest(parent_measurement_id="profile", raw_artifact_sha256="a"*64, two_theta_deg=x.tolist(), intensity=y.tolist(), processing_config=smoothing)))
    detected, detection_ms = milliseconds(lambda: detect_peaks(XRDPeakDetectionRequest(processed_representation_id=processed.processed_representation_id, two_theta_deg=processed.two_theta_deg, analysis_intensity=processed.analysis_intensity, detection_config=XRDPeakDetectionConfig(minimum_prominence=50))))
    baseline = XRDProcessingConfig(baseline=XRDBaselineConfig(enabled=True, algorithm="arpls", lam=1e5, diff_order=2, max_iter=50, tol=1e-3))
    _, baseline_ms = milliseconds(lambda: process_measurement(XRDProcessRequest(parent_measurement_id="profile", raw_artifact_sha256="a"*64, two_theta_deg=x.tolist(), intensity=y.tolist(), processing_config=baseline)))
    print(f"{point_count}: parse={parse_ms:.1f} ms, smoothing={smoothing_ms:.1f} ms, detection={detection_ms:.1f} ms, arPLS={baseline_ms:.1f} ms, peaks={len(detected.candidates)}")
