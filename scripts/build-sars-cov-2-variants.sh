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
# Rebuilds examples/sars-cov-2-variants/ from NCBI: the three variant records,
# their MAFFT alignment against the bundled reference, and the provenance file.
# Network access is limited to NCBI E-utilities; MAFFT runs in a digest-pinned
# container so the alignment is reproducible.

set -euo pipefail
cd "$(dirname "$0")/.."

reference="examples/sars-cov-2-NC_045512.gb"
out="examples/sars-cov-2-variants"
image="quay.io/biocontainers/mafft@sha256:dd538a87e8afd1a92ee0a2079438287ff0fc333f8634ba11c7414f1c208ab373"
accessions="OL461693.1,OR279985.1,OR323867.1"
eutils="https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

echo "Fetching $accessions from NCBI E-utilities..."
curl -sSf -G "$eutils/efetch.fcgi" \
  --data-urlencode "db=nuccore" \
  --data-urlencode "rettype=gbwithparts" \
  --data-urlencode "retmode=text" \
  --data-urlencode "id=$accessions" \
  -o "$work/variants.gb"
test "$(grep -c '^LOCUS' "$work/variants.gb")" -eq 3
cp "$work/variants.gb" "$out/variants.gb"

# MAFFT lowercases its output unless --preservecase is given; feed it the
# uppercase residues so the rows match what the GenBank parser produces.
python3 - "$reference" "$out/variants.gb" "$work/input.fasta" <<'PY'
import re, sys

*sources, destination = sys.argv[1:]
rows = []
for path in sources:
    for chunk in open(path, encoding="utf-8").read().split("\n//"):
        locus = re.search(r"^LOCUS\s+(\S+)", chunk, re.M)
        if not locus or "\nORIGIN" not in chunk:
            continue
        sequence = re.sub(r"[^A-Za-z]", "", chunk.split("\nORIGIN", 1)[1]).upper()
        rows.append((locus.group(1), sequence))
with open(destination, "w", encoding="utf-8") as handle:
    for name, sequence in rows:
        handle.write(f">{name}\n")
        for i in range(0, len(sequence), 60):
            handle.write(sequence[i:i + 60] + "\n")
print("MAFFT input:", ", ".join(f"{n} ({len(s)} bp)" for n, s in rows))
PY

version="$(docker run --rm --network none "$image" mafft --version 2>&1 | tr -d '\r')"
echo "MAFFT: $version"
command="mafft --auto --preservecase input.fasta"
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v "$work:/data:ro" -w /data "$image" \
  mafft --auto --preservecase input.fasta > "$work/aligned.fasta"
cp "$work/aligned.fasta" "$out/aligned.fasta"

python3 - "$out/PROVENANCE.json" "$reference" "$out/variants.gb" "$work/input.fasta" \
  "$out/aligned.fasta" "$image" "$version" "$command" <<'PY'
import datetime, hashlib, json, sys

destination, reference, variants, mafft_input, aligned, image, version, command = sys.argv[1:]
digest = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
provenance = {
    "dataset": "SARS-CoV-2 reference plus three variant genomes, aligned with MAFFT",
    "accessions": [
        {
            "lineage": "Alpha (B.1.1.7)",
            "accession": "OL461693",
            "version": "OL461693.1",
            "why": "Complete 29,738 bp genome with 11 gene and 12 CDS features and no ambiguity "
                   "codes anywhere, spike included. The lineage is stated in the record's "
                   "reference title ('The Alpha variant (B.1.1.7) of SARS-CoV-2...'). A human "
                   "isolate submitted without any claim of rights.",
        },
        {
            "lineage": "Delta (B.1.617.2)",
            "accession": "OR279985",
            "version": "OR279985.1",
            "why": "Complete 29,689 bp genome with 11 gene and 12 CDS features and no ambiguity "
                   "codes anywhere, spike included. The lineage is explicit in the record as "
                   "/note=\"genotype: B.1.617.2\", which is stronger evidence than a study title. "
                   "A human isolate submitted without any claim of rights.",
        },
        {
            "lineage": "Omicron (BA.1.1, a BA.1 sublineage)",
            "accession": "OR323867",
            "version": "OR323867.1",
            "why": "Complete 29,738 bp genome with 11 gene and 12 CDS features and no ambiguity "
                   "codes anywhere, spike included; the lineage is explicit as "
                   "/note=\"genotype: BA.1.1\". Chosen over a record designated plain BA.1 "
                   "because every bare-BA.1 candidate carried at least one ambiguity code, while "
                   "this BA.1 sublineage is ambiguity-free. Engineered constructs (for example "
                   "reporter clones carrying nLuc) were excluded; this is a natural human "
                   "isolate submitted without any claim of rights.",
        },
    ],
    "reference": {
        "accession": "NC_045512",
        "version": "NC_045512.2",
        "path": reference,
        "note": "The bundled RefSeq reference, unchanged by this script.",
    },
    "ncbiRetrieved": datetime.date.today().isoformat(),
    "ncbiPolicy": "https://www.ncbi.nlm.nih.gov/home/about/policies/",
    "source": {
        "endpoint": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        "parameters": {"db": "nuccore", "rettype": "gbwithparts", "retmode": "text"},
        "note": "No GISAID data: GISAID's terms forbid redistribution.",
    },
    "mafft": {
        "version": version,
        "invocation": "docker",
        "image": image.split("@")[0],
        "imageDigest": image.split("@")[1],
        "command": command,
        "note": "MAFFT's stdout is written unedited; --preservecase keeps the uppercase residues "
                "extracted from the GenBank records, and --auto picks MAFFT's default strategy.",
    },
    "sha256": {
        "sars-cov-2-NC_045512.gb": digest(reference),
        "variants.gb": digest(variants),
        "mafft-input.fasta": digest(mafft_input),
        "aligned.fasta": digest(aligned),
    },
    "licence": {
        "statement": "NCBI places no restrictions on the use or distribution of GenBank data, but "
                     "notes that some submitters may claim patent, copyright or other rights. "
                     "Each record above was checked for such a claim and none was found.",
        "url": "https://www.ncbi.nlm.nih.gov/home/about/policies/",
    },
}
with open(destination, "w", encoding="utf-8") as handle:
    json.dump(provenance, handle, indent=2)
    handle.write("\n")
for name, value in provenance["sha256"].items():
    print(f"{value}  {name}")
PY
