---
type: Fixed
---
Read GFF3 rows in NCBI rank order for any feature type when complete ranks are available. Unranked same-strand rows in steadily ascending or descending order are read in strand-relative coordinate order, which determines coding order for CDS rows. Warn when this changes file order and either the file declares the landmark circular or the matched loaded record is circular. Also warn when ranks are unusable or when mixed-strand or non-monotonic rows are read in file order. Write a contiguous circular origin crossing as an extended row. GFF3 files exported by Dunceious 4.1.0 or earlier that used two in-bounds rows for a crossing now import them as two intervals with a warning. This can change the feature's sequence and translation.
