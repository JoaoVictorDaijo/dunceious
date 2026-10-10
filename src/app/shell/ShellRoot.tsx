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

import React, { Suspense } from 'react';

// Each UI is its own lazy chunk, so a visitor downloads only the shell it uses.
const DesktopApp = React.lazy(() => import('../desktop/DesktopApp'));

function ShellFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-700">
      <i className="fas fa-dna text-6xl animate-pulse" aria-hidden="true"></i>
      <span className="sr-only">Loading Dunceious…</span>
    </div>
  );
}

export default function ShellRoot() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <DesktopApp />
    </Suspense>
  );
}
