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
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@/src/app/testing/renderHarness';
import OptionsPanel from '../OptionsPanel';
import { modifierLabel } from '@/src/app/logic/shortcuts';

const noop = () => {};
const saveNothing = () => null;
afterEach(() => vi.useRealTimers());
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));

it('saves, opens and clears the project, closing the menu after each action', () => {
  const save = vi.fn(), open = vi.fn(), clear = vi.fn();
  render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={save} onOpenProject={open} onClearWorkspace={clear} sequenceCount={3} />);
  openMenu();
  expect(screen.getByText('3 sequences in this workspace')).toBeTruthy();
  expect(screen.getByText('Asks first, then removes 3 sequences')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
  expect(save).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
  const picker = screen.getByLabelText('Open project file') as HTMLInputElement;
  const click = vi.spyOn(picker, 'click');
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Open project…' }));
  expect(click).toHaveBeenCalledOnce();
  expect(picker.accept).toBe('.json');
  fireEvent.change(picker, { target: { files: [new File(['{}'], 'project.json')] } });
  expect(open).toHaveBeenCalledOnce();
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Clear workspace…' }));
  expect(clear).toHaveBeenCalledOnce();
});

it.each([
  { name: 'empty', count: 0, locked: false, openDisabled: false },
  { name: 'locked', count: 2, locked: true, openDisabled: true },
])('disables clear when the workspace is $name, and keeps save available', ({ count, locked, openDisabled }) => {
  const clear = vi.fn();
  render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={saveNothing} onOpenProject={noop} onClearWorkspace={clear} sequenceCount={count} locked={locked} />);
  openMenu();
  const clearItem = screen.getByRole('button', { name: 'Clear workspace…' });
  expect(clearItem).toHaveProperty('disabled', true);
  fireEvent.click(clearItem);
  expect(clear).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save project' })).toHaveProperty('disabled', false);
  expect(screen.getByRole('button', { name: 'Open project…' })).toHaveProperty('disabled', openDisabled);
  expect((screen.getByLabelText('Open project file') as HTMLInputElement).disabled).toBe(openDisabled);
});

it('closes on Escape and returns focus to the trigger', () => {
  render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={saveNothing} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={1} />);
  const trigger = screen.getByRole('button', { name: 'Project and options' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('1 sequence in this workspace')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('confirms a save with the file name, then clears the notice', () => {
  vi.useFakeTimers();
  render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={() => 'coronaviruses.json'} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={3} />);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('');
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
  expect(status.textContent).toBe('Saved as coronaviruses.json');
  act(() => { vi.advanceTimersByTime(3000); });
  expect(status.textContent).toBe('');
});

it('shows no confirmation when the save is cancelled', () => {
  render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={saveNothing} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={3} />);
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
  expect(screen.getByRole('status').textContent).toBe('');
});

it.each([{ ctrlKey: true }, { metaKey: true }])('saves and opens from the keyboard with %o', modifier => {
  const save = vi.fn(() => null);
  const { rerender } = render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={save} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={1} />);
  const click = vi.spyOn(screen.getByLabelText('Open project file') as HTMLInputElement, 'click');
  const saveEvent = new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true, ...modifier });
  document.dispatchEvent(saveEvent);
  expect(save).toHaveBeenCalledOnce();
  expect(saveEvent.defaultPrevented).toBe(true);
  fireEvent.keyDown(document, { key: 'o', ...modifier });
  expect(click).toHaveBeenCalledOnce();
  rerender(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={save} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={1} locked />);
  fireEvent.keyDown(document, { key: 'o', ...modifier });
  expect(click).toHaveBeenCalledOnce();
  fireEvent.keyDown(document, { key: 's', shiftKey: true, ...modifier });
  fireEvent.keyDown(document, { key: 's' });
  expect(save).toHaveBeenCalledOnce();
});

it('labels the modifier for the platform', () => {
  expect(modifierLabel('MacIntel')).toBe('⌘');
  expect(modifierLabel('Win32')).toBe('Ctrl');
  expect(modifierLabel('Linux x86_64')).toBe('Ctrl');
});

it('names the cog and caps the scrolling panel below the bar', () => {
  render(<OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={saveNothing} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={0} locked={false} />);
  expect(screen.getByRole('button', { name: 'Project and options' }).getAttribute('data-tip')).toBe('Project and options');
  openMenu();
  expect(screen.getByRole('group', { name: 'Project' })).toBeTruthy();
  expect(screen.getByText('Nothing to clear')).toBeTruthy();
  expect(screen.getByRole('separator')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clear workspace…' }).textContent).toContain('Clear workspace');
  expect(screen.getByRole('dialog').style.maxHeight).toContain('100vh');
  expect(screen.getByRole('dialog').querySelector('.overflow-y-auto')).toBeTruthy();
});
it('keeps shortcuts global with a text field focused outside the closed panel', () => {
  const save = vi.fn(() => 'focused.json');
  render(<><input aria-label="Elsewhere" /><OptionsPanel featureColors={{}} onSetFeatureColors={noop} themeKey="clean" onSetThemeKey={noop} onSaveProject={save} onOpenProject={noop} onClearWorkspace={noop} sequenceCount={2} locked={false} /></>);
  const click = vi.spyOn(screen.getByLabelText('Open project file'), 'click');
  screen.getByLabelText('Elsewhere').focus();
  fireEvent.keyDown(document.activeElement!, { key: 's', ctrlKey: true });
  fireEvent.keyDown(document.activeElement!, { key: 'o', metaKey: true });
  expect(save).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  expect(screen.getByRole('status').textContent).toBe('Saved as focused.json');
});
