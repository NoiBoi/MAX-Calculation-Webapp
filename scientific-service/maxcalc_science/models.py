from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel


class DomainModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


CodId = Annotated[str, StringConstraints(pattern=r"^\d{7}$")]


class CrystalLattice(DomainModel):
    a_angstrom: float = Field(gt=0)
    b_angstrom: float = Field(gt=0)
    c_angstrom: float = Field(gt=0)
    alpha_deg: float = Field(gt=0, le=180)
    beta_deg: float = Field(gt=0, le=180)
    gamma_deg: float = Field(gt=0, le=180)


class PublicationMetadata(DomainModel):
    title: str | None = None
    authors: str | None = None
    journal: str | None = None
    year: int | None = None
    volume: str | None = None
    pages: str | None = None


class XRDReferenceMetadata(DomainModel):
    source_type: Literal["cod", "lmsl-cif", "lmsl-empirical", "user-cif"]
    source_id: str
    formula: str
    phase_name: str | None = None
    space_group: str | None = None
    crystal_system: str | None = None
    publication: PublicationMetadata | None = None
    doi: str | None = None
    reference_status: Literal["theoretical", "experimental", "unknown"] = "unknown"
    retrieved_at: datetime
    source_revision: str | None = None
    cif_sha256: str
    source_url: str | None = None


class XRDHkl(DomainModel):
    h: int
    k: int
    l: int
    multiplicity: int | None = Field(default=None, ge=1)


class XRDReflection(DomainModel):
    two_theta_deg: float = Field(ge=0, le=180)
    relative_intensity: float = Field(ge=0, le=100.000001)
    d_angstrom: float = Field(gt=0)
    hkls: list[XRDHkl] = Field(min_length=1)


class XRDRadiation(DomainModel):
    kind: Literal["preset", "explicit"]
    label: str
    wavelength_angstrom: float = Field(gt=0, le=10)


class TwoThetaRange(DomainModel):
    min_deg: float = Field(ge=0, lt=180)
    max_deg: float = Field(gt=0, le=180)

    @model_validator(mode="after")
    def ordered(self) -> "TwoThetaRange":
        if self.min_deg >= self.max_deg:
            raise ValueError("minDeg must be less than maxDeg")
        return self


class CalculationProvenance(DomainModel):
    engine: Literal["pymatgen.XRDCalculator"] = "pymatgen.XRDCalculator"
    engine_version: str
    service_version: str
    calculated_at: datetime
    input_cif_sha256: str


class CalculatedXRDPattern(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    reference: XRDReferenceMetadata
    radiation: XRDRadiation
    two_theta_range: TwoThetaRange
    lattice: CrystalLattice
    crystal_system: str
    space_group: str
    reflections: list[XRDReflection]
    calculation_provenance: CalculationProvenance
    cif_content: str | None = Field(default=None, min_length=20, max_length=5_000_000)


class CODSearchRequest(DomainModel):
    formula: str | None = Field(default=None, min_length=1, max_length=120)
    required_elements: list[str] = Field(default_factory=list, max_length=8)
    cod_id: CodId | None = None
    space_group: str | None = Field(default=None, min_length=1, max_length=80)
    text: str | None = Field(default=None, min_length=1, max_length=160)
    status_filter: Literal["any", "experimental", "theoretical"] = "any"
    limit: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="after")
    def has_query(self) -> "CODSearchRequest":
        if not (self.formula or self.required_elements or self.cod_id or self.text):
            raise ValueError("Provide formula, requiredElements, codId, or text")
        return self


class CODSearchResult(DomainModel):
    source_type: Literal["cod"] = "cod"
    source_id: CodId
    formula: str
    phase_name: str | None = None
    space_group: str | None = None
    lattice: CrystalLattice | None = None
    publication: PublicationMetadata | None = None
    doi: str | None = None
    reference_status: Literal["theoretical", "experimental", "unknown"] = "unknown"
    source_revision: str | None = None


