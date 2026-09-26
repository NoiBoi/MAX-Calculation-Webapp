from datetime import UTC, datetime
from pathlib import Path

import pytest

from maxcalc_science.errors import ScientificError
from maxcalc_science.experimental_xrd import generic_text_parser
from maxcalc_science.models import ExperimentalXRDParseResponse, XRDParserOverride


FIXTURES = Path(__file__).parent / "fixtures" / "experimental"
NOW = datetime(2026, 9, 25, tzinfo=UTC)


def parse(name: str, overrides: XRDParserOverride | None = None):
    content = (FIXTURES / name).read_bytes()
    return generic_text_parser.parse(content, name, "text/plain", overrides or XRDParserOverride(), clock=lambda: NOW)


@pytest.mark.parametrize(("name", "angles", "intensities", "delimiter"), [
    ("header.csv", [10.0, 10.5, 11.0], [100.0, 250.0, 125.0], "comma"),
    ("tab.tsv", [20.0, 20.02, 20.04], [100.0, 250.0, 125.0], "tab"),
    ("comments.xy", [30.0, 30.1, 30.2], [10.0, 15.0, 11.0], "whitespace"),
])
def test_known_fixture_preserves_every_numerical_value(name, angles, intensities, delimiter):
    result = parse(name)
    assert result.measurement.two_theta_deg == angles
    assert result.measurement.intensity == intensities
    assert result.measurement.parser_provenance.delimiter == delimiter


def test_manual_column_selection_changes_interpretation_not_raw_hash():
    automatic = parse("manual-columns.csv")
    manual = parse("manual-columns.csv", XRDParserOverride(two_theta_column=0, intensity_column=1))
    assert automatic.measurement.two_theta_deg == [5.0, 5.1, 5.2]
    assert manual.measurement.two_theta_deg == [0.0, 1.0, 2.0]
    assert automatic.raw_artifact.sha256 == manual.raw_artifact.sha256
    serialized = ExperimentalXRDParseResponse.model_validate_json(manual.model_dump_json())
    assert serialized.measurement.parser_provenance.user_overrides["twoThetaColumn"] == 0


def test_exact_bytes_define_identity_not_filename_or_configuration():
    content = b"10 1\n11 2\n"
    first = generic_text_parser.parse(content, "first.xy", None, XRDParserOverride(), clock=lambda: NOW)
    renamed = generic_text_parser.parse(content, "renamed.txt", None, XRDParserOverride(two_theta_column=1, intensity_column=0), clock=lambda: NOW)
    changed = generic_text_parser.parse(content + b"\n", "first.xy", None, XRDParserOverride(), clock=lambda: NOW)
    assert first.raw_artifact.sha256 == renamed.raw_artifact.sha256
    assert first.raw_artifact.artifact_id == renamed.raw_artifact.artifact_id
    assert first.raw_artifact.sha256 != changed.raw_artifact.sha256


@pytest.mark.parametrize(("content", "codes"), [
    (b"3 1\n2 2\n1 3\n", {"DESCENDING_TWO_THETA"}),
    (b"1 1\n1 2\n2 3\n", {"DUPLICATE_TWO_THETA", "NON_MONOTONIC_TWO_THETA"}),
    (b"1 1\n2 2\n4 3\n", {"IRREGULAR_SPACING"}),
    (b"1 -1\n2 2\n", {"NEGATIVE_INTENSITY"}),
])
def test_characterization_warnings_preserve_unusual_data(content, codes):
    result = generic_text_parser.parse(content, "warning.xy", None, XRDParserOverride(), clock=lambda: NOW)
    assert codes <= {issue.code for issue in result.measurement.validation_issues}
    assert result.measurement.validation_status == "warning"


def test_malformed_data_region_row_is_reported_with_line_reason():
    result = parse("malformed.txt")
    issue = next(issue for issue in result.measurement.validation_issues if issue.code == "REJECTED_NUMERICAL_ROWS")
    assert result.measurement.two_theta_deg == [40.0, 40.2]
    assert result.measurement.characterization.rejected_numerical_row_count == 1
    assert issue.representative_rows[0].line_number == 3
    assert issue.representative_rows[0].reason == "selected value is not numerical"


def test_bom_blank_lines_scientific_notation_and_extra_columns():
    content = b"\xef\xbb\xbfangle counts meta\n\n1.0e1 2.0e2 sample\n1.1e1 3.0e2 sample\n"
    result = generic_text_parser.parse(content, "bom.dat", None, XRDParserOverride(), clock=lambda: NOW)
    assert result.measurement.two_theta_deg == [10.0, 11.0]
    assert result.measurement.intensity == [200.0, 300.0]
    assert result.measurement.parser_provenance.text_encoding == "utf-8-sig"


def test_unnamed_text_metadata_column_does_not_displace_numeric_columns():
    content = b"sample-a 12.0 90\nsample-a 12.1 120\nsample-a 12.2 95\n"
    result = generic_text_parser.parse(content, "metadata.xy", None, XRDParserOverride(), clock=lambda: NOW)
    assert result.measurement.two_theta_deg == [12.0, 12.1, 12.2]
    assert result.measurement.intensity == [90.0, 120.0, 95.0]
    assert result.measurement.parser_provenance.two_theta_column.index == 1


@pytest.mark.parametrize(("content", "code"), [
    (b"", "XRD_EMPTY_FILE"),
    (b"angle intensity\n1 2\n", "XRD_INSUFFICIENT_DATA"),
    (b"nothing useful\njust words\n", "XRD_NO_NUMERICAL_DATA"),
    (b"1 NaN\n2 3\n", "XRD_NON_FINITE_DATA"),
    (b"\x00\x01vendor raw", "XRD_UNSUPPORTED_BINARY"),
])
def test_unsafe_or_unrepresentable_files_are_structured_errors(content, code):
    with pytest.raises(ScientificError) as caught:
        generic_text_parser.parse(content, "bad.raw", None, XRDParserOverride(), clock=lambda: NOW)
    assert caught.value.code == code


def test_decimal_comma_is_supported_with_safe_semicolon_delimiter():
    content = "angle;intensity\n10,5;100,25\n11,0;200,5\n".encode()
    result = generic_text_parser.parse(content, "decimal-comma.txt", None, XRDParserOverride(delimiter="semicolon", decimal_convention="comma"), clock=lambda: NOW)
    assert result.measurement.two_theta_deg == [10.5, 11.0]
    assert result.measurement.intensity == [100.25, 200.5]
