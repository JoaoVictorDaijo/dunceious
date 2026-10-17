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

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

export function useProjectActions({ onSaveProject, onOpenProject: _onOpenProject, locked, onShortcut }: {
  onSaveProject: () => string | null;
  onOpenProject: (event: ChangeEvent<HTMLInputElement>) => void;
  locked: boolean;
  onShortcut?: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const save = () => { const fileName = onSaveProject(); if (fileName) setSaved(fileName); };
  const openPicker = () => { if (!locked) picker.current?.click(); };
  // The document listener outlives renders, so it reads the latest handlers through a ref.
  const shortcuts = useRef({ save, openPicker, onShortcut });
  shortcuts.current = { save, openPicker, onShortcut };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key !== 's' && key !== 'o') return;
      event.preventDefault();
      shortcuts.current.onShortcut?.();
      if (key === 's') shortcuts.current.save(); else shortcuts.current.openPicker();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(null), 3000);
    return () => window.clearTimeout(timer);
  }, [saved]);
  return { save, openPicker, picker, saved };
}
