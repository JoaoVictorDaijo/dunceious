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

import { Suspense, lazy, useState } from 'react';
import { pickShell, readShellEnv, rememberShell, type Shell, type ShellEnv } from './pickShell';

// Each UI is its own chunk, so a phone never downloads the workbench and a
// desktop never downloads the greeter.
const App = lazy(() => import('../App'));
const Greeter = lazy(() => import('../greeter/Greeter'));

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950" role="status">
      <i className="fa-solid fa-dna animate-pulse text-3xl text-sky-400" aria-hidden="true" />
      <span className="sr-only">Loading Dunceious…</span>
    </div>
  );
}

export default function ShellRoot({ env }: { env?: ShellEnv }) {
  const [shellEnv] = useState(() => env ?? readShellEnv());
  const [shell, setShell] = useState<Shell>(() => pickShell(shellEnv));

  const openWorkbench = () => {
    rememberShell('desktop', shellEnv.storage);
    window.scrollTo(0, 0);
    setShell('desktop');
  };

  return (
    <Suspense fallback={<Loading />}>
      {shell === 'greeter' ? <Greeter onOpenWorkbench={openWorkbench} /> : <App />}
    </Suspense>
  );
}
