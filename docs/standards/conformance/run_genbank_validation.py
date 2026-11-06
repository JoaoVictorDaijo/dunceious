#
# Dunceious
# Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

"""Reference-tool output; run from repository root with Biopython 1.88."""
import Bio
from Bio import SeqIO
import json
from pathlib import Path
assert Bio.__version__ == '1.88', Bio.__version__
paths = sorted(Path('examples').rglob('*.gb')) + sorted(Path('docs/standards/conformance').glob('validation-*.gb'))
output = {}
for path in paths:
    records = []
    for record in SeqIO.parse(path, 'genbank'):
        features = []
        for feature in record.features:
            assert feature.location is not None, (path, feature)
            features.append(dict(key=feature.type, parts=[dict(start=int(p.start), end=int(p.end), strand=p.strand) for p in feature.location.parts], extracted=str(feature.extract(record.seq)).upper()))
        records.append(dict(id=record.name, sequence=str(record.seq).upper(), features=features))
    output[str(path)] = records
Path('docs/standards/conformance/result-genbank-biopython-1.88.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')
print(f'Biopython {Bio.__version__}: {len(paths)} files, {sum(len(r) for r in output.values())} records')
