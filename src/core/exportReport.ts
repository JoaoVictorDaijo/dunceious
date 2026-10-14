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

import type { DetailKey, SequenceDetails, SeqRecord } from '@/src/domain/bio/types';
import { DETAIL_QUALIFIER, readDetails, isDetailEdited, validateDetail } from '@/src/domain/bio/details';

export interface ExportReport {
  writtenDetails: Record<DetailKey, number>;
  invalidDetailsOmitted: Record<DetailKey, number>;
  droppedAttributes: number;
  missingOrganism: number;
  adjustedIds: { from: string; to: string }[];
  deprecatedModifiersOmitted: number;
}

export interface ExportResult { text: string; report: ExportReport }

export function emptyReport(): ExportReport {
  return {
    writtenDetails: { organism: 0, host: 0, location: 0, collectionDate: 0 },
    invalidDetailsOmitted: { organism: 0, host: 0, location: 0, collectionDate: 0 },
    droppedAttributes: 0, missingOrganism: 0, adjustedIds: [], deprecatedModifiersOmitted: 0,
  };
}

/** Submitter values pass through; only edits are subject to interchange validation. */
export function detailsForExport(record: SeqRecord, report: ExportReport): SequenceDetails {
  const details = readDetails(record);
  for (const key of Object.keys(DETAIL_QUALIFIER) as DetailKey[]) {
    const value = details[key];
    if (!value) continue;
    if (isDetailEdited(record, key) && validateDetail(key, value)) {
      delete details[key];
      report.invalidDetailsOmitted[key]++;
    } else report.writtenDetails[key]++;
  }
  return details;
}
