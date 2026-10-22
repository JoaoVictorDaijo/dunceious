# Conformance fixture

A 120 bp circular GenBank record whose features exercise INSDC location and CDS semantics. The
expected results are applied by hand from the INSDC rules (`oracle.py`), independently of any
tool, and the reference tools are compared against them. One fixture covers the ten cases
below, not every input.

| Case | Location | Tests |
|---|---|---|
| J1 | `join(1..10,21..30)` | LOC-1 |
| J2 | `complement(join(1..10,21..30))` | LOC-3, whole-feature complement |
| J3 | `join(complement(21..30),1..10)` | LOC-3, mixed strands |
| O1 | `order(1..3,11..13)` | LOC-2 |
| P1 | `<5..>25` | LOC-4 |
| W1 | `join(115..120,1..5)` on a circular record | LOC-6 |
| S1 | `10^11` | LOC-5 |
| C1 | CDS `31..42`, `/transl_table=11`, GTG start | TRANS-1, TRANS-3 |
| C2 | CDS `<51..63`, `/codon_start=2` | TRANS-2 |
| C3 | CDS `71..82`, `/transl_except=(pos:74..76,aa:Sec)` | TRANS-4 |

## Results (2026-10-22)

| Case | Oracle | Biopython 1.88 | EMBOSS 6.6.0.0 |
|---|---|---|---|
| J1, J2, J3, W1 | see `expected-oracle.txt` | `extract()` matches | `extractfeat -join Y` matches |
| O1 | not joinable | `operator=order` kept; `extract()` concatenates | round-trip kept; `-join Y` concatenates |
| P1 | partial both ends | `BeforePosition`/`AfterPosition`, round-trip kept | round-trip kept |
| S1 | zero length | zero length, round-trip kept | round-trip kept; extraction skips it |
| C1 | MKF | `cds=True`: MKF | — |
| C2 | MAC | `cds=True`: MAC | — |
| C3 | MUP | not applied: `M*P*`; `cds=True` raises | — |

Raw outputs: `result-biopython-1.88.txt`, `result-emboss-6.6.0.txt`.

## Re-running

```bash
python3 make_fixture.py           # writes fixture.gb and fixture.seq
python3 oracle.py > expected-oracle.txt
python3 run_biopython.py > result-biopython-1.88.txt   # needs Biopython
./run_emboss.sh > result-emboss-6.6.0.txt              # needs EMBOSS on PATH
```

Run from this folder. EMBOSS 6.6.0 ignores the feature table of a GenBank record with no
REFERENCE block, so the fixture includes one.
