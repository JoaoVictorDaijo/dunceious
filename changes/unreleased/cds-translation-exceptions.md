---
type: Fixed
---
Validate and apply CDS code breaks across imports, edits and selection export, preserving strand and frame with visible loss notices.
Revalidate code breaks against the clipped CDS before selection export computes its protein, so exported projects reopen with named notices for newly unusable breaks.
Warn when GenBank preserves printable non-ASCII qualifier text; refuse control characters and line separators.
