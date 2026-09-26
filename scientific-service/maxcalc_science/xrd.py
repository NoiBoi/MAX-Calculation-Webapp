from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from importlib.metadata import version
from typing import Callable

import numpy as np
from pymatgen.analysis.diffraction.xrd import XRDCalculator
from pymatgen.core import Structure
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

from . import __version__ as service_version
from .errors import ScientificError
from .models import (
    CalculatedXRDPattern,
    CalculationProvenance,
    CrystalLattice,
    DirectCIFMetadata,
    PatternSettings,
    XRDHkl,
    XRDRadiation,
    XRDReferenceMetadata,
    XRDReflection,
)


def cif_sha256(cif_content: str) -> str:
    return hashlib.sha256(cif_content.encode("utf-8")).hexdigest()


def direct_reference_metadata(
    structure: Structure,
    metadata: DirectCIFMetadata,
    cif_hash: str,
    *,
    clock: Callable[[], datetime] | None = None,
) -> XRDReferenceMetadata:
    analyzer = SpacegroupAnalyzer(structure)
    return XRDReferenceMetadata(
        source_type=metadata.source_type,
        source_id=metadata.source_id,
        formula=structure.composition.reduced_formula,
        phase_name=metadata.phase_name,
        space_group=analyzer.get_space_group_symbol(),
        crystal_system=analyzer.get_crystal_system(),
        publication=None,
        doi=metadata.doi,
        reference_status="unknown",
        retrieved_at=(clock or (lambda: datetime.now(UTC)))(),
        source_revision=metadata.source_revision,
        cif_sha256=cif_hash,
    )


def parse_cif(cif_content: str) -> Structure:
    try:
        structure = Structure.from_str(cif_content, fmt="cif")
    except Exception as exc:
        raise ScientificError("CIF_PARSE_FAILED", "The CIF could not be parsed as a crystal structure.", 422) from exc
    if not structure.sites:
        raise ScientificError("CIF_PARSE_FAILED", "The CIF does not contain atomic sites.", 422)
    return structure


def calculate_pattern(
    cif_content: str,
    settings: PatternSettings,
    reference: XRDReferenceMetadata | None = None,
    direct_metadata: DirectCIFMetadata | None = None,
    *,
    clock: Callable[[], datetime] | None = None,
) -> CalculatedXRDPattern:
    now = (clock or (lambda: datetime.now(UTC)))
    cif_hash = cif_sha256(cif_content)
    structure = parse_cif(cif_content)
    analyzer = SpacegroupAnalyzer(structure)
    crystal_system = analyzer.get_crystal_system()
    space_group = analyzer.get_space_group_symbol()
    if reference is None:
        if direct_metadata is None:
            raise ScientificError("XRD_CALCULATION_FAILED", "Direct CIF metadata is required.", 500)
        reference = direct_reference_metadata(structure, direct_metadata, cif_hash, clock=now)
    else:
        reference = reference.model_copy(update={
            "formula": structure.composition.reduced_formula,
            "space_group": space_group,
            "crystal_system": crystal_system,
            "cif_sha256": cif_hash,
        })

    try:
        if settings.radiation.preset in {"CuKa", "CuKa1"}:
            preset = settings.radiation.preset
            calculator = XRDCalculator(wavelength=preset)
            label = "Cu Kα weighted average (pymatgen CuKa)" if preset == "CuKa" else "Cu Kα1"
            radiation = XRDRadiation(
                kind="preset", label=label, wavelength_angstrom=float(calculator.wavelength)
            )
        else:
            wavelength = settings.radiation.wavelength_angstrom
            if wavelength is None:
                raise ScientificError("INVALID_WAVELENGTH", "A positive wavelength is required.", 422)
            calculator = XRDCalculator(wavelength=wavelength)
            radiation = XRDRadiation(kind="explicit", label="Explicit wavelength", wavelength_angstrom=wavelength)
        pattern = calculator.get_pattern(
            structure,
            two_theta_range=(settings.two_theta_range.min_deg, settings.two_theta_range.max_deg),
        )
    except ScientificError:
        raise
    except Exception as exc:
        raise ScientificError("XRD_CALCULATION_FAILED", "The theoretical XRD pattern could not be calculated.", 422) from exc

    intensities = np.asarray(pattern.y, dtype=float)
    if intensities.size == 0 or not np.all(np.isfinite(intensities)) or float(np.max(intensities)) <= 0:
        raise ScientificError("XRD_CALCULATION_FAILED", "The requested range contains no calculable reflections.", 422)
    normalized = intensities / float(np.max(intensities)) * 100.0
    reflections: list[XRDReflection] = []
    for index, two_theta in enumerate(pattern.x):
        hkl_groups = pattern.hkls[index]
        hkls = []
        for group in hkl_groups:
            indices = group["hkl"]
            # pymatgen reports hexagonal reflections as Miller-Bravais (h, k, i, l).
            # MAXCalc persists the three-index (h, k, l) convention used by its
            # analytical d-spacing and lattice-refinement equations.
            h, k, l = (indices[0], indices[1], indices[3]) if len(indices) == 4 else indices[:3]
            hkls.append(XRDHkl(
                h=int(h), k=int(k), l=int(l),
                multiplicity=int(group["multiplicity"]) if group.get("multiplicity") is not None else None,
            ))
        reflections.append(XRDReflection(
            two_theta_deg=float(two_theta),
            relative_intensity=float(normalized[index]),
            d_angstrom=float(pattern.d_hkls[index]),
            hkls=hkls,
        ))

    lattice = structure.lattice
    return CalculatedXRDPattern(
        reference=reference,
        radiation=radiation,
        two_theta_range=settings.two_theta_range,
        lattice=CrystalLattice(
            a_angstrom=float(lattice.a), b_angstrom=float(lattice.b), c_angstrom=float(lattice.c),
            alpha_deg=float(lattice.alpha), beta_deg=float(lattice.beta), gamma_deg=float(lattice.gamma),
        ),
        crystal_system=crystal_system,
        space_group=space_group,
        reflections=reflections,
        calculation_provenance=CalculationProvenance(
            engine_version=version("pymatgen"),
            service_version=service_version,
            calculated_at=now(),
            input_cif_sha256=cif_hash,
        ),
        cif_content=cif_content,
    )
