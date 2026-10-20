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
 * Worker Protocol — strict TypeScript contracts for all worker ↔ main-thread messages.
 *
 * Naming convention:
 *  - `*Request`  – messages sent FROM the main thread TO a worker.
 *  - `*Response` – messages sent FROM a worker TO the main thread.
 *
 * Both workers export a discriminated-union type (`BioWorkerRequest`,
 * `BioWorkerResponse`, `SearchWorkerRequest`, `SearchWorkerResponse`) that
 * covers every possible message in that channel.
 */

import type {
  SeqRecord,
  SequenceDetails,
  BioFeature,
  QuantitativeTrack,
  SearchResult,
  SearchableRecord,
} from '../domain/bio/types';
import type { LocalFilters, LocalStreamOutcome } from '../core/search/local/stream';
import type { LocalSearchCounts } from '../core/search/local/selection';
import type { LocalScoringId } from '../core/search/local/scoring';
import type { GffSourceRegion } from '../core/formats/gff3';

// ---------------------------------------------------------------------------
// Bio Worker — Requests (main → worker)
// ---------------------------------------------------------------------------

export interface BioRequestContext {
  requestId?: number;
}

export interface ProcessRecordsRequest extends BioRequestContext {
  type: 'PROCESS_RECORDS';
  records: SeqRecord[];
}

/** null marks an incoming ID shared by multiple records in one drop. */
export type BatchIdMap = Record<string, string | null>;

export interface ParseGenBankRequest extends BioRequestContext {
  type: 'PARSE_GENBANK';
  filename: string;
  content: string;
}

export interface ParseFastaRequest extends BioRequestContext {
  type: 'PARSE_FASTA';
  filename: string;
  content: string;
  /** When true the FASTA is an external pre-aligned overlay; otherwise it is a batch load. */
  asAlignment?: boolean;
}

export interface ParseAnnotationsRequest extends BioRequestContext {
  type: 'PARSE_ANNOTATIONS';
  idMap?: BatchIdMap;
  filename: string;
  content: string;
}

/** Union of all messages the bio worker accepts. */
export type BioWorkerRequest =
  | ProcessRecordsRequest
  | ParseGenBankRequest
  | ParseFastaRequest
  | ParseAnnotationsRequest;

// ---------------------------------------------------------------------------
// Bio Worker — Responses (worker → main)
// ---------------------------------------------------------------------------

export interface ProcessRecordsSuccessResponse extends BioRequestContext {
  type: 'SUCCESS';
  records: SeqRecord[];
  consensus: string;
}

export interface ParseGenBankSuccessResponse extends BioRequestContext {
  type: 'PARSE_SUCCESS';
  /** Workspace assignments supplied by the main-thread acknowledgment. */
  idMap?: BatchIdMap;
  filename: string;
  records: SeqRecord[];
}

/** The record shape carried in a FASTA_SUCCESS response's alignedData. */
export type FastaAlignedRecord = Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType' | 'definition' | 'fastaModifiers'> & {
  details?: SequenceDetails;
  /** Cleaned description text can complete a whitespace-containing alignment ID. */
  header?: string;
};

export interface ParseFastaSuccessResponse extends BioRequestContext {
  type: 'FASTA_SUCCESS';
  idMap?: BatchIdMap;
  filename: string;
  alignedData: FastaAlignedRecord[];
  asAlignment?: boolean;
}

export interface AnnotationsSuccessResponse extends BioRequestContext {
  type: 'ANNOTATIONS_SUCCESS';
  idMap?: BatchIdMap;
  annotations: Record<string, (BioFeature | QuantitativeTrack)[]>;
  details: Record<string, GffSourceRegion>;
}

export interface WorkerErrorResponse extends BioRequestContext {
  type: 'ERROR';
  error: string;
}

/** Union of all messages the bio worker can post back. */
export type BioWorkerResponse =
  | ProcessRecordsSuccessResponse
  | ParseGenBankSuccessResponse
  | ParseFastaSuccessResponse
  | AnnotationsSuccessResponse
  | WorkerErrorResponse;

// ---------------------------------------------------------------------------
// Search Worker — Requests (main → worker)
// ---------------------------------------------------------------------------

export type { SearchableRecord } from '../domain/bio/types';

export function localSearchOptions(options: SearchOptions) {
  return { fuzzyMethod: options.fuzzyMethod ?? 'whole', localFilters: options.localFilters ?? { minIdentity: null, minQueryCoverage: null } };
}

export interface SearchOptions {
  fuzzyMethod?: 'whole' | 'local';
  localFilters?: LocalFilters;
  /** Fuzzy only: minimum percent identity over the whole query (see `maxEditsForIdentity`). */
  minIdentity: number;
  strand: 'fwd' | 'rev' | 'both';
  maxResults: number;
}

export interface SearchWorkerRequest {
  requestId?: number;
  searchQuery: string;
  records: SearchableRecord[];
  mode: 'exact' | 'fuzzy';
  options: SearchOptions;
  moleculeType?: 'dna' | 'rna' | 'protein';
}

// ---------------------------------------------------------------------------
// Search Worker — Responses (worker → main)
// ---------------------------------------------------------------------------

export interface SearchSuccessResponse {
  requestId?: number;
  results: SearchResult[];
}

export interface SearchErrorResponse {
  requestId?: number;
  error: string;
}

/** Union of all messages the search worker can post back. */
export type SearchWorkerResponse = SearchSuccessResponse | SearchErrorResponse;

export interface LocalSearchRun {
  query: string;
  scoring: LocalScoringId;
  moleculeType: 'dna' | 'rna' | 'protein';
  limit: number;
  filters: LocalFilters;
  records: SearchableRecord[];
  strand: 'fwd' | 'rev' | 'both';
}
export interface LocalSearchProgress { phase: 'score' | 'align'; streamsDone: number; streamsTotal: number; currentFraction: number }
export interface LocalSearchResult { results: SearchResult[]; counts: LocalSearchCounts }
/** `scoreWasm` is the SSW SIMD score module, sent only where wasm SIMD validates. */
export type LocalSearchRequest = { type: 'init'; wasm: ArrayBuffer; scoreWasm?: ArrayBuffer }
  | { type: 'bound'; requestId: number; boundScore2: number } | {
  type: 'search'; phase: 'score' | 'align'; requestId: number; boundScore2: number | null; query: string; scoring: LocalScoringId;
  moleculeType: 'dna' | 'rna' | 'protein'; limit: number; filters: LocalFilters;
  jobs: Array<{ recordIndex: number; record: SearchableRecord; strand: 1 | -1; upperBoundScore2?: number }>;
};
export type LocalSearchResponse = { type: 'ready' } | { type: 'init-error'; error: string }
  | { type: 'hit'; requestId: number; recordIndex: number; strand: 1 | -1; hit: SearchResult }
  | { type: 'progress'; requestId: number; recordIndex: number; strand: 1 | -1; fraction: number }
  | { type: 'stream-done'; phase: 'score' | 'align'; requestId: number; outcome: LocalStreamOutcome;
    /** WASM linear-memory high-water mark in bytes; excludes JS and browser overhead. */
    peakMemoryBytes: number }
  | { type: 'error'; requestId: number; error: string };
