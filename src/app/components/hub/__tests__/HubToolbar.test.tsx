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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import HubToolbar from '../HubToolbar';
function Subject({ navigate = () => {}, exportFasta = () => {} }: { navigate?: (direction: number) => void; exportFasta?: () => void }) {
  const state = useHubState();
  return <HubToolbar state={state} matchIndex={0} matchCount={3} onNavigate={navigate} onAdd={() => {}} onExport={exportFasta} more={<span />} />;
}
describe('HubToolbar', () => {
  it('steps matches with Enter and Shift+Enter and keeps exports reachable', () => {
    const navigate = vi.fn(), exportFasta = vi.fn(); render(<Subject navigate={navigate} exportFasta={exportFasta} />);
    const search = screen.getByRole('searchbox', { name: 'Search annotations' });
    fireEvent.change(search, { target: { value: 'ORF4b' } });
    fireEvent.keyDown(search, { key: 'Enter' }); expect(navigate).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('1 / 3')).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Enter', shiftKey: true }); expect(navigate).toHaveBeenLastCalledWith(-1);
    fireEvent.click(screen.getByRole('button', { name: 'Export…' })); expect(exportFasta).toHaveBeenCalledOnce();
  });
});
