/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

export function carriesFiles(e: DragEvent | React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/**
 * True while the user drags files anywhere over the window, so every drop zone
 * can show it will take them. dragenter/dragleave fire for each element the
 * drag crosses, so a depth count (not the last event) decides when it left.
 */
export function useFileDragActive(): boolean {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current += 1;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const reset = () => {
      depth.current = 0;
      setActive(false);
    };
    // Capture phase: a handler that stops propagation must not strand the count.
    window.addEventListener('dragenter', enter, true);
    window.addEventListener('dragleave', leave, true);
    window.addEventListener('drop', reset, true);
    window.addEventListener('dragend', reset, true);
    return () => {
      window.removeEventListener('dragenter', enter, true);
      window.removeEventListener('dragleave', leave, true);
      window.removeEventListener('drop', reset, true);
      window.removeEventListener('dragend', reset, true);
    };
  }, []);

  return active;
}
