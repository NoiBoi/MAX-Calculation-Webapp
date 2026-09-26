from __future__ import annotations

import csv
import hashlib
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import median
from typing import Callable
from uuid import uuid4

import numpy as np

from . import __version__ as service_version
from .errors import ScientificError
from .models import (
    ExperimentalXRDMeasurement,
    ExperimentalXRDParseResponse,
    RawXRDArtifact,
    XRDAcquisitionMetadata,
    XRDColumn,
    XRDDatasetCharacterization,
    XRDParserOverride,
    XRDParserProvenance,
    XRDRejectedRow,
    XRDValidationIssue,
)

COMMENT_PREFIXES = ("#", ";", "//")
DELIMITERS = {"comma": ",", "tab": "\t", "semicolon": ";", "whitespace": None}
ANGLE_NAMES = {"2theta", "twotheta", "2thetadeg", "angle", "angledeg", "twothetadeg"}
INTENSITY_NAMES = {"intensity", "counts", "count", "i", "y", "cps"}


@dataclass(frozen=True)
class DecodedText:
    text: str
    encoding: str
    warnings: tuple[str, ...]


def _safe_filename(filename: str | None) -> str:
    safe = Path((filename or "measurement.txt").replace("\\", "/")).name.strip()
    return (safe or "measurement.txt")[:255]


def _decode(content: bytes) -> DecodedText:
    if not content:
        raise ScientificError("XRD_EMPTY_FILE", "The uploaded XRD file is empty.", 422)
    if b"\x00" in content:
        raise ScientificError("XRD_UNSUPPORTED_BINARY", "The uploaded file appears to be binary. Stage 2 supports text XRD files only.", 415)
    for encoding, label in (("utf-8-sig", "utf-8-sig"), ("utf-8", "utf-8")):
        try:
            return DecodedText(content.decode(encoding), label, ())
        except UnicodeDecodeError:
            pass
    try:
        return DecodedText(content.decode("cp1252"), "windows-1252", ("Encoding was heuristically decoded as Windows-1252.",))
    except UnicodeDecodeError as exc:
        raise ScientificError("XRD_DECODE_FAILED", "The uploaded XRD text could not be decoded as UTF-8 or Windows-1252.", 422) from exc


def _split(line: str, delimiter: str) -> list[str]:
    symbol = DELIMITERS[delimiter]
    if symbol is None:
        return re.findall(r"\S+", line.strip())
    return next(csv.reader([line], delimiter=symbol, skipinitialspace=True))


def _number(value: str, decimal_convention: str) -> float:
    cleaned = value.strip()
    if decimal_convention == "comma":
        cleaned = cleaned.replace(".", "").replace(",", ".")
    return float(cleaned)


def _numeric_count(tokens: list[str], decimal_convention: str) -> int:
    count = 0
    for token in tokens:
        try:
            _number(token, decimal_convention)
            count += 1
        except ValueError:
            pass
    return count


def _detect_delimiter(lines: list[str], decimal_convention: str) -> tuple[str, str]:
    candidates: list[tuple[int, int, int, str]] = []
    for name in DELIMITERS:
        widths: list[int] = []
        numerical = 0
        for line in lines[:200]:
            stripped = line.strip()
            if not stripped or stripped.startswith(COMMENT_PREFIXES):
                continue
            tokens = _split(line, name)
            count = _numeric_count(tokens, decimal_convention)
            if count >= 2:
                widths.append(len(tokens))
                numerical += 1
        consistency = widths.count(median(widths)) if widths else 0
        symbol = DELIMITERS[name]
        explicit_matches = sum(1 for line in lines[:200] if symbol is not None and symbol in line)
        candidates.append((numerical, consistency, explicit_matches, name))
    candidates.sort(reverse=True)
    numerical, consistency, _explicit_matches, name = candidates[0]
    if numerical == 0:
        raise ScientificError("XRD_NO_NUMERICAL_DATA", "No rows with at least two numerical values were found.", 422)
    confidence = "high" if numerical >= 3 and consistency / numerical >= 0.8 else "medium" if numerical >= 2 else "low"
    return name, confidence


def _normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower().replace("θ", "theta"))


