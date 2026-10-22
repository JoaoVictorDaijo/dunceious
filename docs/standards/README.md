# Sequence standards

Dunceious follows published standards for every sequence operation. This folder records which
standard governs each operation, what it says, how the reference tools behave, and where
Dunceious stands. Cite a rule by its ID (for example `LOC-2`) in code comments, issues and PRs.

Last verified: 2026-10-22, against Dunceious `develop` at 13aff79 (v3.7.2).

## Order of authority

When an operation computes or shows a sequence result:

1. **The standard's text**, at the version pinned in [`sources.json`](sources.json). Read the
   document itself (see [Sources](sources.md)); the rules below summarise it, they do not
   replace it.
2. **A rule recorded here.** If a rule turns out to contradict the standard, the standard wins
   and the rule is corrected.
3. **The standard is silent:** follow the documented behaviour of the reference tools (NCBI,
   EMBOSS 6.6.0, Biopython), then of the major applications listed in [Tools](tools.md).
   Record the exact scope of a tool default; never generalise it into a universal rule.
4. **Tools disagree, or nothing is documented:** stop and ask the owner. Record the decision
   here as a new rule, with its sources.

Never invent a convention. A format being widely supported (see [Tools](tools.md)) says
nothing about what is scientifically correct.

## Evidence levels

Every claim about a tool carries one of these:

- **Tested**: run on the [conformance fixture](conformance/README.md) and compared with the
  hand-applied INSDC oracle.
- **Documented**: stated in the tool's official manual, specification or source code, with
  version or date.
- **Contract**: the declared format contract of an INSDC database (GenBank, ENA, DDBJ).
- **Unknown**: not established. Never a basis for a decision, and never evidence that a tool
  lacks a behaviour.

## Rules

| ID | Operation | Governing source | Dunceious | Rule file |
|---|---|---|---|---|
| LOC-1 | `join()` concatenates in written order | INSDC FT 11.4 §3.4.2.2 | Conforms | [locations](locations.md#loc-1-join-concatenates-in-written-order) |
| LOC-2 | `order()` is not `join()` | INSDC FT 11.4 §3.4.2.2 | Deviates: #225 | [locations](locations.md#loc-2-order-is-not-join) |
| LOC-3 | `complement()`, whole feature or per interval | INSDC FT 11.4 §3.4.2.2 | Conforms | [locations](locations.md#loc-3-complement-whole-feature-or-per-interval) |
| LOC-4 | `<` `>` uncertain bounds | INSDC FT 11.4 §3.4.2.1, §3.4.3 | Deviates: #226 | [locations](locations.md#loc-4-uncertain-bounds) |
| LOC-5 | `n^(n+1)` between-base sites | INSDC FT 11.4 §3.4.2.1 | Deviates: #230 | [locations](locations.md#loc-5-between-base-sites) |
| LOC-6 | Features crossing the origin | INSDC FT 11.4; GFF3 1.26 | Partial | [locations](locations.md#loc-6-features-crossing-the-origin) |
| LOC-7 | The sequence of a multi-interval feature | INSDC FT 11.4 §3.4.2.2 | Owner decision open: #81 | [locations](locations.md#loc-7-the-sequence-of-a-multi-interval-feature) |
| COORD-1 | Positions shown to users | INSDC FT 11.4 §3.4.2.1 | Mixed: #231 | [alphabets and coordinates](alphabets-and-coordinates.md#coord-1-positions-shown-to-users) |
| ALPHA-1 | Nucleotide ambiguity codes, T and U | NC-IUB 1984; INSDC FT 11.4 §7.4.1 | Conforms | [alphabets and coordinates](alphabets-and-coordinates.md#alpha-1-nucleotide-ambiguity-codes-t-and-u) |
| ALPHA-2 | Amino-acid codes U O B Z J X | INSDC FT 11.4 §7.4.3 | Conforms, mode-specific | [alphabets and coordinates](alphabets-and-coordinates.md#alpha-2-amino-acid-codes) |
| TRANS-1 | Genetic code from `/transl_table` | NCBI genetic codes, gc.prt 4.6 | Deviates: #229 | [translation](translation.md#trans-1-genetic-code-from-transl_table) |
| TRANS-2 | `/codon_start` | INSDC FT 11.4 | Conforms | [translation](translation.md#trans-2-codon_start) |
| TRANS-3 | Alternative initiation codons | NCBI genetic codes | Gap in computed path | [translation](translation.md#trans-3-alternative-initiation-codons) |
| TRANS-4 | `/transl_except` | INSDC FT 11.4 | Gap in computed path | [translation](translation.md#trans-4-transl_except) |
| FMT-1 | INSDC feature key to SO term in GFF3 | GFF3 1.26; SO 2026-08-07 | Conforms to grammar | [formats](formats.md#fmt-1-insdc-feature-key-to-so-term-in-gff3) |
| ALN-1 | Local alignment scoring defaults | EMBOSS 6.6.0 `water` | Conforms | [alignment](alignment.md#aln-1-local-alignment-scoring-defaults) |

## Not covered yet

These need their own sources and fixture cases before any decision depends on them: complete
versus 5′/3′-partial CDS and stop-codon policy; every one of the 27 NCBI genetic codes; codons
split across exons; GFF3 phase; partial ends on the minus strand; `length^1` sites; circular
features whose parts do not touch base 1; remote-accession locations; and the difference
between accepting a symbol, matching it in search and scoring it in alignment.

## Changing this folder

- Add or change a rule in the same PR as the code that implements it, and update the table above.
- Re-run the [conformance fixture](conformance/README.md) when a reference tool version changes.
- Run `npm run standards:fetch` to download the pinned documents into `.cache/standards/` and
  check their checksums. A failure means the document changed: re-read it, then update the
  version, checksum and any affected rule together.
