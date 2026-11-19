---
type: Changed
---
GenBank import and alignment processing are faster: the import no longer repeats translation and validation work, and files with many records no longer slow down as each record is added. Results, warnings and refusals are unchanged.
The Annotation Hub now breaks ties between features with the same location and name by their qualifiers alone, so such features can be listed in a different order than before.
