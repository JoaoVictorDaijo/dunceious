#
# Dunceious
#
# This file is part of Dunceious.
#
# Dunceious is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Dunceious is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
#

# Builds a 120 bp circular GenBank record whose features exercise INSDC location semantics.
import random
random.seed(81)
seq = [random.choice('ACGT') for _ in range(120)]
def put(pos1, s):
    for i, c in enumerate(s): seq[pos1 - 1 + i] = c
put(31, 'GTGAAATTTTAA')   # CDS, transl_table 11 alternative start GTG
put(51, 'CATGGCCTGTTAA')  # CDS, codon_start=2 -> ATG GCC TGT TAA
put(71, 'ATGTGACCCTAA')   # CDS, TGA at 74..76 read as Sec via transl_except
s = ''.join(seq).lower()
feats = [
 ('misc_feature', 'join(1..10,21..30)', 'J1'),
 ('misc_feature', 'complement(join(1..10,21..30))', 'J2'),
 ('misc_feature', 'join(complement(21..30),1..10)', 'J3'),
 ('misc_feature', 'complement(join(complement(1..2),5..6))', 'J4'),
 ('misc_feature', 'complement(join(complement(1..2),complement(5..6)))', 'J5'),
 ('misc_feature', 'complement(join(complement(115..120),1..5))', 'W2'),
 ('misc_feature', 'order(1..3,11..13)', 'O1'),
 ('misc_feature', '<5..>25', 'P1'),
 ('misc_feature', 'join(115..120,1..5)', 'W1'),
 ('misc_feature', '10^11', 'S1'),
 ('CDS', '31..42', 'C1', ['/transl_table=11']),
 ('CDS', '<51..63', 'C2', ['/codon_start=2']),
 ('CDS', '71..82', 'C3', ['/transl_except=(pos:74..76,aa:Sec)']),
]
out = ['LOCUS       TESTSEQ                  120 bp    DNA     circular SYN 22-OCT-2026',
       'DEFINITION  INSDC location conformance fixture.',
       'ACCESSION   TESTSEQ', 'VERSION     TESTSEQ.1', 'KEYWORDS    .',
       'SOURCE      synthetic construct', '  ORGANISM  synthetic construct', '            other sequences.',
       'REFERENCE   1  (bases 1 to 120)', '  AUTHORS   Dunceious.', '  TITLE     Direct Submission', '  JOURNAL   Unpublished',
       'FEATURES             Location/Qualifiers',
       '     source          1..120', '                     /organism="synthetic construct"']
for f in feats:
    out.append(f'     {f[0]:<16}{f[1]}')
    out.append(f'                     /label={f[2]}')
    for q in (f[3] if len(f) > 3 else []): out.append(' ' * 21 + q)
out.append('ORIGIN')
for i in range(0, 120, 60):
    chunk = s[i:i+60]
    out.append(f'{i+1:>9} ' + ' '.join(chunk[j:j+10] for j in range(0, len(chunk), 10)))
out.append('//')
open('fixture.gb', 'w').write('\n'.join(out) + '\n')
open('fixture.seq', 'w').write(s.upper())
