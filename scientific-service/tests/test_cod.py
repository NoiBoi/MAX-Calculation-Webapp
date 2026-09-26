from datetime import UTC, datetime

import httpx
import pytest

from maxcalc_science.cod import CODAdapter
from maxcalc_science.errors import ScientificError
from maxcalc_science.models import CODSearchRequest


RAW_ENTRY = {
    "file": "7221324",
    "a": "3.072", "b": "3.072", "c": "18.73",
    "alpha": "90", "beta": "90", "gamma": "120",
    "sg": "P 63/m m c", "chemname": "Ti3 Al C2", "formula": "- C2 Al Ti3 -",
    "authors": "Zhou, Y.C.; Wang, X.H.", "title": "Electronic and structural properties",
    "journal": "Journal of Materials Chemistry", "year": "2001", "volume": "11",
    "firstpage": "2335", "lastpage": "2339", "doi": None,
    "flags": "has coordinates", "svnrevision": "176429",
}


def adapter(handler):
    return CODAdapter(
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        clock=lambda: datetime(2026, 9, 25, tzinfo=UTC),
    )


def test_cod_search_normalizes_successful_response():
    def respond(request):
        assert request.url.params["formula"] == "C2 Al Ti3"
        return httpx.Response(200, json=[RAW_ENTRY])

    service = adapter(respond)
    result = service.search(CODSearchRequest(formula="Ti3AlC2"))
    assert len(result) == 1
    assert result[0].source_id == "7221324"
    assert result[0].formula == "Ti3AlC2"
    assert result[0].lattice.c_angstrom == pytest.approx(18.73)
    assert result[0].publication.year == 2001


def test_cod_search_tolerates_missing_optional_fields():
    service = adapter(lambda request: httpx.Response(200, json=[{"file": "1000000", "formula": "- Si -"}]))
    result = service.search(CODSearchRequest(cod_id="1000000"))
    assert result[0].lattice is None
    assert result[0].space_group is None


def test_cod_network_error_is_structured():
    def fail(request):
        raise httpx.ConnectError("offline", request=request)

    with pytest.raises(ScientificError) as error:
        adapter(fail).search(CODSearchRequest(cod_id="7221324"))
    assert error.value.code == "COD_UNAVAILABLE"


def test_invalid_cod_id_is_rejected_by_schema():
    with pytest.raises(ValueError):
        CODSearchRequest(cod_id="123")


def test_failed_cif_retrieval_is_rejected():
    service = adapter(lambda request: httpx.Response(200, text="<html>not a cif</html>", headers={"content-type": "text/html"}))
    with pytest.raises(ScientificError) as error:
        service.get_cif("7221324")
    assert error.value.code == "CIF_RETRIEVAL_FAILED"


def test_cif_retrieval_is_cached(silicon_cif: str):
    calls = 0

    def respond(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, text=silicon_cif, headers={"content-type": "chemical/x-cif"})

    service = adapter(respond)
    first = service.get_cif("7221324", "176429")
    second = service.get_cif("7221324", "176429")
    assert first == second
    assert calls == 1


def test_current_search_revision_uses_cod_latest_url(silicon_cif: str):
    requested_urls = []

    def respond(request):
        requested_urls.append(str(request.url))
        return httpx.Response(200, text=silicon_cif, headers={"content-type": "chemical/x-cif"})

    service = adapter(respond)
    entry = service._normalize_search_result(RAW_ENTRY)
    record = service.get_entry_cif(entry, "176429")
    assert requested_urls == ["https://www.crystallography.net/cod/7221324.cif"]
    assert record.revision == "176429"
