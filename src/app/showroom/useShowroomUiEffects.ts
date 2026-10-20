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

import { useMemo } from 'react';
import type { HostAction, ImportKind, UiEffects } from '@/src/app/components/uiEffects';
import type { ExplainId } from './explanations';

const IMPORT_EXPLANATION: Record<ImportKind, ExplainId> = {
  sequences: 'ingest-sequences',
  annotations: 'ingest-annotations',
  alignment: 'ingest-alignment',
  project: 'ingest-project',
};

const ACTION_EXPLANATION: Record<HostAction, ExplainId> = {
  'remove-records': 'remove-record',
  'set-detail': 'edit-record',
  'export-edit-details': 'export-edit-details',
};

/**
 * What the reused components do on their own, redirected: copies, file pickers and
 * vetoed actions explain, nothing persists and no hover tooltip is promised.
 * `confirm` is reached only by the discard of a dirty draft when a second editor opens.
 * Saving is vetoed here, so no record would change either way — but the visitor's
 * keystrokes would, so the answer is no: the draft stays and the explanation says what
 * saving details would do. Dialogs portal into `portalTarget`, inside the wrapper that
 * portrait makes inert.
 */
export function useShowroomUiEffects(explain: (id: ExplainId) => void, overlayActive: boolean, portalTarget: HTMLElement | null): UiEffects {
  return useMemo<UiEffects>(() => ({
    confirm: () => { explain('edit-record'); return false; },
    copyText: async () => { explain('copy'); return false; },
    chooseFile: kind => explain(IMPORT_EXPLANATION[kind]),
    allowAction: action => { explain(ACTION_EXPLANATION[action]); return false; },
    persistOpenState: false,
    hoverTips: false,
    compactHubCards: true,
    portalTarget,
    overlayActive,
    closeExportOnSave: false,
  }), [explain, overlayActive, portalTarget]);
}