class CODSearchResponse(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    results: list[CODSearchResult]


class RadiationInput(DomainModel):
    preset: Literal["CuKa", "CuKa1"] | None = None
    wavelength_angstrom: float | None = Field(default=None, gt=0, le=10)

    @model_validator(mode="after")
    def exactly_one_source(self) -> "RadiationInput":
        if (self.preset is None) == (self.wavelength_angstrom is None):
            raise ValueError("Provide exactly one radiation preset or wavelengthAngstrom")
        return self


class DirectCIFMetadata(DomainModel):
    source_type: Literal["lmsl-cif", "user-cif"] = "user-cif"
    source_id: str = Field(min_length=1, max_length=200)
    phase_name: str | None = Field(default=None, max_length=200)
    doi: str | None = Field(default=None, max_length=300)
    source_revision: str | None = Field(default=None, max_length=100)


class PatternSettings(DomainModel):
    radiation: RadiationInput = Field(default_factory=lambda: RadiationInput(preset="CuKa"))
    two_theta_range: TwoThetaRange = Field(default_factory=lambda: TwoThetaRange(min_deg=10, max_deg=90))


class DirectCIFPatternRequest(PatternSettings):
    cif_content: str = Field(min_length=20, max_length=5_000_000)
    metadata: DirectCIFMetadata


class CODPatternRequest(PatternSettings):
    source_revision: str | None = Field(default=None, pattern=r"^\d+$")


class ErrorBody(DomainModel):
    code: str
    message: str
    detail: str | None = None


class ErrorResponse(DomainModel):
    error: ErrorBody


class RawXRDArtifact(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    artifact_id: str
    original_filename: str = Field(min_length=1, max_length=255)
    byte_length: int = Field(ge=0)
    mime_type: str | None = Field(default=None, max_length=200)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    imported_at: datetime
    source_metadata: dict[str, str] | None = None


class XRDParserOverride(DomainModel):
    delimiter: Literal["comma", "tab", "semicolon", "whitespace"] | None = None
    header_rows: int | None = Field(default=None, ge=0, le=100_000)
    two_theta_column: int | None = Field(default=None, ge=0, le=999)
    intensity_column: int | None = Field(default=None, ge=0, le=999)
    decimal_convention: Literal["period", "comma"] = "period"


class XRDColumn(DomainModel):
    index: int = Field(ge=0)
    name: str | None = None


class XRDRejectedRow(DomainModel):
    line_number: int = Field(ge=1)
    reason: str
    excerpt: str = Field(max_length=240)


class XRDParserProvenance(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    parser_id: Literal["maxcalc.generic-delimited-text"] = "maxcalc.generic-delimited-text"
    parser_version: Literal["1.0.0"] = "1.0.0"
    detected_format: str
    detection_confidence: Literal["high", "medium", "low"]
    text_encoding: str
    delimiter: Literal["comma", "tab", "semicolon", "whitespace"]
    decimal_convention: Literal["period", "comma"]
    header_rows: int = Field(ge=0)
    comment_prefixes: list[str]
    two_theta_column: XRDColumn
    intensity_column: XRDColumn
    user_overrides: dict[str, Any]
    warnings: list[str]
    service_version: str


class XRDAcquisitionMetadata(DomainModel):
    radiation_source_name: str | None = Field(default=None, max_length=200)
    wavelength_angstrom: float | None = Field(default=None, gt=0, le=10)
    instrument_manufacturer: str | None = Field(default=None, max_length=200)
    instrument_model: str | None = Field(default=None, max_length=200)
    scan_date: datetime | None = None
    operator: str | None = Field(default=None, max_length=200)
    sample_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)


class XRDDatasetCharacterization(DomainModel):
    point_count: int = Field(ge=0)
    min_two_theta_deg: float
    max_two_theta_deg: float
    min_intensity: float
    max_intensity: float
    all_values_finite: bool
    ordering: Literal["strictly-increasing", "decreasing", "non-monotonic", "constant"]
    duplicate_two_theta_count: int = Field(ge=0)
    median_spacing_deg: float | None = None
    spacing_variation_deg: float | None = None
    rejected_numerical_row_count: int = Field(ge=0)


class XRDValidationIssue(DomainModel):
    code: str
    severity: Literal["warning", "error"]
    message: str
    blocking: bool
    representative_rows: list[XRDRejectedRow] = Field(default_factory=list)


class ExperimentalXRDMeasurement(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    measurement_id: str
    raw_artifact_id: str
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_filename: str
    imported_at: datetime
    sample_name: str | None = Field(default=None, max_length=200)
    maxcalc_sample_id: str | None = Field(default=None, max_length=200)
    acquisition_metadata: XRDAcquisitionMetadata
    parser_provenance: XRDParserProvenance
    two_theta_deg: list[float] = Field(min_length=2)
    intensity: list[float] = Field(min_length=2)
    characterization: XRDDatasetCharacterization
    validation_status: Literal["valid", "warning"]
    validation_issues: list[XRDValidationIssue]

    @model_validator(mode="after")
    def arrays_match(self) -> "ExperimentalXRDMeasurement":
        if len(self.two_theta_deg) != len(self.intensity):
            raise ValueError("twoThetaDeg and intensity must have equal lengths")
        return self


class ExperimentalXRDParseResponse(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    raw_artifact: RawXRDArtifact
    measurement: ExperimentalXRDMeasurement
    available_columns: list[XRDColumn]


class XRDBaselineConfig(DomainModel):
    enabled: bool = False
    algorithm: Literal["arpls", "asls"] = "arpls"
    lam: float = Field(default=1_000_000, gt=0, le=1e15)
    p: float = Field(default=0.01, gt=0, lt=1)
    diff_order: int = Field(default=2, ge=1, le=3)
    max_iter: int = Field(default=50, ge=1, le=10_000)
    tol: float = Field(default=1e-3, gt=0, le=1)


class XRDSmoothingConfig(DomainModel):
    enabled: bool = False
    method: Literal["savitzky-golay"] = "savitzky-golay"
    window_length: int = Field(default=11, ge=3, le=100_001)
    polynomial_order: int = Field(default=3, ge=0, le=20)

    @model_validator(mode="after")
    def valid_savgol(self) -> "XRDSmoothingConfig":
        if self.window_length % 2 == 0:
            raise ValueError("windowLength must be odd")
        if self.polynomial_order >= self.window_length:
            raise ValueError("polynomialOrder must be less than windowLength")
        return self


class XRDProcessingConfig(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    baseline: XRDBaselineConfig = Field(default_factory=XRDBaselineConfig)
    smoothing: XRDSmoothingConfig = Field(default_factory=XRDSmoothingConfig)


class XRDScientificProvenance(DomainModel):
    service_version: str
    python_version: str
    numpy_version: str
    scipy_version: str
    pybaselines_version: str
    lmfit_version: str


class XRDProcessingDiagnostics(DomainModel):
    baseline_algorithm: str | None = None
    converged: bool | None = None
    iteration_count: int | None = Field(default=None, ge=0)
    final_tolerance: float | None = None


class XRDProcessRequest(DomainModel):
    parent_measurement_id: str = Field(min_length=1, max_length=200)
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    two_theta_deg: list[float] = Field(min_length=2)
    intensity: list[float] = Field(min_length=2)
    processing_config: XRDProcessingConfig = Field(default_factory=XRDProcessingConfig)

    @model_validator(mode="after")
    def arrays_match(self) -> "XRDProcessRequest":
        if len(self.two_theta_deg) != len(self.intensity):
            raise ValueError("twoThetaDeg and intensity must have equal lengths")
        return self


class ProcessedXRDRepresentation(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    processed_representation_id: str
    parent_measurement_id: str
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    created_at: datetime
    processing_config: XRDProcessingConfig
    two_theta_deg: list[float]
    raw_intensity: list[float]
    estimated_baseline: list[float] | None = None
    baseline_corrected_intensity: list[float] | None = None
    smoothed_intensity: list[float] | None = None
    analysis_intensity: list[float]
    transformation_order: list[Literal["raw", "baseline-subtraction", "savitzky-golay"]]
    warnings: list[str]
    diagnostics: XRDProcessingDiagnostics
    scientific_provenance: XRDScientificProvenance


class XRDPeakDetectionConfig(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    minimum_prominence: float = Field(gt=0)
    minimum_height: float | None = None
    minimum_distance_deg: float | None = Field(default=None, gt=0, le=180)
    minimum_width_deg: float | None = Field(default=None, gt=0, le=180)
    maximum_width_deg: float | None = Field(default=None, gt=0, le=180)

    @model_validator(mode="after")
    def valid_width_range(self) -> "XRDPeakDetectionConfig":
        if self.minimum_width_deg is not None and self.maximum_width_deg is not None and self.minimum_width_deg > self.maximum_width_deg:
            raise ValueError("minimumWidthDeg must not exceed maximumWidthDeg")
        return self


class XRDPeakCandidate(DomainModel):
    candidate_id: str
    approximate_two_theta_deg: float
    approximate_intensity: float
    prominence: float
    estimated_width_deg: float | None = None
    source_index: int = Field(ge=0)
    detection_config_id: str
    status: Literal["AUTO", "MANUAL_ADDED", "MANUAL_EDITED", "EXCLUDED"] = "AUTO"
    manual_window_min_deg: float | None = None
    manual_window_max_deg: float | None = None

    @model_validator(mode="after")
    def valid_manual_window(self) -> "XRDPeakCandidate":
        if (self.manual_window_min_deg is None) != (self.manual_window_max_deg is None):
            raise ValueError("both manual fit-window bounds are required")
        if self.manual_window_min_deg is not None and self.manual_window_min_deg >= self.manual_window_max_deg:
            raise ValueError("manualWindowMinDeg must be less than manualWindowMaxDeg")
        return self


class XRDPeakDetectionRequest(DomainModel):
    processed_representation_id: str
    two_theta_deg: list[float] = Field(min_length=3)
    analysis_intensity: list[float] = Field(min_length=3)
    detection_config: XRDPeakDetectionConfig

    @model_validator(mode="after")
    def arrays_match(self) -> "XRDPeakDetectionRequest":
        if len(self.two_theta_deg) != len(self.analysis_intensity):
            raise ValueError("twoThetaDeg and analysisIntensity must have equal lengths")
        return self


class XRDPeakDetectionResult(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    processed_representation_id: str
    detection_config: XRDPeakDetectionConfig
    detection_config_id: str
    candidates: list[XRDPeakCandidate]
    warnings: list[str]
    scientific_provenance: XRDScientificProvenance


class XRDPeakFittingConfig(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    local_background: Literal["constant", "linear"] = "linear"
    minimum_window_deg: float = Field(default=0.4, gt=0, le=180)
    maximum_window_deg: float = Field(default=3.0, gt=0, le=180)
    width_multiplier: float = Field(default=4.0, ge=1, le=20)
    maximum_group_peaks: int = Field(default=3, ge=1, le=8)
    center_bound_deg: float = Field(default=0.3, gt=0, le=10)
    minimum_fwhm_deg: float = Field(default=0.01, gt=0, le=10)
    maximum_fwhm_deg: float = Field(default=2.0, gt=0, le=30)

    @model_validator(mode="after")
    def valid_ranges(self) -> "XRDPeakFittingConfig":
        if self.minimum_window_deg > self.maximum_window_deg:
            raise ValueError("minimumWindowDeg must not exceed maximumWindowDeg")
        if self.minimum_fwhm_deg >= self.maximum_fwhm_deg:
            raise ValueError("minimumFwhmDeg must be less than maximumFwhmDeg")
        return self


class XRDFitDiagnostics(DomainModel):
    success: bool
    message: str
    method: str | None = None
    evaluations: int | None = None
    chi_square: float | None = None
    reduced_chi_square: float | None = None
    akaike_information_criterion: float | None = None
    bayesian_information_criterion: float | None = None
    r_squared: float | None = None


class XRDFittedPeak(DomainModel):
    peak_id: str
    candidate_id: str
    fitted_center_two_theta_deg: float | None = None
    center_stderr_deg: float | None = None
    amplitude: float | None = None
    amplitude_stderr: float | None = None
    height: float | None = None
    fwhm_deg: float | None = None
    fwhm_stderr_deg: float | None = None
    fraction: float | None = None
    fit_window_min_deg: float
    fit_window_max_deg: float
    point_count: int = Field(ge=0)
    source: Literal["AUTO", "MANUAL_ADDED", "MANUAL_EDITED"]
    included: bool = True
    group_id: str
    diagnostics: XRDFitDiagnostics


class XRDFitGroup(DomainModel):
    group_id: str
    candidate_ids: list[str]
    two_theta_deg: list[float]
    observed_intensity: list[float]
    best_fit: list[float] | None = None
    local_background: list[float] | None = None
    component_curves: dict[str, list[float]] = Field(default_factory=dict)
    residual: list[float] | None = None
    diagnostics: XRDFitDiagnostics


class XRDPeakFitRequest(DomainModel):
    parent_processed_representation_id: str
    parent_measurement_id: str
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    two_theta_deg: list[float] = Field(min_length=3)
    analysis_intensity: list[float] = Field(min_length=3)
    detection_config: XRDPeakDetectionConfig
    fitting_config: XRDPeakFittingConfig = Field(default_factory=XRDPeakFittingConfig)
    candidates: list[XRDPeakCandidate]
    manual_edits: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def arrays_match(self) -> "XRDPeakFitRequest":
        if len(self.two_theta_deg) != len(self.analysis_intensity):
            raise ValueError("twoThetaDeg and analysisIntensity must have equal lengths")
        return self


class XRDPeakAnalysis(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    peak_analysis_id: str
    revision: int = Field(default=1, ge=1)
    parent_processed_representation_id: str
    parent_measurement_id: str
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    created_at: datetime
    detection_config: XRDPeakDetectionConfig
    fitting_config: XRDPeakFittingConfig
    candidate_peaks: list[XRDPeakCandidate]
    fitted_peaks: list[XRDFittedPeak]
    fit_groups: list[XRDFitGroup]
    excluded_candidate_ids: list[str]
    manual_edits: list[str]
    warnings: list[str]
    scientific_provenance: XRDScientificProvenance


# Stage 4: reference-assisted matching and lattice refinement.  These models
# intentionally carry their complete parents across the stateless service
# boundary; persisted results retain identifiers and hashes rather than
# mutable server-side state.
class XRDReferenceMatchConfig(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    maximum_delta_two_theta_deg: float = Field(default=0.15, gt=0, le=5)
    ignore_excluded_stage3_peaks: bool = True
    intensity_usage: Literal["disabled", "tie-breaker"] = "disabled"
    intensity_tie_break_weight: float = Field(default=0.001, ge=0, le=0.01)
    ambiguity_threshold_deg: float = Field(default=0.03, ge=0, le=1)
    wavelength_behavior: Literal["require-compatible"] = "require-compatible"


class XRDMatchCandidate(DomainModel):
    reference_reflection_id: str
    reference_two_theta_deg: float
    delta_two_theta_deg: float
    absolute_delta_two_theta_deg: float
    calculated_relative_intensity: float
    hkls: list[XRDHkl] = Field(min_length=1)


class XRDPeakMatch(DomainModel):
    match_id: str
    experimental_peak_id: str
    reference_reflection_id: str
    experimental_two_theta_deg: float
    reference_two_theta_deg: float
    delta_two_theta_deg: float
    absolute_delta_two_theta_deg: float
    experimental_fwhm_deg: float | None = None
    experimental_intensity: float | None = None
    center_stderr_deg: float | None = None
    calculated_relative_intensity: float
    candidate_hkls: list[XRDHkl] = Field(min_length=1)
    selected_hkl: XRDHkl | None = None
    alternative_candidates: list[XRDMatchCandidate] = Field(default_factory=list)
    provenance_state: Literal["AUTO_PROPOSED", "AUTO_ACCEPTED", "MANUAL_ASSIGNED", "MANUAL_CHANGED", "REJECTED"] = "AUTO_PROPOSED"
    accepted: bool = True
    include_in_refinement: bool = True
    ambiguous: bool = False
    notes: list[str] = Field(default_factory=list)


class XRDReferenceMatchingRequest(DomainModel):
    peak_analysis: XRDPeakAnalysis
    reference_pattern: CalculatedXRDPattern
    experimental_wavelength_angstrom: float | None = Field(default=None, gt=0, le=10)
    config: XRDReferenceMatchConfig = Field(default_factory=XRDReferenceMatchConfig)


class XRDLibraryReferenceIdentity(DomainModel):
    reference_id: str
    revision_id: str
    revision_number: int = Field(ge=1)


class XRDReferenceMatchingResult(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    matching_result_id: str
    parent_peak_analysis_id: str
    parent_processed_representation_id: str
    parent_measurement_id: str
    selected_reference: XRDReferenceMetadata
    reference_cif_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    wavelength_angstrom: float = Field(gt=0, le=10)
    config: XRDReferenceMatchConfig
    proposed_matches: list[XRDPeakMatch]
    unmatched_experimental_peak_ids: list[str]
    unmatched_reference_reflection_ids: list[str]
    ambiguous_match_ids: list[str]
    warnings: list[str]
    scientific_provenance: XRDScientificProvenance
    created_at: datetime
    library_reference: XRDLibraryReferenceIdentity | None = None


class XRDLatticeRefinementConfig(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    residual_space: Literal["two-theta"] = "two-theta"
    weighting: Literal["unweighted"] = "unweighted"
    refine_zero_shift: bool = False
    maximum_absolute_zero_shift_deg: float = Field(default=0.2, gt=0, le=1)


class XRDLatticeRefinementRequest(DomainModel):
    matching_result: XRDReferenceMatchingResult
    reference_lattice: CrystalLattice
    crystal_system: str
    config: XRDLatticeRefinementConfig = Field(default_factory=XRDLatticeRefinementConfig)


class XRDRefinedParameter(DomainModel):
    name: str
    initial_value: float
    refined_value: float
    standard_error: float | None = None
    unit: str


class XRDReflectionResidual(DomainModel):
    match_id: str
    experimental_peak_id: str
    reference_reflection_id: str
    hkl: XRDHkl
    experimental_two_theta_deg: float
    predicted_two_theta_deg: float
    delta_two_theta_deg: float
    observed_d_angstrom: float
    predicted_d_angstrom: float
    included: bool
    center_stderr_deg: float | None = None


class XRDRefinementDiagnostics(DomainModel):
    optimizer_success: bool
    optimizer_message: str
    rank: int
    parameter_count: int
    condition_number: float | None = None
    degrees_of_freedom: int | None = None
    rms_delta_two_theta_deg: float
    mean_delta_two_theta_deg: float
    maximum_absolute_delta_two_theta_deg: float
    rms_d_spacing_residual_angstrom: float
    covariance: list[list[float]] | None = None
    correlation: list[list[float]] | None = None


class XRDLatticeRefinementResult(DomainModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    refinement_id: str
    parent_matching_result_id: str
    parent_peak_analysis_id: str
    parent_processed_representation_id: str
    parent_measurement_id: str
    raw_artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    selected_reference: XRDReferenceMetadata
    reference_cif_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    wavelength_angstrom: float
    crystal_system: Literal["cubic", "tetragonal", "hexagonal", "orthorhombic"]
    config: XRDLatticeRefinementConfig
    reference_lattice: CrystalLattice
    parameters: list[XRDRefinedParameter]
    zero_shift_deg: float | None = None
    zero_shift_standard_error_deg: float | None = None
    included_match_ids: list[str]
    excluded_match_ids: list[str]
    residuals: list[XRDReflectionResidual]
    diagnostics: XRDRefinementDiagnostics
    warnings: list[str]
    scientific_provenance: XRDScientificProvenance
    created_at: datetime
    library_reference: XRDLibraryReferenceIdentity | None = None
