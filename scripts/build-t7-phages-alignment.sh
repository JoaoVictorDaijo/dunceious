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
# Rebuilds the MAFFT alignment and provenance of examples/nucleotide/t7-phages/
# from the three vendored GenBank records (T7, 13a, T3), which this script
# never rewrites. The only host contacted is the container registry for the
# MAFFT image; MAFFT itself is digest-pinned and runs with --network none, so
# the alignment is reproducible and offline.

set -euo pipefail
cd "$(dirname "$0")/.."

out="examples/nucleotide/t7-phages"
records=(phage-t7-NC_001604.gb phage-13a-NC_011045.gb phage-t3-NC_003298.gb)
versions=(NC_001604.1 NC_011045.1 NC_003298.1)
retrieved="2026-10-19"
image="quay.io/biocontainers/mafft@sha256:dd538a87e8afd1a92ee0a2079438287ff0fc333f8634ba11c7414f1c208ab373"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The provenance below describes these exact versioned records, so a swapped or
# re-versioned file must abort rather than be aligned under the old description.
for i in "${!records[@]}"; do
  version="$(awk '/^VERSION /{print $2; exit}' "$out/${records[$i]}")"
  if [ "$version" != "${versions[$i]}" ]; then
    echo "${records[$i]} is $version, expected ${versions[$i]}; refusing to align it." >&2
    exit 1
  fi
done

# MAFFT lowercases its output unless --preservecase is given; feed it the
# uppercase residues so the rows match what the GenBank parser produces.
python3 - "${records[@]/#/$out/}" "$work/input.fasta" <<'PY'
import re, sys

*sources, destination = sys.argv[1:]
with open(destination, "w", encoding="utf-8") as handle:
    for path in sources:
        chunk = open(path, encoding="utf-8").read()
        name = re.search(r"^LOCUS\s+(\S+)", chunk, re.M).group(1)
        sequence = re.sub(r"[^A-Za-z]", "", chunk.split("\nORIGIN", 1)[1]).upper()
        handle.write(f">{name}\n")
        for i in range(0, len(sequence), 60):
            handle.write(sequence[i:i + 60] + "\n")
        print(f"MAFFT input: {name} ({len(sequence)} bp)")
PY

# Pull before any --network none run, so neither the alignment nor the version
# probe triggers an implicit pull.
docker pull --quiet "$image" > /dev/null
# MAFFT prints --version on stderr; keep only a line shaped like a version.
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
  || { cat "$work/mafft.log" >&2; exit 1; }
cat "$work/mafft.log" >&2
cp "$work/aligned.fasta" "$out/aligned.fasta"

# --auto announces the strategy it picked only on stderr, under "Strategy:".
strategy="$(awk '/^Strategy:/ { getline; gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit }' "$work/mafft.log")"
test -n "$strategy"

python3 - "$out" "$work/input.fasta" "$image" "$version" "$command" "$strategy" "$retrieved" "${records[@]}" <<'PY'
import hashlib, json, os, sys

out, mafft_input, image, version, command, strategy, retrieved, *records = sys.argv[1:]
digest = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
provenance = {
    "dataset": "Three T7-like Escherichia phage genomes, aligned with MAFFT",
    "accessions": [
        {
            "name": "Escherichia phage T7",
            "accession": "NC_001604",
            "version": "NC_001604.1",
            "why": "The reference T7 genome (39,937 bp) and the first row of the alignment. Its "
                   "RefSeq annotation carries a +1 frameshift (gene 0.6B) and two -1 frameshifts "
                   "(genes 5.5-5.7 and 10B), and 26 annotated promoters and terminators.",
        },
        {
            "name": "Escherichia phage 13a",
            "accession": "NC_011045",
            "version": "NC_011045.1",
            "why": "A T7-like phage (38,841 bp) and T7's closest relative of the three: it shares "
                   "47.8% of T7's distinct 16-mers, against 15.1% for T3, so the alignment shows "
                   "long conserved blocks between T7 and 13a.",
        },
        {
            "name": "Enterobacteria phage T3",
            "accession": "NC_003298",
            "version": "NC_003298.1",
            "why": "The classic T7 relative (38,208 bp), more divergent than 13a, so the "
                   "alignment shows graded divergence. Its gene 10 carries the same -1 capsid "
                   "frameshift as T7's.",
        },
    ],
    "ncbiRetrieved": retrieved,
    "ncbiPolicy": "https://www.ncbi.nlm.nih.gov/home/about/policies/",
    "source": {
        "endpoint": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        "parameters": {"db": "nuccore", "rettype": "gbwithparts", "retmode": "text"},
        "note": "The GenBank files were retrieved once and are vendored; this script aligns them "
                "without refetching.",
    },
    "mafft": {
        "version": version,
        "invocation": "docker",
        "image": image.split("@")[0],
        "imageDigest": image.split("@")[1],
        "command": command,
        "strategy": strategy,
        "script": "scripts/build-t7-phages-alignment.sh",
        "note": "MAFFT's stdout is written unedited; --preservecase keeps the uppercase residues "
                "extracted from the GenBank records, and --auto picks MAFFT's default strategy.",
    },
    "sha256": {
        **{record: digest(os.path.join(out, record)) for record in records},
        "mafft-input.fasta": digest(mafft_input),
        "aligned.fasta": digest(os.path.join(out, "aligned.fasta")),
    },
    "licence": {
        "statement": "NCBI places no restrictions on the use or distribution of GenBank data, but "
                     "notes that some submitters may claim patent, copyright or other rights. "
                     "Each record above was checked for such a claim and none was found.",
        "url": "https://www.ncbi.nlm.nih.gov/home/about/policies/",
    },
}
with open(os.path.join(out, "PROVENANCE.json"), "w", encoding="utf-8") as handle:
    json.dump(provenance, handle, indent=2)
    handle.write("\n")
for name, value in provenance["sha256"].items():
    print(f"{value}  {name}")
PY
