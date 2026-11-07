### Added
- Translation codons explain curated differences, initiation, code breaks, partial codons and uncertainty on hover and keyboard focus. Stored residues remain visible; hidden DNA stops carry a red edge.
- Translation-length chips and complete extra-residue lists explain unmatched positions without inventing codon cells. Overlapping CDSs use independent lanes.

### Fixed
- Translation paint and pointer targets split at alignment gaps. Evidence and geometry changes dismiss stale explanations.
- Invalid-code codons retain an explicitly assumed view when exception geometry is known, while explaining that those exceptions were not applied. Dropped conflicts and foreign-accession breaks never receive substitution marks.
- Invalid-code ORFs use one matching paint/explanation source per codon; panning reuses gap detection. Closing extra-position details restores the invoking control.
- Codon tooltips use local exception previews and compact counts; complete stop and raw-occurrence diagnostics remain in labelled annotation details.
