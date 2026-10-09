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

/** One editable qualifier line. `id` is a stable React key; keys can be renamed mid-edit. */
export interface QualifierRow {
  id: number;
  key: string;
  value: string;
}

/** Keys starting with `_` are Dunceious bookkeeping (e.g. `_gffStrand`), never shown or exported. */
export const isInternalKey = (key: string): boolean => key.startsWith('_');

/** The user-facing qualifiers of a feature, in their stored order. */
export function qualifierRows(metadata: Record<string, string> | undefined): QualifierRow[] {
  return Object.entries(metadata ?? {})
    .filter(([key]) => !isInternalKey(key))
    .map(([key, value], id) => ({ id, key, value: String(value) }));
}

/** GenBank writes qualifiers as `/key=`, so a pasted leading slash is not part of the name. */
export const normalizeQualifierKey = (key: string): string => key.trim().replace(/^\/+/, '');

/**
 * Rebuild a feature's metadata from edited rows. Internal keys survive untouched;
 * rows with a blank key are drafts and are skipped; on a duplicate key the later
 * row wins, matching how a plain object assignment would resolve it.
 */
export function metadataFromRows(
  previous: Record<string, string> | undefined,
  rows: QualifierRow[],
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(previous ?? {})) {
    if (isInternalKey(key)) metadata[key] = value;
  }
  for (const row of rows) {
    const key = normalizeQualifierKey(row.key);
    if (key && !isInternalKey(key)) metadata[key] = row.value;
  }
  return metadata;
}

export type QualifierIssue = 'duplicate' | 'internal' | 'invalid';

/** Why a row would not round-trip through GenBank as typed, or null when it will. */
export function qualifierIssue(row: QualifierRow, rows: QualifierRow[]): QualifierIssue | null {
  const key = normalizeQualifierKey(row.key);
  if (!key) return null;
  if (isInternalKey(key)) return 'internal';
  if (!/^[A-Za-z0-9_\-'*]+$/.test(key)) return 'invalid';
  const later = rows.slice(rows.indexOf(row) + 1);
  return later.some(r => normalizeQualifierKey(r.key) === key) ? 'duplicate' : null;
}
