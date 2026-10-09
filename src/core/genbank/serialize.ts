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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { splitWrapAround } from '@/src/domain/bio/intervals';
import { getFeatureStrand } from '@/src/domain/bio/strand';

/** Rebuild an edited/custom location from its existing segments, preserving
 * their order. This serializes coordinates; it does not extract a spliced product.
 */
function featureLocation(feature: BioFeature, sequenceLength: number): string {
  if (feature.locationString) return feature.locationString;
  const segments = feature.segments?.length ? feature.segments : splitWrapAround(feature.start, feature.end, sequenceLength);
  const mixed = segments.some(segment => 'strand' in segment && segment.strand !== undefined);
  const locations = segments.map(segment => {
    const location = `${segment.start + 1}..${segment.end}`;
    const strand = 'strand' in segment ? segment.strand : undefined;
    return mixed && (strand ?? feature.strand) === -1 ? `complement(${location})` : location;
  });
  const location = locations.length > 1 ? `join(${locations.join(',')})` : locations[0];
  return !mixed && feature.strand === -1 ? `complement(${location})` : location;
}

/**
 * Serializes records to GenBank flat-file text.
 *
 * Reconstructs 1-based coordinates from the 0-based half-open model for FEATURES
 * locations (`f.start + 1..f.end`), preferring a preserved `locationString`
 * (keeps partial/join syntax). The DEFINITION line is stamped with the
 * ` Exported by Dunceious.` marker, stripping any pre-existing copy first so
 * repeated exports don't accumulate duplicates. The LOCUS line differs by
 * molecule type: protein records use the `aa` unit and omit the molecule-type
 * field; nucleotide records use `bp` with `RNA` or `DNA`. Metadata keys prefixed
 * with `_` are internal and omitted as qualifiers. ORIGIN lowercases the
 * sequence, 60 chars/line grouped
 * by 10 with a 1-based position gutter.
 */
/**
 * INSDC qualifiers that carry no value (the parser stores them as ''). They are
 * written as a bare `/key`; any other empty value is dropped as noise.
 */
const FLAG_QUALIFIERS = new Set([
  'circular_RNA', 'environmental_sample', 'focus', 'germline', 'macronuclear', 'partial',
  'proviral', 'pseudo', 'rearranged', 'ribosomal_slippage', 'trans_splicing', 'transgenic',
]);

export const exportToGenBank = (records: SeqRecord[]): string => {
  if (records.some(record => record.features.some(feature => typeof getFeatureStrand(feature) !== 'number'))) {
    throw new Error('GenBank cannot preserve annotations with unknown or unstranded direction. Export GFF3 or project JSON to preserve these annotations, or choose an explicit strand.');
  }
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
      const molecule = r.moleculeType === 'rna' ? 'RNA' : 'DNA';
      gb += `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} bp    ${molecule}     ${topology}   UNK ${date}\n`;
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
      const location = featureLocation(f, length);
      gb += `     ${f.type.padEnd(15)} ${location}\n`;
      // Custom features may have no name-bearing qualifier. Keep their visible
      // name without changing any qualifiers on existing imported features.
      const namedQualifiers = ['gene', 'product', 'label', 'locus_tag'];
      if (!namedQualifiers.some(key => f.metadata?.[key])) {
        gb += `                     /label="${escapeQualifierValue(f.name)}"\n`;
      }
      if (f.metadata) {
        Object.entries(f.metadata).forEach(([k, v]) => {
          // Keys prefixed with '_' are internal Dunceious fields, not GenBank qualifiers
          if (k.startsWith('_')) return;
          if (v === '' && FLAG_QUALIFIERS.has(k)) {
            gb += `                     /${k}\n`;
            return;
          }
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
