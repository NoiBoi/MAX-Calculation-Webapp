# Atomic-radius data ingestion

Every definition is a separate immutable dataset in `data/radius-sets/`; runtime internet access is not used.

- `teatum-metallic-cn12` (`1968.1.0`): calculated metallic radii for CN=12 from Teatum, Gschneidner, and Waber, LA-4003, Table I, [DOI 10.2172/4789465](https://doi.org/10.2172/4789465). Reviewed transcription, 23 elements/24 qualified records, estimated markers retained. Dataset digest `c5338656e7933399b980c6a2527d09e62b298fb15a8586a6178c3faed9325e5f`; source PDF digest is recorded in the dataset.
- `cordero-covalent-2008` (`2008.1.0`): covalent radii from Cordero et al., Dalton Transactions Table 2, [DOI 10.1039/B801115J](https://doi.org/10.1039/B801115J). Reviewed transcription, 96 elements/101 qualified records; carbon hybridization, spin variants, and estimates are retained. Digest `51ec69fdc98debfe64fea936e0e332db897c5903dfa49ada8a90e43ffefeb0d8`.
- `rahm-neutral-isodensity-2016` (`2016.1.0`): isolated neutral-atom radii at 0.001 e/bohr³ from relativistic all-electron DFT, [DOI 10.1002/chem.201602949](https://doi.org/10.1002/chem.201602949). Ninety-six values are installed as **provisional** because Wiley blocked full SI retrieval during review; the primary paper and definition were verified, and the values were cross-checked against a provenance-rich Table S1 transcription. Digest `030831e29c6fd3c51f042d0e3b7548e90fd22b81625865bfe5e7f5628ef5cee1`.

The three deterministic importers consume reviewed TSV fixtures, convert Å to pm with Decimal, validate symbols and qualified uniqueness, emit missing-element coverage and parsing warnings, and generate stable content digests. Teatum and Cordero cover Ti, V, Cr, Zr, Nb, Mo, Hf, Ta, W, Sc, Y, Al, C, and N. Full copyrighted papers/SI are not checked into the repository.
