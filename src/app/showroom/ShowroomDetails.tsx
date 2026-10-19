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

import RecordDetailsModal from '@/src/app/components/RecordDetailsModal';
import type { ExplainId } from './explanations';
import type { ShowroomView } from './useShowroomView';

const noop = () => {};

/**
 * The workbench's real details panel, mounted here because App mounts it there.
 * Reading and Focus work; Export and the switches that would change the
 * annotation's stored display explain. Copies explain through the UI effects.
 */
export function ShowroomDetails({ view, explain }: { view: ShowroomView; explain: (id: ExplainId) => void }) {
  if (!view.details) return null;
  const { record, feature } = view.details;
  // As in App, the bases controls exist only for an annotation, not a whole record.
  const showBases = feature ? () => explain('show-bases') : undefined;
  return (
    <RecordDetailsModal
      record={record}
      feature={feature}
      onClose={view.closeDetails}
      onFocusFeature={view.focusOn}
      onExportRecord={() => explain('export')}
      onCopyLog={noop}
      onSetShowBases={showBases}
      onSetBasesMode={showBases}
      onRemoveSearchDetails={() => explain('remove-search-details')}
    />
  );
}
