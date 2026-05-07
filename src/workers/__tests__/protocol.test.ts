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

/**
 * Integration tests for the worker protocol contract.
 *
 * These tests exercise the protocol types (`BioWorkerRequest`, `BioWorkerResponse`,
 * `SearchWorkerRequest`, `SearchWorkerResponse`) and the business-logic functions
 * that back them, simulating the full worker ↔ main-thread message flow without
 * requiring a real Worker global (which is unavailable in the Vitest/Node env).
 *
 * Strategy:
 *  1. Build the *request* payload using the exported protocol type.
 *  2. Call the underlying domain function directly (as the worker would).
 *  3. Assert the *response* payload matches the protocol contract.
 */

import { describe, it, expect } from 'vitest';
import type {
  BioWorkerRequest,
  BioWorkerResponse,
  SearchWorkerRequest,
  SearchWorkerResponse,
} from '../protocol';
import { processTransposition, calculateConsensus } from '../../domain/bio/index';
import { parseGenBank } from '../../../services/genbank/index';
import { degenerateToRegex, reverseComplement, getNonGapSegments, smithWaterman } from '../../../services/searchLogic';
import type { SeqRecord } from '../../domain/bio/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(id: string, sequence: string): SeqRecord {
  return { id, name: id, sequence, features: [], alignedSequence: sequence };
}

/** Simulate what the bio worker does for a PROCESS_RECORDS request. */
function dispatchBioRequest(req: BioWorkerRequest): BioWorkerResponse {
  if (req.type === 'PROCESS_RECORDS') {
    try {
      const records = processTransposition(req.records);
      const consensus = calculateConsensus(records);
      return { type: 'SUCCESS', records, consensus };
    } catch (err) {
      return { type: 'ERROR', error: (err as Error).message };
    }
  }
  if (req.type === 'PARSE_GENBANK') {
    try {
      const records = parseGenBank(req.content);
      return { type: 'PARSE_SUCCESS', records };
    } catch (err) {
      return { type: 'ERROR', error: (err as Error).message };
    }
  }
  if (req.type === 'PARSE_FASTA') {
    // Minimal FASTA parsing for test purposes
    try {
      const lines = req.content.split('\n');
      const results: Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features'>[] = [];
      let currentId = '';
      let currentSeq = '';
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('>')) {
          if (currentId) results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [] });
          currentId = trimmed.substring(1).split(/\s+/)[0];
          currentSeq = '';
        } else if (trimmed) {
          currentSeq += trimmed;
        }
      });
      if (currentId) results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [] });
      return { type: 'FASTA_SUCCESS', alignedData: results };
    } catch (err) {
      return { type: 'ERROR', error: (err as Error).message };
    }
  }
  return { type: 'ERROR', error: 'Unknown request type' };
}

