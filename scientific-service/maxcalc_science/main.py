from __future__ import annotations

import os
import json
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import __version__
from .cod import CODAdapter
from .errors import ScientificError
from .models import (
    CODPatternRequest,
    CODSearchRequest,
    CODSearchResponse,
    CalculatedXRDPattern,
    DirectCIFPatternRequest,
    ErrorResponse,
    ExperimentalXRDParseResponse,
    ProcessedXRDRepresentation,
    XRDPeakAnalysis,
    XRDPeakDetectionRequest,
    XRDPeakDetectionResult,
    XRDPeakFitRequest,
    XRDProcessRequest,
    XRDParserOverride,
    XRDLatticeRefinementRequest,
    XRDLatticeRefinementResult,
    XRDReferenceMatchingRequest,
    XRDReferenceMatchingResult,
)
from .experimental_xrd import generic_text_parser
from .peak_analysis import detect_peaks, fit_peaks, process_measurement
from .reference_analysis import match_reference_peaks, refine_lattice
from .xrd import calculate_pattern, cif_sha256

app = FastAPI(
    title="MAXCalc Scientific Service",
    version=__version__,
    description="Versioned crystallographic computation boundary for MAXCalc.",
)
cod = CODAdapter()


def authorize(x_service_token: Annotated[str | None, Header()] = None) -> None:
    configured = os.environ.get("MAXCALC_SERVICE_TOKEN")
    if configured and (x_service_token is None or not secrets.compare_digest(x_service_token, configured)):
        raise ScientificError("UNAUTHORIZED", "The scientific service rejected the request.", 401)


@app.exception_handler(ScientificError)
def scientific_error_handler(_request: Request, exc: ScientificError) -> JSONResponse:
    body = ErrorResponse(error={"code": exc.code, "message": exc.message, "detail": exc.detail})
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(mode="json", by_alias=True))


@app.exception_handler(RequestValidationError)
def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    body = ErrorResponse(error={
        "code": "INVALID_REQUEST",
        "message": "The scientific request is invalid.",
        "detail": "; ".join(error["msg"] for error in exc.errors())[:1000],
    })
    return JSONResponse(status_code=422, content=body.model_dump(mode="json", by_alias=True))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "serviceVersion": __version__}


@app.post("/v1/xrd/references/search", response_model=CODSearchResponse, dependencies=[Depends(authorize)])
def search_cod(request: CODSearchRequest) -> CODSearchResponse:
    return CODSearchResponse(results=cod.search(request))


@app.post(
    "/v1/xrd/references/cod/{cod_id}/pattern",
    response_model=CalculatedXRDPattern,
    dependencies=[Depends(authorize)],
)
def calculate_cod_pattern(cod_id: str, request: CODPatternRequest) -> CalculatedXRDPattern:
    if len(cod_id) != 7 or not cod_id.isdigit():
        raise ScientificError("COD_NOT_FOUND", "A valid seven-digit COD ID is required.", 404)
    entry = cod.get_entry(cod_id)
    # COD documents the unqualified URL as the newest version. Some current
    # global svnrevision values are not accepted by the historical @ endpoint.
    cif = cod.get_entry_cif(entry, request.source_revision)
    reference = cod.reference_metadata(entry, cif, cif_sha256(cif.content))
    return calculate_pattern(cif.content, request, reference=reference)


@app.post("/v1/xrd/pattern/calculate", response_model=CalculatedXRDPattern, dependencies=[Depends(authorize)])
def calculate_direct_cif_pattern(request: DirectCIFPatternRequest) -> CalculatedXRDPattern:
    return calculate_pattern(request.cif_content, request, direct_metadata=request.metadata)


@app.post("/v1/xrd/data/parse", response_model=ExperimentalXRDParseResponse, dependencies=[Depends(authorize)])
async def parse_experimental_xrd(
    file: Annotated[UploadFile, File()],
    parser_config: Annotated[str | None, Form(alias="parserConfig")] = None,
) -> ExperimentalXRDParseResponse:
    maximum = int(os.environ.get("MAXCALC_XRD_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
    content = await file.read(maximum + 1)
    if len(content) > maximum:
        raise ScientificError("XRD_FILE_TOO_LARGE", f"The uploaded XRD file exceeds the {maximum} byte limit.", 413)
    try:
        raw_config = json.loads(parser_config) if parser_config else {}
        overrides = XRDParserOverride.model_validate(raw_config)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ScientificError("INVALID_PARSER_CONFIG", "Parser settings are invalid.", 422, str(exc)[:1000]) from exc
    return generic_text_parser.parse(content, file.filename, file.content_type, overrides)


@app.post("/v1/xrd/data/process", response_model=ProcessedXRDRepresentation, dependencies=[Depends(authorize)])
def process_experimental_xrd(request: XRDProcessRequest) -> ProcessedXRDRepresentation:
    return process_measurement(request)


@app.post("/v1/xrd/peaks/detect", response_model=XRDPeakDetectionResult, dependencies=[Depends(authorize)])
def detect_experimental_peaks(request: XRDPeakDetectionRequest) -> XRDPeakDetectionResult:
    return detect_peaks(request)


@app.post("/v1/xrd/peaks/fit", response_model=XRDPeakAnalysis, dependencies=[Depends(authorize)])
def fit_experimental_peaks(request: XRDPeakFitRequest) -> XRDPeakAnalysis:
    return fit_peaks(request)


@app.post("/v1/xrd/reference/match", response_model=XRDReferenceMatchingResult, dependencies=[Depends(authorize)])
def match_xrd_reference(request: XRDReferenceMatchingRequest) -> XRDReferenceMatchingResult:
    return match_reference_peaks(request)


@app.post("/v1/xrd/lattice/refine", response_model=XRDLatticeRefinementResult, dependencies=[Depends(authorize)])
def refine_xrd_lattice(request: XRDLatticeRefinementRequest) -> XRDLatticeRefinementResult:
    return refine_lattice(request)
