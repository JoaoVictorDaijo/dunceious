/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { SeqRecord } from '@/src/domain/bio/types';

export const exportToGenBank = (records: SeqRecord[]): string => {
  return records.map(r => {
    const escapeQualifierValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, '-');
    const seq = r.sequence;
    const length = seq.length;
    const topology = r.isCircular ? 'circular' : 'linear  ';
    const isProtein = r.moleculeType === 'protein';

    let gb = '';

    // LOCUS – protein records use "aa" as the unit and omit the molecule type
    if (isProtein) {
      gb += `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} aa            ${topology}   UNK ${date}\n`;
    } else {
      gb += `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} bp    DNA     ${topology}   UNK ${date}\n`;
    }

    // DEFINITION – always stamped with the Dunceious exporter marker.
    // Strip any existing marker first so repeated exports don't accumulate duplicates.
    const DUNCEIOUS_MARKER = ' Exported by Dunceious.';
    const rawDefinition = (r.definition || r.name || r.id).replace(DUNCEIOUS_MARKER, '');
    gb += `DEFINITION  ${rawDefinition}${DUNCEIOUS_MARKER}\n`;

    // ACCESSION / VERSION
    gb += `ACCESSION   ${r.id}\n`;
    gb += `VERSION     ${r.id}\n`;
    gb += `KEYWORDS    .\n`;

    // SOURCE / ORGANISM from source feature when available
    const sourceFeature = r.features.find(f => f.type === 'source');
    const organism = sourceFeature?.metadata?.['organism'] ?? '.';
    gb += `SOURCE      ${organism}\n`;
    gb += `  ORGANISM  ${organism}\n`;

    // FEATURES
    gb += `FEATURES             Location/Qualifiers\n`;
    r.features.forEach(f => {
      // Prefer the original location string (preserves partial/join syntax);
      // fall back to reconstructing a simple 1-based location.
      const location = f.locationString ?? (
        f.strand === 1
          ? `${f.start + 1}..${f.end}`
          : `complement(${f.start + 1}..${f.end})`
      );
      gb += `     ${f.type.padEnd(15)} ${location}\n`;
      if (f.metadata) {
        Object.entries(f.metadata).forEach(([k, v]) => {
          // Keys prefixed with '_' are internal Dunceious fields, not GenBank qualifiers
          if (k.startsWith('_')) return;
          if (v !== undefined && v !== null && v !== '') {
            gb += `                     /${k}="${escapeQualifierValue(String(v))}"\n`;
          }
        });
      }
    });

    // ORIGIN
    gb += `ORIGIN\n`;
    const originSeq = seq.toLowerCase();
    for (let i = 0; i < originSeq.length; i += 60) {
      const lineSeq = originSeq.substring(i, i + 60);
      const groups: string[] = [];
      for (let j = 0; j < lineSeq.length; j += 10) {
        groups.push(lineSeq.substring(j, j + 10));
      }
      gb += `${(i + 1).toString().padStart(9)} ${groups.join(' ')}\n`;
    }
    gb += `//\n`;
    return gb;
  }).join('\n');
};