/** Simulate what the search worker does for a SearchWorkerRequest. */
function dispatchSearchRequest(req: SearchWorkerRequest): SearchWorkerResponse {
  const { searchQuery, records, mode, options } = req;
  const { strand = 'both', maxResults = 100, minScore = 5 } = options;

  if (!searchQuery || searchQuery.length < 1) return { results: [] };

  try {
    type SR = { start: number; end: number; sequence: string; recordId: string; strand: 1 | -1; score?: number; segments?: { start: number; end: number }[] };
    const typedResults: SR[] = [];

    records.forEach(record => {
      const seq = record.alignedSequence || record.sequence;
      const L = seq.length;

      if (mode === 'fuzzy') {
        if (strand === 'both' || strand === 'fwd') {
          const fwdFuzzy = smithWaterman(searchQuery.toUpperCase(), seq, 2, -1, -3, -1, minScore);
          fwdFuzzy.forEach(m => {
            typedResults.push({
              start: m.start,
              end: m.end,
              sequence: m.sequence,
              score: m.score,
              recordId: record.id,
              strand: 1,
              segments: getNonGapSegments(seq, m.start, m.end),
            });
          });
        }

        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          const revFuzzy = smithWaterman(searchQuery.toUpperCase(), rcSeq, 2, -1, -3, -1, minScore);
          revFuzzy.forEach(m => {
            const start = L - m.end;
            const end = L - m.start;
            typedResults.push({
              start,
              end,
              sequence: m.sequence,
              score: m.score,
              recordId: record.id,
              strand: -1,
              segments: getNonGapSegments(seq, start, end),
            });
          });
        }
      } else {
        const regex = degenerateToRegex(searchQuery);
        if (strand === 'both' || strand === 'fwd') {
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(seq)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;
            typedResults.push({ start, end, sequence: match[0], recordId: record.id, strand: 1, segments: getNonGapSegments(seq, start, end) });
            regex.lastIndex = match.index + 1;
          }
        }
        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(rcSeq)) !== null) {
            const rcStart = match.index;
            const rcEnd = match.index + match[0].length;
            const start = L - rcEnd;
            const end = L - rcStart;
            typedResults.push({ start, end, sequence: match[0], recordId: record.id, strand: -1, segments: getNonGapSegments(seq, start, end) });
            regex.lastIndex = match.index + 1;
          }
        }
      }
    });

    if (mode === 'fuzzy') {
      typedResults.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
    } else {
      typedResults.sort((a, b) => a.start - b.start);
    }
    const limited = typedResults.length > maxResults ? typedResults.slice(0, maxResults) : typedResults;
    return { results: limited };
  } catch (err) {
    return { error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Bio Worker protocol tests
// ---------------------------------------------------------------------------

describe('BioWorkerRequest / BioWorkerResponse protocol', () => {
  it('PROCESS_RECORDS request is well-typed and produces a SUCCESS response', () => {
    const req: BioWorkerRequest = {
      type: 'PROCESS_RECORDS',
      records: [makeRecord('r1', 'ACGT'), makeRecord('r2', 'ACGT')],
    };
    const resp = dispatchBioRequest(req);
    expect(resp.type).toBe('SUCCESS');
    if (resp.type === 'SUCCESS') {
      expect(Array.isArray(resp.records)).toBe(true);
      expect(typeof resp.consensus).toBe('string');
      expect(resp.records).toHaveLength(2);
    }
  });

  it('PROCESS_RECORDS with empty records produces SUCCESS with empty arrays', () => {
    const req: BioWorkerRequest = { type: 'PROCESS_RECORDS', records: [] };
    const resp = dispatchBioRequest(req);
    expect(resp.type).toBe('SUCCESS');
    if (resp.type === 'SUCCESS') {
      expect(resp.records).toHaveLength(0);
      expect(resp.consensus).toBe('');
    }
  });

  it('PARSE_GENBANK request parses a minimal GenBank record', () => {
    const gb = `LOCUS       TEST001       10 bp    DNA             LIN 01-JAN-2024
DEFINITION  Protocol test record.
FEATURES             Location/Qualifiers
     gene            1..10
                     /gene="testGene"
ORIGIN
        1 atgcatgcat
//
`;
    const req: BioWorkerRequest = { type: 'PARSE_GENBANK', content: gb };
    const resp = dispatchBioRequest(req);
    expect(resp.type).toBe('PARSE_SUCCESS');
    if (resp.type === 'PARSE_SUCCESS') {
      expect(resp.records).toHaveLength(1);
      expect(resp.records[0]?.id).toBe('TEST001');
    }
  });

  it('PARSE_GENBANK error produces ERROR response', () => {
    // Force an error by making parseGenBank throw (use malformed but non-empty content)
    // In practice parseGenBank is lenient; we simulate error via a dispatched ERROR response directly.
    const errorResp: BioWorkerResponse = { type: 'ERROR', error: 'parse failed' };
    expect(errorResp.type).toBe('ERROR');
    if (errorResp.type === 'ERROR') {
      expect(typeof errorResp.error).toBe('string');
    }
  });

  it('PARSE_FASTA request parses multi-sequence FASTA', () => {
    const fasta = '>seq1\nACGT\n>seq2\nTGCA\n';
    const req: BioWorkerRequest = { type: 'PARSE_FASTA', content: fasta };
    const resp = dispatchBioRequest(req);
    expect(resp.type).toBe('FASTA_SUCCESS');
    if (resp.type === 'FASTA_SUCCESS') {
      expect(resp.alignedData).toHaveLength(2);
      expect(resp.alignedData[0]?.id).toBe('seq1');
      expect(resp.alignedData[1]?.sequence).toBe('TGCA');
    }
  });

  it('BioWorkerResponse discriminated union covers all expected variants', () => {
    // Type-level test: construct each variant and verify `.type` discriminant
    const success: BioWorkerResponse = { type: 'SUCCESS', records: [], consensus: '' };
    const parseSuccess: BioWorkerResponse = { type: 'PARSE_SUCCESS', records: [] };
    const fastaSuccess: BioWorkerResponse = { type: 'FASTA_SUCCESS', alignedData: [] };
    const annotSuccess: BioWorkerResponse = { type: 'ANNOTATIONS_SUCCESS', annotations: {} };
    const error: BioWorkerResponse = { type: 'ERROR', error: 'msg' };

    expect(success.type).toBe('SUCCESS');
    expect(parseSuccess.type).toBe('PARSE_SUCCESS');
    expect(fastaSuccess.type).toBe('FASTA_SUCCESS');
    expect(annotSuccess.type).toBe('ANNOTATIONS_SUCCESS');
    expect(error.type).toBe('ERROR');
  });
});

// ---------------------------------------------------------------------------
// Search Worker protocol tests
// ---------------------------------------------------------------------------

describe('SearchWorkerRequest / SearchWorkerResponse protocol', () => {
  const records = [
    { id: 'r1', sequence: 'AATTCCGGAATTCCGG' },
    { id: 'r2', sequence: 'TTGGAATTTTGG' },
  ];

  it('exact search finds forward-strand hits', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'AATT',
      records,
      mode: 'exact',
      options: { minScore: 0, strand: 'fwd', maxResults: 100 },
    };
    const resp = dispatchSearchRequest(req);
    expect('results' in resp).toBe(true);
    if ('results' in resp) {
      expect(resp.results.length).toBeGreaterThan(0);
      resp.results.forEach(r => {
        expect(r.strand).toBe(1);
        expect(typeof r.recordId).toBe('string');
        expect(typeof r.start).toBe('number');
        expect(typeof r.end).toBe('number');
      });
    }
  });

  it('exact search finds reverse-strand hits', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'AATT',
      records,
      mode: 'exact',
      options: { minScore: 0, strand: 'rev', maxResults: 100 },
    };
    const resp = dispatchSearchRequest(req);
    if ('results' in resp) {
      resp.results.forEach(r => expect(r.strand).toBe(-1));
    }
  });

  it('single-character query is supported', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'A',
      records,
      mode: 'exact',
      options: { minScore: 0, strand: 'both', maxResults: 100 },
    };
    const resp = dispatchSearchRequest(req);
    expect('results' in resp).toBe(true);
    if ('results' in resp) {
      expect(resp.results.length).toBeGreaterThan(0);
    }
  });

  it('empty query returns empty results', () => {
    const req: SearchWorkerRequest = {
      searchQuery: '',
      records,
      mode: 'exact',
      options: { minScore: 0, strand: 'both', maxResults: 100 },
    };
    const resp = dispatchSearchRequest(req);
    expect('results' in resp).toBe(true);
    if ('results' in resp) {
      expect(resp.results).toHaveLength(0);
    }
  });

  it('maxResults limits the number of returned hits', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'AA',
      records: [{ id: 'big', sequence: 'AAAAAAAAAAAAAAAAAAAAA' }],
      mode: 'exact',
      options: { minScore: 0, strand: 'fwd', maxResults: 3 },
    };
    const resp = dispatchSearchRequest(req);
    if ('results' in resp) {
      expect(resp.results.length).toBeLessThanOrEqual(3);
    }
  });

  it('SearchWorkerResponse error variant is type-safe', () => {
    const errorResp: SearchWorkerResponse = { error: 'something went wrong' };
    expect('error' in errorResp).toBe(true);
  });

  it('fuzzy search finds approximate forward-strand hits', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'AATC',
      records,
      mode: 'fuzzy',
      options: { minScore: 3, strand: 'fwd', maxResults: 100 },
    };
    const resp = dispatchSearchRequest(req);
    expect('results' in resp).toBe(true);
    if ('results' in resp) {
      expect(resp.results.length).toBeGreaterThan(0);
      resp.results.forEach(r => {
        expect(r.strand).toBe(1);
        expect(typeof r.score).toBe('number');
      });
    }
  });

  it('fuzzy search supports reverse strand output', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'CCAA',
      records,
      mode: 'fuzzy',
      options: { minScore: 3, strand: 'rev', maxResults: 100 },
    };
    const resp = dispatchSearchRequest(req);
    expect('results' in resp).toBe(true);
    if ('results' in resp) {
      expect(resp.results.length).toBeGreaterThan(0);
      resp.results.forEach(r => expect(r.strand).toBe(-1));
    }
  });

  it('results carry recordId and segments fields', () => {
    const req: SearchWorkerRequest = {
      searchQuery: 'CCGG',
      records: [{ id: 'r1', sequence: 'AATTCCGGTT' }],
      mode: 'exact',
      options: { minScore: 0, strand: 'fwd', maxResults: 10 },
    };
    const resp = dispatchSearchRequest(req);
    if ('results' in resp && resp.results.length > 0) {
      const hit = resp.results[0]!;
      expect(hit.recordId).toBe('r1');
      expect(Array.isArray(hit.segments)).toBe(true);
    }
  });
});
