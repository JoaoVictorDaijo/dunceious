---
type: Fixed
---
Read GFF3 CDS parts in NCBI rank order when available and warn when ambiguous rows are evaluated in file order. Write a contiguous circular origin crossing as an extended row. GFF3 files exported by Dunceious 4.1.0 or earlier that used two in-bounds rows for a crossing now import them as two intervals with a warning. This can change the feature's sequence and translation.
