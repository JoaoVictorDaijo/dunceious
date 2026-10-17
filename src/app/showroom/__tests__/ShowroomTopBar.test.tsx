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
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/src/app/testing/renderHarness';
import { ShowroomTopBar } from '../ShowroomTopBar';
import { useShowroomWorkspace, type ShowroomWorkspace } from '../useShowroomWorkspace';

function Harness({ onExplain, onWorkspace }: { onExplain: (...args: unknown[]) => void; onWorkspace: (workspace: ShowroomWorkspace) => void }) {
  const workspace = useShowroomWorkspace();
  onWorkspace(workspace);
  return <ShowroomTopBar workspace={workspace} sidebarOpen={false} onToggleSidebar={() => {}} sidebarToggleRef={createRef()}
    isAlignmentLoaded={false} onExplain={onExplain} onExit={() => {}} />;
}

describe('ShowroomTopBar without an alignment', () => {
  it('gives Conservation its reason and explains instead of switching it on', () => {
    const onExplain = vi.fn();
    let latest: ShowroomWorkspace | null = null;
    render(<Harness onExplain={onExplain} onWorkspace={workspace => { latest = workspace; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers 3/4' }));
    const menu = screen.getByRole('group', { name: 'Layer options' });
    const conservation = within(menu).getByRole('button', { name: 'Conservation' });
    expect(conservation.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText('Conservation needs an alignment: upload a pre-aligned FASTA first')).toBeTruthy();

    fireEvent.click(conservation);
    expect(onExplain).toHaveBeenCalledWith('conservation', expect.anything());
    expect(latest!.showConservation).toBe(false);
    expect(conservation.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Layers 3/4' })).toBeTruthy();
  });
});
