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

# Runs the EMBOSS 6.6.0 checks on fixture.gb and prints the results compared in README.md.
# EMBOSS ignores the feature table of a GenBank record that has no REFERENCE block, so the
# fixture carries one.
set -euo pipefail
cd "$(dirname "$0")"
join_lines() { awk '/^>/{if(s!="")print h"\t"s; h=$0; s=""; next}{s=s$0}END{print h"\t"s}'; }
echo "EMBOSS $(embossversion -auto 2>/dev/null | tail -1)"
tmp=$(mktemp -d)
seqret -sequence fixture.gb -sformat genbank -feature -osformat genbank -outseq "$tmp/roundtrip.gb" -auto
echo '--- seqret round-trip location lines'
grep -E '^     [A-Za-z]' "$tmp/roundtrip.gb" | grep -v source | sed 's/^ *//'
for join in N Y; do
  echo "--- extractfeat -type misc_feature -join $join"
  extractfeat -sequence fixture.gb -sformat genbank -type misc_feature -join "$join" -osformat fasta -outseq stdout -auto 2>&1 | join_lines
done
echo '--- extractfeat -type CDS'
extractfeat -sequence fixture.gb -sformat genbank -type CDS -osformat fasta -outseq stdout -auto 2>&1 | join_lines
rm -r "$tmp"
