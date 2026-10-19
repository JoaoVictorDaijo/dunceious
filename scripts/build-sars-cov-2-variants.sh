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
# Two hosts are contacted: NCBI E-utilities for the records, and the container
# registry for the MAFFT image. MAFFT itself is digest-pinned and runs with
# --network none, so the alignment is reproducible and offline.

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
# The provenance block below describes these exact versioned records, so a
# re-versioned or substituted NCBI response must abort rather than quietly
# rewrite variants.gb underneath it.
fetched="$(grep -E '^VERSION ' "$work/variants.gb" | awk '{print $2}' | sort | paste -sd, -)"
expected="$(printf '%s' "$accessions" | tr ',' '\n' | sort | paste -sd, -)"
if [ "$fetched" != "$expected" ]; then
  echo "NCBI returned [$fetched], expected [$expected]; refusing to rewrite the data." >&2
  exit 1
fi
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

# Pull before any --network none run, so the alignment and the version probe
# never trigger an implicit pull that would fail (or, with stderr captured,
# write pull progress into the provenance).
docker pull --quiet "$image" > /dev/null
# MAFFT prints --version on stderr, not stdout, so the probe has to read the
# combined streams; the pull above keeps Docker's own chatter out of them, and
# only a line shaped like a version is kept, so nothing else reaches the
# provenance. Empty or unexpected output aborts instead of being recorded.
version="$(docker run --rm --network none "$image" mafft --version 2>&1 | tr -d '\r' | grep -E '^v[0-9]' || true)"
if [ "$(printf '%s\n' "$version" | grep -c .)" -ne 1 ]; then
  echo "Unexpected 'mafft --version' output: [$version]; refusing to record it." >&2
  exit 1
fi
echo "MAFFT: $version"

command="docker run --rm --network none --user \$(id -u):\$(id -g) -v <workdir>:/data:ro -w /data $image mafft --auto --preservecase input.fasta"
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v "$work:/data:ro" -w /data "$image" \
  mafft --auto --preservecase input.fasta \
  > "$work/aligned.fasta" 2> "$work/mafft.log" \
  || { cat "$work/mafft.log" >&2; exit 1; }  # set -e would exit before the log below is shown
cat "$work/mafft.log" >&2
cp "$work/aligned.fasta" "$out/aligned.fasta"

# --auto picks a strategy at run time and announces it only on stderr, under a
# "Strategy:" heading; keep it so the provenance says which one ran.
strategy="$(awk '/^Strategy:/ { getline; gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit }' "$work/mafft.log")"
test -n "$strategy"

python3 - "$out/PROVENANCE.json" "$reference" "$out/variants.gb" "$work/input.fasta" \
  "$out/aligned.fasta" "$image" "$version" "$command" "$strategy" <<'PY'
import datetime, hashlib, json, sys

destination, reference, variants, mafft_input, aligned, image, version, command, strategy = sys.argv[1:]
digest = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
provenance = {
    "dataset": "SARS-CoV-2 reference plus three variant genomes, aligned with MAFFT",
    "accessions": [
        {
            "lineage": "Alpha (B.1.1.7)",
            "accession": "OL461693",
            "version": "OL461693.1",
            "why": "Complete 29,738 bp genome with 11 gene and 12 CDS features and no ambiguity "
                   "codes anywhere, spike included. The record carries no lineage field and no "
                   "lineage in its strain name; its only mention of B.1.1.7 is a reference "
                   "title, which assigns nothing. The Alpha label rests instead on the record "
                   "carrying every lineage-defining change of B.1.1.7: all 17 nucleotide "
                   "changes in Table 1 of Rambaut et al. 2020, 'Preliminary genomic "
                   "characterisation of an emergent SARS-CoV-2 lineage in the UK defined by a "
                   "novel set of spike mutations' (https://virological.org/t/563), were checked "
                   "against this record in the bundled alignment at their NC_045512.2 "
                   "coordinates and all 17 are present: ORF1ab C3267T, C5388A, T6954C and the "
                   "11288-11296 deletion; spike 21765-21770 and 21991-21993 deletions, A23063T, "
                   "C23271A, C23604A, C23709T, T24506G, G24914C; ORF8 C27972T, G28048T, "
                   "A28111G; N 28280 GAT->CTA and C28977T. Six of them are asserted in "
                   "src/app/showroom/__tests__/variantData.test.ts. No Pango assignment tool "
                   "was run, and the amino-acid consequences were not re-derived from a "
                   "translation. A human isolate submitted without any claim of rights.",
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
        "strategy": strategy,
        "script": "scripts/build-sars-cov-2-variants.sh",
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
