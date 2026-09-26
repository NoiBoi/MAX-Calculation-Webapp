from pathlib import Path

import pytest

from maxcalc_science.errors import ScientificError
from maxcalc_science.models import DirectCIFMetadata, DirectCIFPatternRequest, RadiationInput, TwoThetaRange
from maxcalc_science.xrd import calculate_pattern, parse_cif


FIXTURES = Path(__file__).parent / "fixtures"


def request(cif: str, *, wavelength: float | None = None, minimum: float = 10, maximum: float = 90):
    radiation = RadiationInput(wavelength_angstrom=wavelength) if wavelength else RadiationInput(preset="CuKa")
    return DirectCIFPatternRequest(
        cif_content=cif,
        metadata=DirectCIFMetadata(source_id="local-test.cif"),
        radiation=radiation,
        two_theta_range=TwoThetaRange(min_deg=minimum, max_deg=maximum),
    )


@pytest.mark.parametrize("fixture", ["silicon.cif", "sodium-chloride.cif", "zinc-oxide.cif"])
def test_local_cifs_parse_and_calculate(fixture: str):
    cif = (FIXTURES / fixture).read_text(encoding="utf-8")
    result = calculate_pattern(cif, request(cif), direct_metadata=DirectCIFMetadata(source_id=fixture))
    assert result.reflections
    assert [peak.two_theta_deg for peak in result.reflections] == sorted(peak.two_theta_deg for peak in result.reflections)
    assert max(peak.relative_intensity for peak in result.reflections) == pytest.approx(100.0)
    assert all(0 <= peak.relative_intensity <= 100 and peak.d_angstrom > 0 for peak in result.reflections)
    assert all(peak.hkls and peak.hkls[0].multiplicity for peak in result.reflections)
    assert result.lattice.a_angstrom > 0
    assert result.crystal_system
    assert result.space_group
    assert result.reference.source_type == "user-cif"
    assert len(result.reference.cif_sha256) == 64


@pytest.mark.parametrize("invalid", ["not a CIF", "data_empty\n_cell_length_a 5"])
def test_malformed_or_incomplete_cif_is_rejected(invalid: str):
    with pytest.raises(ScientificError, match="could not be parsed") as error:
        parse_cif(invalid)
    assert error.value.code == "CIF_PARSE_FAILED"


def test_wavelength_shift_is_consistent_with_bragg_law(silicon_cif: str):
    short = calculate_pattern(
        silicon_cif, request(silicon_cif, wavelength=1.0), direct_metadata=DirectCIFMetadata(source_id="silicon")
    )
    long = calculate_pattern(
        silicon_cif, request(silicon_cif, wavelength=1.5406), direct_metadata=DirectCIFMetadata(source_id="silicon")
    )
    assert long.reflections[0].two_theta_deg > short.reflections[0].two_theta_deg


def test_two_theta_range_filters_reflections(silicon_cif: str):
    result = calculate_pattern(
        silicon_cif,
        request(silicon_cif, minimum=40, maximum=70),
        direct_metadata=DirectCIFMetadata(source_id="silicon"),
    )
    assert result.reflections
    assert all(40 <= peak.two_theta_deg <= 70 for peak in result.reflections)


def test_calculation_is_deterministic_for_scientific_values(silicon_cif: str):
    first = calculate_pattern(silicon_cif, request(silicon_cif), direct_metadata=DirectCIFMetadata(source_id="silicon"))
    second = calculate_pattern(silicon_cif, request(silicon_cif), direct_metadata=DirectCIFMetadata(source_id="silicon"))
    assert first.reflections == second.reflections
    assert first.lattice == second.lattice
    assert first.radiation == second.radiation
    assert first.calculation_provenance.input_cif_sha256 == second.calculation_provenance.input_cif_sha256


def test_invalid_numeric_inputs_are_rejected():
    with pytest.raises(ValueError):
        RadiationInput(wavelength_angstrom=-1)
    with pytest.raises(ValueError):
        TwoThetaRange(min_deg=80, max_deg=20)

