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

// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, stubResizeObserver, installCanvasRecorder } from '@/src/app/testing/renderHarness';
import ShellRoot from '../ShellRoot';

class IdleWorker {
  onmessage: unknown = null;
  postMessage() {}
  terminate() {}
}

beforeEach(() => { stubResizeObserver(); installCanvasRecorder(); vi.stubGlobal('Worker', IdleWorker); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ShellRoot', () => {
  it('renders the fallback first, then the desktop app', async () => {
    render(<ShellRoot />);
    expect(screen.getByText('Loading Dunceious…')).toBeTruthy();
    expect(await screen.findByText('Workspace Empty', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('Loading Dunceious…')).toBeNull();
  });
});
