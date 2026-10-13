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
