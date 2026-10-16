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

const LANDSCAPE = '(orientation: landscape)';

const readLandscape = () => typeof window.matchMedia === 'function' ? window.matchMedia(LANDSCAPE).matches : true;

/** Whether the device is held sideways, following rotation. The showroom never locks orientation. */
export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(readLandscape);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(LANDSCAPE);
    const update = () => setLandscape(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return landscape;
}
