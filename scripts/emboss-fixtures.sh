#!/usr/bin/env bash
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

set -euo pipefail
cd "$(dirname "$0")/.."
export LC_ALL=C TZ=UTC
python3 - <<'PYTHON'
import json
from pathlib import Path
import subprocess

root = Path("src/core/search/local/__tests__/fixtures/emboss")
root.mkdir(parents=True, exist_ok=True)
version = subprocess.run(["embossversion", "-auto"], capture_output=True, text=True, check=True).stdout.strip()
if version != "6.6.0.0":
    raise SystemExit(f"Expected EMBOSS 6.6.0.0, got {version!r}")
(root / "version.txt").write_text(version + "\n")
for matrix in ("EDNAFULL", "EBLOSUM62"):
    lines = []
    for line in Path(f"src/core/search/local/matrices/{matrix}").read_text().splitlines():
        fields = line.split()
        if fields and not line.startswith("#") and len(fields[0]) == 1 and len(fields) > 1 and fields[1].lstrip("-").isdigit():
            line = fields[0] + " " + " ".join(str(2 * int(n)) for n in fields[1:])
        lines.append(line)
    (root / f"{matrix}.x2").write_text("\n".join(lines) + "\n")

cases = []
def case(name, query, record, protein=False):
    cases.append(dict(name=name, query=query, record=record,
                      matrix="EBLOSUM62" if protein else "EDNAFULL"))

case("tu-identity", "ATAT", "AUAU")
case("nucleotide-n", "ACNAC", "ACNAC")
case("protein-n", "N", "N", True)
case("protein-bzx", "WBZXW", "WDQAW", True)
case("mixed-case", "acnAc", "ACNaC")
case("mixed-tu-rna", "ACTUUGCA", "ACUTTGCA")
case("protein-zero-substitution", "WAW", "WCW", True)
case("protein-unequal-positive", "WILW", "WVVW", True)
case("single-indel", "WWWWAWWWW", "WWWWWWWW", True)
case("extended-indel", "WWWWAAAWWWW", "WWWWWWWW", True)
case("query-flanks", "CCCCACGTACGTGGGG", "ACGTACGT")
case("no-positive-protein", "PPPP", "WWWW", True)
case("long-query", "P" * 1024 + "WW" + "P" * 1024, "WW", True)
case("overlapping-ties", "AA", "AAA")
case("boundary-aa-ac", "AA", "AC")
case("boundary-a-a", "A", "A")
case("boundary-aa-cc", "AA", "CC")
case("gap-one", "ACGTACGTACGT", "ACGTACGGTACGT")
case("gap-two", "ACGTACGTACGT", "ACGTACGGGTACGT")
case("pair-layout", "A" * 70, "C" * 100 + "A" * 70)
case("synthetic-stretch", "CGTACGATTCGA", "TTGACCGTACGATTCGACCTAGGTCATGCTA")
seed = 0x6A09E667
def random_sequence(alphabet, length):
    global seed
    letters = []
    for _ in range(length):
        seed = (1664525 * seed + 1013904223) & 0xffffffff
        letters.append(alphabet[(seed * len(alphabet)) >> 32])
    return "".join(letters)
for protein, alphabet in ((False, "ACGTUN"), (True, "ARNDCQEGHILKMFPSTWYVBZX")):
    for i in range(3):
        case(f"seeded-{'protein' if protein else 'nucleotide'}-{i + 1}",
             random_sequence(alphabet, 12 + i), random_sequence(alphabet, 17 + i), protein)

quarantines = {
    "protein-n": [-3.4028234663852886e38, 6, 6],
    "no-positive-protein": [-4, -4, 0],
    "boundary-aa-ac": [1, 5, 5],
    "boundary-a-a": [-3.4028234663852886e38, 5, 5],
    "boundary-aa-cc": [-4, -4, 0],
}
for item in cases:
    if item["name"] in quarantines:
        reported, path, optimum = quarantines[item["name"]]
        item["waterQuarantine"] = dict(reportedScore=reported, pathScore=path, optimum=optimum)
    directory = root / item["name"]
    directory.mkdir(exist_ok=True)
    # Case folding preserves T/U symbols, as in the production scoring encoder.
    for key, name in (("query", "Query"), ("record", "record")):
        (directory / f"{key}.fa").write_text(f">{name}\n{item[key].upper()}\n")
    sequence_type = "protein" if item["matrix"] == "EBLOSUM62" else "nucleotide"
    common = ["-auto", "-asequence", str(directory / "query.fa"),
              "-bsequence", str(directory / "record.fa"),
              f"-s{sequence_type}1", f"-s{sequence_type}2"]
    commands = []
    def run(program, matrix, opening, extension, alternatives=None):
        command = [f"/usr/bin/{program}", *common, "-datafile", matrix,
                   "-gapopen", str(opening), "-gapextend", str(extension)]
        if alternatives is not None:
            command += ["-alternatives", str(alternatives)]
        command += ["-aformat3", "srspair", "-awidth3", "60", "-outfile", "stdout"]
        result = subprocess.run(command, capture_output=True, text=True)
        commands.append(dict(argv=command, exitCode=result.returncode, stderr=result.stderr))
        return result
    result = run("water", f"src/core/search/local/matrices/{item['matrix']}", 10, 0.5)
    if result.returncode:
        raise SystemExit(f"water {item['name']}: {result.stderr}")
    (directory / "water.srspair").write_text(result.stdout)
    largest = 0
    while True:
        result = run("matcher", str(root / f"{item['matrix']}.x2"), 20, 1, largest + 1)
        if result.returncode:
            if "The number of alignments computed is too large" not in result.stderr:
                raise SystemExit(f"Unexpected matcher failure {item['name']}: {result.stderr}")
            (directory / "matcher-exhaustion.stdout").write_text(result.stdout)
            (directory / "matcher-exhaustion.stderr").write_text(result.stderr)
            break
        largest += 1
        (directory / "matcher.srspair").write_text(result.stdout)
    if not largest:
        (directory / "matcher.srspair").write_text("")
    item["matcherCount"] = largest
    (directory / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    print(f"{item['name']}: matcher {largest}, exhausted at {largest + 1}", flush=True)
(root / "cases.json").write_text(json.dumps(cases, indent=2) + "\n")
PYTHON
