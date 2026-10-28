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

from Bio import SeqIO
from Bio.SeqFeature import BeforePosition, AfterPosition
import Bio, io, warnings
with warnings.catch_warnings(record=True) as parser_warnings:
    warnings.simplefilter('always')
    rec = SeqIO.read('fixture.gb', 'genbank')
print('biopython', Bio.__version__)
for warning in parser_warnings:
    print(f'parser warning: {warning.message}')
for f in rec.features[1:]:
    lab = f.qualifiers['label'][0]
    loc = f.location
    if loc is None:
        print(f'{lab}\tloc=None: parser rejected location; extraction unavailable')
        continue
    op = getattr(loc, 'operator', None)
    partial = (isinstance(loc.start, BeforePosition), isinstance(loc.end, AfterPosition))
    try: ext = str(f.extract(rec.seq))
    except Exception as e: ext = f'ERROR {type(e).__name__}: {e}'
    tr = ''
    if f.type == 'CDS':
        try: tr = str(f.translate(rec.seq, cds=False))
        except Exception as e: tr = f'ERROR {e}'
        try: trc = str(f.translate(rec.seq, cds=True))
        except Exception as e: trc = f'ERROR {type(e).__name__}: {e}'
        tr = f'translate(cds=False)={tr} translate(cds=True)={trc}'
    print(f'{lab}\tloc={loc} operator={op} partial={partial}\textract={ext}\t{tr}')
rejected = [f.qualifiers['label'][0] for f in rec.features if f.location is None]
if rejected:
    print('--- round-trip omits parser-rejected features: ' + ', '.join(rejected))
    rec.features = [f for f in rec.features if f.location is not None]
buf = io.StringIO(); SeqIO.write(rec, buf, 'genbank')
print('--- round-trip location lines')
for line in buf.getvalue().splitlines():
    if line.startswith('     ') and not line.startswith('      ') and 'source' not in line: print(line.strip())
