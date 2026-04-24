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
  BioFeature,
  QuantitativeTrack,
  SearchResult,
} from '../domain/bio/types';

// ---------------------------------------------------------------------------
// Bio Worker — Requests (main → worker)
// ---------------------------------------------------------------------------

export interface ProcessRecordsRequest {
  type: 'PROCESS_RECORDS';
  records: SeqRecord[];
}

export interface ParseGenBankRequest {
  type: 'PARSE_GENBANK';
  content: string;
}

export interface ParseFastaRequest {
  type: 'PARSE_FASTA';
  content: string;
}

export interface ParseAnnotationsRequest {
  type: 'PARSE_ANNOTATIONS';
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

export interface ProcessRecordsSuccessResponse {
  type: 'SUCCESS';
  records: SeqRecord[];
  consensus: string;
}

export interface ParseGenBankSuccessResponse {
  type: 'PARSE_SUCCESS';
  records: SeqRecord[];
}

export interface ParseFastaSuccessResponse {
  type: 'FASTA_SUCCESS';
  alignedData: Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'moleculeType'>[];
}

export interface AnnotationsSuccessResponse {
  type: 'ANNOTATIONS_SUCCESS';
  annotations: Record<string, (BioFeature | QuantitativeTrack)[]>;
}

export interface WorkerErrorResponse {
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

/** Minimal record projection sent to the search worker. */
export interface SearchableRecord {
  id: string;
  sequence: string;
  alignedSequence?: string;
}

export interface SearchOptions {
  minScore: number;
  strand: 'fwd' | 'rev' | 'both';
  maxResults: number;
}

export interface SearchWorkerRequest {
  requestId?: number;
  searchQuery: string;
  records: SearchableRecord[];
  mode: 'exact' | 'fuzzy';
  options: SearchOptions;
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