class GenericDelimitedTextParser:
    parser_id = "maxcalc.generic-delimited-text"
    parser_version = "1.0.0"

    def parse(
        self,
        content: bytes,
        filename: str | None,
        mime_type: str | None,
        overrides: XRDParserOverride,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> ExperimentalXRDParseResponse:
        now = (clock or (lambda: datetime.now(UTC)))()
        safe_filename = _safe_filename(filename)
        digest = hashlib.sha256(content).hexdigest()
        decoded = _decode(content)
        lines = decoded.text.splitlines()
        delimiter, confidence = (overrides.delimiter, "high") if overrides.delimiter else _detect_delimiter(lines, overrides.decimal_convention)
        if delimiter is None:
            raise AssertionError("delimiter detection must return a value")

        first_numeric = None
        first_tokens: list[str] = []
        for index, line in enumerate(lines):
            stripped = line.strip()
            if not stripped or stripped.startswith(COMMENT_PREFIXES):
                continue
            tokens = _split(line, delimiter)
            if _numeric_count(tokens, overrides.decimal_convention) >= 2:
                first_numeric, first_tokens = index, tokens
                break
        if first_numeric is None:
            raise ScientificError("XRD_NO_NUMERICAL_DATA", "No rows with at least two numerical values were found.", 422)
        header_rows = overrides.header_rows if overrides.header_rows is not None else first_numeric
        if header_rows >= len(lines):
            raise ScientificError("XRD_INVALID_HEADER", "The selected header region leaves no data rows.", 422)

        header_names: list[str] = []
        for line in reversed(lines[:header_rows]):
            stripped = line.strip()
            if stripped and not stripped.startswith(COMMENT_PREFIXES):
                candidate = _split(line, delimiter)
                if len(candidate) == len(first_tokens) and _numeric_count(candidate, overrides.decimal_convention) < 2:
                    header_names = [token.strip() or f"Column {i + 1}" for i, token in enumerate(candidate)]
                    break
        width = max(len(first_tokens), len(header_names))
        names = header_names + [f"Column {i + 1}" for i in range(len(header_names), width)]
        normalized = [_normalized_name(name) for name in names]
        angle_named = next((i for i, name in enumerate(normalized) if name in ANGLE_NAMES), None)
        intensity_named = next((i for i, name in enumerate(normalized) if name in INTENSITY_NAMES), None)
        numeric_scores = [0] * width
        for line in lines[header_rows:header_rows + 200]:
            stripped = line.strip()
            if not stripped or stripped.startswith(COMMENT_PREFIXES):
                continue
            for column, token in enumerate(_split(line, delimiter)[:width]):
                try:
                    if math.isfinite(_number(token, overrides.decimal_convention)):
                        numeric_scores[column] += 1
                except ValueError:
                    pass
        numeric_candidates = sorted(range(width), key=lambda column: (-numeric_scores[column], column))
        angle_column = overrides.two_theta_column if overrides.two_theta_column is not None else (angle_named if angle_named is not None else numeric_candidates[0])
        default_intensity = next((column for column in numeric_candidates if column != angle_column), 1 if angle_column != 1 else 0)
        intensity_column = overrides.intensity_column if overrides.intensity_column is not None else (intensity_named if intensity_named is not None else default_intensity)
        if angle_column == intensity_column:
            raise ScientificError("XRD_INVALID_COLUMNS", "2theta and intensity must use different columns.", 422)

        angles: list[float] = []
        intensities: list[float] = []
        rejected: list[XRDRejectedRow] = []
        non_finite_rows: list[int] = []
        for index, line in enumerate(lines[header_rows:], start=header_rows + 1):
            stripped = line.strip()
            if not stripped or stripped.startswith(COMMENT_PREFIXES):
                continue
            tokens = _split(line, delimiter)
            if max(angle_column, intensity_column) >= len(tokens):
                rejected.append(XRDRejectedRow(line_number=index, reason="selected column is missing", excerpt=stripped[:240]))
                continue
            try:
                angle = _number(tokens[angle_column], overrides.decimal_convention)
                intensity = _number(tokens[intensity_column], overrides.decimal_convention)
            except ValueError:
                rejected.append(XRDRejectedRow(line_number=index, reason="selected value is not numerical", excerpt=stripped[:240]))
                continue
            if not math.isfinite(angle) or not math.isfinite(intensity):
                non_finite_rows.append(index)
                continue
            angles.append(angle)
            intensities.append(intensity)
        if non_finite_rows:
            raise ScientificError("XRD_NON_FINITE_DATA", "The selected columns contain NaN or infinite values.", 422, f"Representative lines: {non_finite_rows[:5]}")
        if len(angles) < 2:
            raise ScientificError("XRD_INSUFFICIENT_DATA", "At least two usable numerical points are required.", 422, f"Usable points: {len(angles)}; rejected rows: {len(rejected)}")

        angle_array = np.asarray(angles, dtype=float)
        intensity_array = np.asarray(intensities, dtype=float)
        diffs = np.diff(angle_array)
        duplicates = int(len(angle_array) - len(np.unique(angle_array)))
        if np.all(diffs > 0):
            ordering = "strictly-increasing"
        elif np.all(diffs < 0):
            ordering = "decreasing"
        elif np.all(diffs == 0):
            ordering = "constant"
        else:
            ordering = "non-monotonic"
        nonzero_spacing = np.abs(diffs[diffs != 0])
        median_spacing = float(np.median(nonzero_spacing)) if nonzero_spacing.size else None
        spacing_variation = float(np.max(nonzero_spacing) - np.min(nonzero_spacing)) if nonzero_spacing.size else None

        issues: list[XRDValidationIssue] = []
        def warn(code: str, message: str, rows: list[XRDRejectedRow] | None = None) -> None:
            issues.append(XRDValidationIssue(code=code, severity="warning", message=message, blocking=False, representative_rows=(rows or [])[:5]))
        if rejected:
            warn("REJECTED_NUMERICAL_ROWS", f"{len(rejected)} data-region row(s) were rejected; inspect representative line reasons before import.", rejected)
        if ordering == "decreasing":
            warn("DESCENDING_TWO_THETA", "2theta decreases through the scan. Original order has been preserved.")
        elif ordering in ("non-monotonic", "constant"):
            warn("NON_MONOTONIC_TWO_THETA", "2theta is non-monotonic. Original order has been preserved.")
        if duplicates:
            warn("DUPLICATE_TWO_THETA", f"{duplicates} duplicate 2theta value(s) were preserved.")
        if median_spacing and spacing_variation is not None and spacing_variation > max(1e-9, median_spacing * 0.05):
            warn("IRREGULAR_SPACING", "2theta step spacing varies by more than 5% of the median spacing; values were not resampled.")
        if float(np.min(intensity_array)) < 0:
            warn("NEGATIVE_INTENSITY", "Negative intensity values are present and were preserved.")
        if float(np.min(angle_array)) < 0 or float(np.max(angle_array)) > 180:
            warn("UNUSUAL_TWO_THETA_RANGE", "The 2theta range extends outside 0–180 degrees; values were preserved.")

        parser_warnings = list(decoded.warnings)
        if not overrides.delimiter:
            parser_warnings.append(f"Delimiter was detected heuristically with {confidence} confidence.")
        if not header_names:
            parser_warnings.append("No column-name header was identified; columns were selected by numerical position.")
        override_values = overrides.model_dump(mode="json", by_alias=True, exclude_none=True)
        columns = [XRDColumn(index=i, name=(names[i] if i < len(names) else None)) for i in range(width)]
        artifact_id = f"xrd-artifact-sha256-{digest}"
        provenance = XRDParserProvenance(
            detected_format={"comma": "CSV", "tab": "tab-delimited text", "semicolon": "semicolon-delimited text", "whitespace": "whitespace-delimited text"}[delimiter],
            detection_confidence=confidence,
            text_encoding=decoded.encoding,
            delimiter=delimiter,
            decimal_convention=overrides.decimal_convention,
            header_rows=header_rows,
            comment_prefixes=list(COMMENT_PREFIXES),
            two_theta_column=XRDColumn(index=angle_column, name=names[angle_column] if angle_column < len(names) else None),
            intensity_column=XRDColumn(index=intensity_column, name=names[intensity_column] if intensity_column < len(names) else None),
            user_overrides=override_values,
            warnings=parser_warnings,
            service_version=service_version,
        )
        characterization = XRDDatasetCharacterization(
            point_count=len(angles), min_two_theta_deg=float(np.min(angle_array)), max_two_theta_deg=float(np.max(angle_array)),
            min_intensity=float(np.min(intensity_array)), max_intensity=float(np.max(intensity_array)), all_values_finite=True,
            ordering=ordering, duplicate_two_theta_count=duplicates, median_spacing_deg=median_spacing,
            spacing_variation_deg=spacing_variation, rejected_numerical_row_count=len(rejected),
        )
        artifact = RawXRDArtifact(
            artifact_id=artifact_id, original_filename=safe_filename, byte_length=len(content), mime_type=mime_type or None,
            sha256=digest, imported_at=now,
        )
        measurement = ExperimentalXRDMeasurement(
            measurement_id=str(uuid4()), raw_artifact_id=artifact_id, raw_artifact_sha256=digest,
            source_filename=safe_filename, imported_at=now, acquisition_metadata=XRDAcquisitionMetadata(),
            parser_provenance=provenance, two_theta_deg=angles, intensity=intensities,
            characterization=characterization, validation_status="warning" if issues or parser_warnings else "valid",
            validation_issues=issues,
        )
        return ExperimentalXRDParseResponse(raw_artifact=artifact, measurement=measurement, available_columns=columns)


generic_text_parser = GenericDelimitedTextParser()
