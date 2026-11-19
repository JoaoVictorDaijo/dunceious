---
type: Changed
---
GenBank import and alignment processing are faster: the import no longer repeats translation and validation work, and line offsets are counted in one pass, so that step no longer grows quadratically with the number of records. Results, warnings and refusals are unchanged.
The order of Annotation Hub rows no longer depends on an internal translation cache, so features with the same location and name can be listed in a different order than before.
