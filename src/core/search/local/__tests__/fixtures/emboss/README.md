# EMBOSS local-alignment references

Generated offline by `bash scripts/emboss-fixtures.sh` from the repository root.
Requires Python 3 (standard library only), `/usr/bin/water`, `/usr/bin/matcher`,
and `embossversion` on PATH. The generator rejects versions other than EMBOSS
6.6.0.0. Tests read committed outputs and require neither EMBOSS nor a network.

`cases.json` contains 27 synthetic input pairs, the original case, the selected
matrix, matcher’s largest successful alternative count, and pinned water
quarantine scores. The mixed-case inputs are uppercased before either reference
program sees them; T and U remain distinct symbols. Each case’s `query.fa` and
`record.fa` are the exact processed inputs. All sequences are invented test
strings, including `synthetic-stretch`; there is no real genome data.

Seeded cases use a 32-bit LCG starting at `0x6a09e667`, with multiplier 1664525
and increment 1013904223. Three nucleotide and three protein pairs draw letters
using `floor(state * alphabet.length / 2**32)`; the generator defines their
lengths and alphabets. The 2,050-residue protein query exercises a long query
without making exhaustive matcher generation expensive.

## Commands and outputs

Every case has `commands.json` with the exact argument vector and exit status of
water and **every** matcher attempt, including their exact stderr, beginning at
one alternative and incrementing
by one until the specific fatal exhaustion message. `matcher.srspair` is from the largest successful count (empty if no count
succeeds); successful-run stderr is preserved in `commands.json`. The first fatal attempt’s complete stdout and stderr are separate
`matcher-exhaustion.stdout` and `matcher-exhaustion.stderr` files. A non-exhaustion
failure aborts generation; it is never interpreted as a completed list.

The command templates are:

```text
/usr/bin/water -auto -asequence <case>/query.fa -bsequence <case>/record.fa \
  -snucleotide1 -snucleotide2 -datafile src/core/search/local/matrices/EDNAFULL \
  -gapopen 10 -gapextend 0.5 -aformat3 srspair -awidth3 60 -outfile stdout
/usr/bin/matcher -auto -asequence <case>/query.fa -bsequence <case>/record.fa \
  -snucleotide1 -snucleotide2 -datafile <fixtures>/EDNAFULL.x2 \
  -gapopen 20 -gapextend 1 -alternatives <k> \
  -aformat3 srspair -awidth3 60 -outfile stdout
```

Protein cases use `-sprotein1 -sprotein2` and EBLOSUM62. The script writes both
`*.x2` datafiles from the committed matrices, doubling every numeric entry.
Matcher scores are divided by two for comparison. Gap cost is
`open + (length - 1) * extend`. Identity counts equal symbols, similarity counts
positive matrix scores, and gaps count gap columns; their common denominator is
alignment length, including gaps. Percentages are rounded to one decimal place.

The app’s pair layout uses 60 columns; EMBOSS defaults to 50. The explicit
`-awidth3 60` makes the existing hand-written hit-view fixture comparable: 70 A
residues, query coordinates 1–70 and record coordinates 101–170. The test compares
the alignment body, including spaces, coordinate fields and blank lines,
excluding metadata and footer padding.
Other srspair metadata stays verbatim, including generation-time `Rundate` lines.

## Water quarantines

The independent textbook Gotoh oracle uses the unscaled committed matrix and
10/0.5 affine gaps. Each quarantine is an asserted, specific discrepancy rather
than a skipped test. The engine must still return the mathematical optimum.

| Case | Water reported score | Printed path rescore | Gotoh optimum | Reason |
| --- | ---: | ---: | ---: | --- |
| `protein-n` | -3.4028234663852886e38 | 6 | 6 | Single-cell positive alignment receives water’s negative floating-point sentinel. |
| `boundary-a-a` | -3.4028234663852886e38 | 5 | 5 | Same single-cell sentinel; the printed A/A path is optimal. |
| `boundary-aa-ac` | 1 | 5 | 5 | The printed one-column A/A path does not rescore to the reported value. |
| `boundary-aa-cc` | -4 | -4 | 0 | Water emits a negative substitution although the empty local alignment wins. |
| `no-positive-protein` | -4 | -4 | 0 | Water emits a negative P/W substitution although no positive alignment exists. |

The sentinels equal negative FLT_MAX (as printed in the raw outputs). For positive
quarantined cases, identity, similarity and gaps are still compared with water’s
printed first-hit metrics. For the two zero-optimum cases, the engine must emit
no alignment. All other water outputs must both rescore correctly and equal
Gotoh and the engine’s first score. Water’s match-line treatment of nucleotide
N/N is preserved verbatim; the complete layout comparison uses the unambiguous
pair-layout case.

No matcher quarantines apply. Tests compare every saved path, in order, including
score, both ranges, and both gapped strings, against the unbounded engine list
before overlap filtering. Only the saved prefix is required: matcher’s finite
candidate list and the engine’s unbounded list can have different exhaustion
lengths. A shorter engine list or any different saved path fails the test.
