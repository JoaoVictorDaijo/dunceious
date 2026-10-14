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

export type Shell = 'desktop' | 'greeter';

/** sessionStorage key for "Open the workbench anyway". */
export const SHELL_OVERRIDE_KEY = 'dunceious.shell';

/** A phone's shorter screen side stays under this; small tablets start around 600. */
export const PHONE_MAX_SHORT_SIDE = 600;

export interface ShellEnv {
  coarsePointer: boolean;
  screenWidth: number;
  screenHeight: number;
  /** `location.search`; `?shell=greeter|desktop` forces a shell for this load only. */
  search: string;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function parseShell(value: string | null | undefined): Shell | null {
  return value === 'desktop' || value === 'greeter' ? value : null;
}

/**
 * Phones get the greeter, everything else the workbench. The device screen is
 * used rather than the viewport so rotating a phone or resizing a desktop
 * window never swaps the app out from under the user.
 */
export function pickShell(env: ShellEnv): Shell {
  const forced = parseShell(new URLSearchParams(env.search).get('shell'));
  if (forced) return forced;
  let remembered: Shell | null = null;
  try {
    remembered = parseShell(env.storage?.getItem(SHELL_OVERRIDE_KEY));
  } catch {
    // Storage can throw when site data is blocked; fall through to detection.
  }
  if (remembered) return remembered;
  const isPhone = env.coarsePointer && Math.min(env.screenWidth, env.screenHeight) < PHONE_MAX_SHORT_SIDE;
  return isPhone ? 'greeter' : 'desktop';
}

/** Session-scoped so a phone visitor who forced the workbench sees the greeter again next visit. */
export function rememberShell(shell: Shell, storage: ShellEnv['storage']): void {
  try {
    storage?.setItem(SHELL_OVERRIDE_KEY, shell);
  } catch {
    // Not remembering only means the greeter returns on reload.
  }
}

function sessionStorageOrNull(win: Window): Storage | null {
  try {
    return win.sessionStorage;
  } catch {
    return null;
  }
}

export function readShellEnv(win: Window = window): ShellEnv {
  return {
    coarsePointer: win.matchMedia?.('(pointer: coarse)').matches ?? false,
    screenWidth: win.screen.width,
    screenHeight: win.screen.height,
    search: win.location.search,
    storage: sessionStorageOrNull(win),
  };
}
