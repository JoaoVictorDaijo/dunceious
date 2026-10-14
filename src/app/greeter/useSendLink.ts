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

import { useEffect, useState } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

export const COPIED_RESET_MS = 2000;
const SHARE_TEXT = 'Dunceious, a genome workbench that runs in the browser. Open it on a computer:';

export interface SendLink {
  url: string;
  /** The URL without its scheme, for display. */
  label: string;
  canShare: boolean;
  share: () => Promise<void>;
  copy: () => Promise<void>;
  copyState: CopyState;
  mailto: string;
}

export function useSendLink(url: string = `${window.location.origin}/`): SendLink {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    if (copyState !== 'copied') return;
    const id = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
    return () => clearTimeout(id);
  }, [copyState]);

  const share = async () => {
    try {
      await navigator.share({ title: 'Dunceious', text: SHARE_TEXT, url });
    } catch {
      // Dismissing the share sheet rejects too; there is nothing to report.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return {
    url,
    label: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    canShare,
    share,
    copy,
    copyState,
    mailto: `mailto:?subject=${encodeURIComponent('Dunceious')}&body=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`,
  };
}
