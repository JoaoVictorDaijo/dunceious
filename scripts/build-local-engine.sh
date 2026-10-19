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
image="emscripten/emsdk:3.1.74@sha256:af45409f3199d88db4b1b03af0098532c8fb33a375ac257463eeb0a622870d06"
output="${1:-public/wasm/local-align.wasm}"
mkdir -p "$(dirname "$output")"
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -e SOURCE_DATE_EPOCH=0 -e TZ=UTC -e LC_ALL=C \
  -v "$PWD:/src" -w /src "$image" \
  emcc wasm/local-align/matcher_engine.c -o "$output" \
  -std=c11 -O2 --no-entry -fno-ident -ffile-prefix-map=/src=. \
  -s STANDALONE_WASM=1 -s FILESYSTEM=0 -s ALLOW_MEMORY_GROWTH=1 \
  -s MALLOC=emmalloc -s ABORTING_MALLOC=0 -s ASSERTIONS=0 \
  -s EXPORTED_FUNCTIONS='["_la_max_score","_la_set_checkpoints","_la_checkpoint_step","_la_checkpoint_stat","_la_create","_la_bigpass_step","_la_next","_la_destroy","_la_peak_memory","_malloc","_free"]'
test "$(wc -c < "$output")" -lt 26214400
sha256sum "$output"
