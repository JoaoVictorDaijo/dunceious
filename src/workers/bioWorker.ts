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

// bioWorker.ts
// Handles heavy parsing and transposition tasks off the main thread.
// All message shapes are defined in `./protocol.ts`.

import { processTransposition, calculateConsensus } from '../domain/bio/index';
import { parseGenBank } from '../../services/genbank/index';
import type { BioFeature, FeatureSegment, QuantitativeTrack } from '../domain/bio/types';
import type {
  BioWorkerRequest,
  BioWorkerResponse,
} from './protocol';

/** Annotation track as returned by BED/BedGraph/GFF3 parsers (extends QuantitativeTrack). */
interface AnnotationTrack extends QuantitativeTrack {
  type: string;
}

/** Minimal FASTA record (subset of SeqRecord). */
interface FastaRecord {
  id: string;
  name: string;
  sequence: string;
  features: BioFeature[];
  moleculeType: 'dna' | 'rna' | 'protein';
}

/**
 * Detects whether a sequence is nucleotide or protein.
 *
 * We treat all IUPAC nucleotide ambiguity symbols as nucleotide
 * (A C G T U R Y S W K M B D H V N), plus common alignment gap/mask chars
 * (`-`, `.`, `*`, `?`).
 *
 * Note: sequences composed entirely of characters that overlap with nucleotides
 * (A, C, G, T, N) will be classified as DNA even if they are protein sequences.
 */
const detectMoleculeType = (seq: string): 'dna' | 'rna' | 'protein' => {
  const upper = seq.toUpperCase().replace(/\s+/g, '');
  const nucleotideLike = /^[ACGTURYSWKMBDHVN\-.*?]+$/;

  if (nucleotideLike.test(upper)) {
    if (/U/.test(upper)) return 'rna';
    return 'dna';
  }

  return 'protein';
};

/**
 * Parses FASTA content into simple record objects.
 */
const parseFasta = (content: string): FastaRecord[] => {
  const lines = content.split('\n');
  const results: FastaRecord[] = [];
  let currentId = '';
  let currentSeq = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      if (currentId) {
        results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq) });
      }
      currentId = trimmed.substring(1).split(/\s+/)[0];
      currentSeq = '';
    } else if (trimmed) {
      currentSeq += trimmed;
    }
  });

  if (currentId) {
    results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq) });
  }
  return results;
};

/**
 * Parses BED content.
 */
const parseBED = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
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
const parseGFF3 = (content: string): Record<string, BioFeature[]> => {
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
const parseBedGraph = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
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

self.onmessage = (e: MessageEvent<BioWorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'PROCESS_RECORDS') {
    try {
      const transposed = processTransposition(msg.records);
      const consensus = calculateConsensus(transposed);
      const response: BioWorkerResponse = { type: 'SUCCESS', records: transposed, consensus };
      self.postMessage(response);
    } catch (error) {
      const response: BioWorkerResponse = { type: 'ERROR', error: (error as Error).message };
      self.postMessage(response);
    }
  } else if (msg.type === 'PARSE_GENBANK') {
    try {
      const parsed = parseGenBank(msg.content);
      const response: BioWorkerResponse = { type: 'PARSE_SUCCESS', records: parsed };
      self.postMessage(response);
    } catch (error) {
      const response: BioWorkerResponse = { type: 'ERROR', error: (error as Error).message };
      self.postMessage(response);
    }
  } else if (msg.type === 'PARSE_FASTA') {
    try {
      const parsed = parseFasta(msg.content);
      const response: BioWorkerResponse = { type: 'FASTA_SUCCESS', alignedData: parsed, asAlignment: msg.asAlignment };
      self.postMessage(response);
    } catch (error) {
      const response: BioWorkerResponse = { type: 'ERROR', error: (error as Error).message };
      self.postMessage(response);
    }
  } else if (msg.type === 'PARSE_ANNOTATIONS') {
    try {
      const ext = msg.filename.split('.').pop()?.toLowerCase();
      let parsed: Record<string, AnnotationTrack[] | BioFeature[]>;

      if (ext === 'bed') parsed = parseBED(msg.content, msg.filename);
      else if (ext === 'gff' || ext === 'gff3') parsed = parseGFF3(msg.content);
      else if (ext === 'bedgraph') parsed = parseBedGraph(msg.content, msg.filename);
      else {
        // Fallback detection
        if (msg.content.includes('\t') && msg.content.split('\n')[0].split('\t').length === 9) {
          parsed = parseGFF3(msg.content);
        } else {
          parsed = parseBED(msg.content, msg.filename);
        }
      }

      const response: BioWorkerResponse = { type: 'ANNOTATIONS_SUCCESS', annotations: parsed };
      self.postMessage(response);
    } catch (error) {
      const response: BioWorkerResponse = { type: 'ERROR', error: (error as Error).message };
      self.postMessage(response);
    }
  }
};
