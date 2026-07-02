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

import type { BioFeature, FeatureSegment, QuantitativeTrack, SeqRecord } from '@/src/domain/bio/types';

/** Annotation track as returned by BED/BedGraph/GFF3 parsers (extends QuantitativeTrack). */
export interface AnnotationTrack extends QuantitativeTrack {
  type: string;
}

/**
 * Parses BED content.
 */
export const parseBED = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
  const lines = content.split('\n');
  const results: Record<string, AnnotationTrack[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const scoreVal = parseFloat(parts[4]);

    if (isNaN(start) || isNaN(end)) return;

    if (!results[chrom]) results[chrom] = [];

    const finalScore = isNaN(scoreVal) ? 0 : scoreVal;

    let track = results[chrom].find(t => t.type === 'track' && t.name === filename);
    if (!track) {
      track = {
        type: 'track',
        kind: 'interval',
        id: `${filename}_${chrom}`,
        name: filename,
        data: []
      };
      results[chrom].push(track);
    }
    track.data.push({ start, end, value: finalScore });
  });

  return results;
};

/**
 * Parses GFF3 content.
 */
export const parseGFF3 = (content: string): Record<string, BioFeature[]> => {
  const lines = content.split('\n');
  const results: Record<string, BioFeature[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#')) return;

    const parts = line.trim().split('\t');
    if (parts.length < 9) return;

    const seqid = parts[0];
    const source = parts[1];
    const type = parts[2];
    const start = parseInt(parts[3]) - 1;
    const end = parseInt(parts[4]);
    const score = parts[5];
    const strandChar = parts[6];
    const phase = parts[7];
    const attributesStr = parts[8];

    if (isNaN(start) || isNaN(end)) return;

    const strand: 1 | -1 = strandChar === '-' ? -1 : 1;
    const metadata: Record<string, string> = { source, phase };
    if (score !== '.') metadata.score = score;

    const attrParts = attributesStr.split(';');
    let name = '';
    attrParts.forEach(attr => {
      const [key, value] = attr.split('=');
      if (key && value) {
        metadata[key] = decodeURIComponent(value);
        if (key.toLowerCase() === 'id' && !name) name = value;
        if (key.toLowerCase() === 'name') name = value;
      }
    });

    if (!name) name = `${type}_${start + 1}`;

    const segments: FeatureSegment[] = [{ start, end }];
    const feature: BioFeature = {
      type,
      name,
      start,
      end,
      strand,
      segments,
      metadata
    };

    if (!results[seqid]) results[seqid] = [];
    results[seqid].push(feature);
  });

  return results;
};

/**
 * Parses BedGraph content.
 */
export const parseBedGraph = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
  const lines = content.split('\n');
  const results: Record<string, AnnotationTrack[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const value = parseFloat(parts[3]);

    if (isNaN(start) || isNaN(end) || isNaN(value)) return;

    if (!results[chrom]) results[chrom] = [];

    let track = results[chrom].find(t => t.type === 'track' && t.name === filename);
    if (!track) {
      track = {
        type: 'track',
        kind: 'line',
        id: `${filename}_${chrom}`,
        name: filename,
        data: []
      };
      results[chrom].push(track);
    }

    track.data.push({ start, end, value });
  });

  return results;
};

export const exportToGff = (records: SeqRecord[]): string => {
  let gff = "##gff-version 3\n";
  records.forEach(r => {
    r.features.forEach(f => {
      const strand = f.strand === 1 ? '+' : '-';
      const attributes = `ID=${f.name.replace(/\s+/g, '_')};Name=${f.name}`;
      gff += `${r.id}\tDunceious\t${f.type}\t${f.start + 1}\t${f.end}\t.\t${strand}\t0\t${attributes}\n`;
    });
  });
  return gff;
};
