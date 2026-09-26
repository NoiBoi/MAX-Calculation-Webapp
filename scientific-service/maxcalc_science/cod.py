from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable

import httpx
from pymatgen.core import Composition

from .errors import ScientificError
from .models import (
    CODSearchRequest,
    CODSearchResult,
    CrystalLattice,
    PublicationMetadata,
    XRDReferenceMetadata,
)

COD_BASE_URL = "https://www.crystallography.net/cod"
COD_SEARCH_URL = f"{COD_BASE_URL}/result"
MAX_CIF_BYTES = 5_000_000


@dataclass(frozen=True, slots=True)
class CIFRecord:
    content: str
    retrieved_at: datetime
    revision: str | None
    source_url: str


@dataclass(slots=True)
class _CacheEntry:
    value: CIFRecord
    expires_at: float


class CODAdapter:
    """Translate the official COD REST API into MAXCalc domain objects."""

    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        cache_ttl_seconds: int = 3600,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(20.0, connect=8.0),
            follow_redirects=True,
            headers={"User-Agent": "MAXCalc-XRD/0.1 (+https://github.com/)"},
        )
        self._cache_ttl_seconds = cache_ttl_seconds
        self._clock = clock or (lambda: datetime.now(UTC))
        self._cif_cache: dict[str, _CacheEntry] = {}
        self._cache_lock = threading.Lock()

    def search(self, query: CODSearchRequest) -> list[CODSearchResult]:
        params: dict[str, str] = {"format": "json"}
        requested_formula: Composition | None = None
        elements = list(query.required_elements)

        if query.cod_id:
            params["id"] = query.cod_id
        if query.formula:
            try:
                requested_formula = Composition(query.formula)
            except Exception as exc:
                raise ScientificError("INVALID_FORMULA", "The formula could not be interpreted.", 422) from exc
            params["formula"] = requested_formula.hill_formula
            elements = [str(element) for element in requested_formula.elements]
            params["strictmin"] = str(len(elements))
            params["strictmax"] = str(len(elements))
        if elements:
            for index, element in enumerate(elements, start=1):
                if not re.fullmatch(r"[A-Z][a-z]?", element):
                    raise ScientificError("INVALID_ELEMENT", f"Invalid element symbol: {element}", 422)
                params[f"el{index}"] = element
        if query.text:
            params["text"] = query.text
        if query.status_filter in {"any", "theoretical"}:
            params["include_theoretical"] = "1"

        try:
            response = self._client.get(COD_SEARCH_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ScientificError("COD_UNAVAILABLE", "COD did not respond in time. Try again later.", 503) from exc
        except (httpx.HTTPStatusError, ValueError) as exc:
            raise ScientificError("COD_UNAVAILABLE", "COD returned an invalid search response.", 502) from exc

        if not isinstance(payload, list):
            raise ScientificError("COD_UNAVAILABLE", "COD returned an unexpected search response.", 502)

        results: list[CODSearchResult] = []
        for raw in payload:
            if not isinstance(raw, dict):
                continue
            normalized = self._normalize_search_result(raw)
            if normalized is None:
                continue
            if requested_formula is not None and not _same_reduced_composition(normalized.formula, requested_formula):
                continue
            if query.space_group and _compact(normalized.space_group) != _compact(query.space_group):
                continue
            if query.status_filter != "any" and normalized.reference_status != query.status_filter:
                continue
            results.append(normalized)
            if len(results) >= query.limit:
                break
        return results

    def get_entry(self, cod_id: str) -> CODSearchResult:
        results = self.search(CODSearchRequest(cod_id=cod_id, limit=1))
        if not results:
            raise ScientificError("COD_NOT_FOUND", f"COD entry {cod_id} was not found.", 404)
        return results[0]

    def get_cif(self, cod_id: str, revision: str | None = None) -> CIFRecord:
        cache_key = f"{cod_id}@{revision or 'latest'}"
        now = time.monotonic()
        with self._cache_lock:
            cached = self._cif_cache.get(cache_key)
            if cached and cached.expires_at > now:
                return cached.value

        suffix = f".cif@{revision}" if revision else ".cif"
        url = f"{COD_BASE_URL}/{cod_id}{suffix}"
        try:
            response = self._client.get(url)
            if response.status_code == 404:
                raise ScientificError("COD_NOT_FOUND", f"COD entry {cod_id} was not found.", 404)
            response.raise_for_status()
        except ScientificError:
            raise
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ScientificError("COD_UNAVAILABLE", "COD did not respond in time. Try again later.", 503) from exc
        except httpx.HTTPStatusError as exc:
            raise ScientificError("COD_UNAVAILABLE", "COD could not provide the requested CIF.", 502) from exc

        if len(response.content) > MAX_CIF_BYTES:
            raise ScientificError("CIF_RETRIEVAL_FAILED", "The COD CIF exceeds the 5 MB safety limit.", 502)
        content = response.text
        content_type = response.headers.get("content-type", "").lower()
        if "html" in content_type or not re.search(r"(?mi)^\s*data_", content):
            raise ScientificError("CIF_RETRIEVAL_FAILED", "COD returned content that is not a CIF.", 502)

        record = CIFRecord(content, self._clock(), revision, url)
        with self._cache_lock:
            self._cif_cache[cache_key] = _CacheEntry(record, now + self._cache_ttl_seconds)
        return record

    def get_entry_cif(self, entry: CODSearchResult, requested_revision: str | None = None) -> CIFRecord:
        revision = requested_revision or entry.source_revision
        historical_revision = revision if revision and revision != entry.source_revision else None
        record = self.get_cif(entry.source_id, historical_revision)
        if historical_revision is None and revision:
            return CIFRecord(record.content, record.retrieved_at, revision, record.source_url)
        return record

    @staticmethod
    def reference_metadata(entry: CODSearchResult, cif: CIFRecord, cif_sha256: str) -> XRDReferenceMetadata:
        return XRDReferenceMetadata(
            source_type="cod",
            source_id=entry.source_id,
            formula=entry.formula,
            phase_name=entry.phase_name,
            space_group=entry.space_group,
            publication=entry.publication,
            doi=entry.doi,
            reference_status=entry.reference_status,
            retrieved_at=cif.retrieved_at,
            source_revision=cif.revision or entry.source_revision,
            cif_sha256=cif_sha256,
            source_url=cif.source_url,
        )

    @staticmethod
    def _normalize_search_result(raw: dict[str, Any]) -> CODSearchResult | None:
        source_id = _text(raw.get("file"))
        if not source_id or not re.fullmatch(r"\d{7}", source_id):
            return None
        formula = _normalize_formula(_text(raw.get("formula")) or _text(raw.get("calcformula")) or "Unknown")
        lattice = _lattice(raw)
        phase_name = _text(raw.get("commonname")) or _text(raw.get("mineral")) or _text(raw.get("chemname"))
        first_page, last_page = _text(raw.get("firstpage")), _text(raw.get("lastpage"))
        pages = first_page if first_page and not last_page else f"{first_page}-{last_page}" if first_page else None
        year = _int_or_none(raw.get("year"))
        publication = PublicationMetadata(
            title=_text(raw.get("title")),
            authors=_text(raw.get("authors")),
            journal=_text(raw.get("journal")),
            year=year,
            volume=_text(raw.get("volume")),
            pages=pages,
        )
        if not any(publication.model_dump().values()):
            publication = None
        status_text = " ".join(
            filter(None, (_text(raw.get("flags")), _text(raw.get("method")), _text(raw.get("status"))))
        ).lower()
        if "theor" in status_text or "calculated" in status_text:
            status = "theoretical"
        elif _text(raw.get("method")) or _text(raw.get("radiation")) or "fobs" in status_text or "iobs" in status_text:
            status = "experimental"
        else:
            status = "unknown"
        return CODSearchResult(
            source_id=source_id,
            formula=formula,
            phase_name=phase_name,
            space_group=_text(raw.get("sg")),
            lattice=lattice,
            publication=publication,
            doi=_text(raw.get("doi")),
            reference_status=status,
            source_revision=_text(raw.get("svnrevision")),
        )


def _normalize_formula(value: str) -> str:
    stripped = value.replace("-", " ").strip()
    try:
        return Composition(stripped).reduced_formula
    except Exception:
        return " ".join(stripped.split()) or "Unknown"


def _same_reduced_composition(candidate: str, expected: Composition) -> bool:
    try:
        return Composition(candidate).reduced_composition.almost_equals(expected.reduced_composition)
    except Exception:
        return False


def _lattice(raw: dict[str, Any]) -> CrystalLattice | None:
    try:
        values = [float(raw[key]) for key in ("a", "b", "c", "alpha", "beta", "gamma")]
        return CrystalLattice(
            a_angstrom=values[0], b_angstrom=values[1], c_angstrom=values[2],
            alpha_deg=values[3], beta_deg=values[4], gamma_deg=values[5],
        )
    except (KeyError, TypeError, ValueError):
        return None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _compact(value: str | None) -> str:
    return re.sub(r"\s+", "", value or "").lower()
