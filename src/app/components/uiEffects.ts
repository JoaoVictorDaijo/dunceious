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

import { createContext, useContext } from 'react';

export type HostAction = 'remove-records' | 'set-detail' | 'export-edit-details';
export type ImportKind = 'sequences' | 'annotations' | 'alignment' | 'project';

export interface UiEffects {
  confirm(message: string): boolean;
  /** False means the host declined; callers must show no success status or log. */
  copyText(text: string): Promise<boolean>;
  chooseFile(kind: ImportKind, open: () => void): void;
  allowAction(action: HostAction): boolean;
  persistOpenState: boolean;
  hoverTips: boolean;
  /**
   * The Hub's sequence cards sized for a phone held sideways: the slim genome strip (the
   * one the pinned section bar uses) instead of the full one with its ruler, and a thin
   * gutter above each card. At 360 px of height the full card filled the list on its own;
   * this leaves room for annotation rows on the first screen. The workbench keeps the full
   * strip and the full gutter.
   */
  compactHubCards: boolean;
  portalTarget: HTMLElement | null;
  overlayActive: boolean;
  closeExportOnSave: boolean;
}

export const DEFAULT_UI_EFFECTS: UiEffects = {
  confirm: message => window.confirm(message),
  copyText: async text => {
    await navigator.clipboard.writeText(text);
    return true;
  },
  chooseFile: (_kind, open) => open(),
  allowAction: () => true,
  persistOpenState: true,
  hoverTips: true,
  compactHubCards: false,
  portalTarget: null,
  overlayActive: false,
  closeExportOnSave: true,
};

export const UiEffectsContext = createContext<UiEffects>(DEFAULT_UI_EFFECTS);

export function useUiEffects(): UiEffects {
  return useContext(UiEffectsContext);
}
