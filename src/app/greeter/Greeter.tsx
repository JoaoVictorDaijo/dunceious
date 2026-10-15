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

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import GreeterHome from './GreeterHome';
import GreeterTour from './GreeterTour';

const Showroom = lazy(() => import('../showroom/Showroom'));

export default function Greeter() {
  const [view, setView] = useState<'home' | 'tour' | 'showroom'>('home');
  const [returning, setReturning] = useState<'tour' | 'showroom' | null>(null);
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const showroomButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (view !== 'home' || !returning) return;
    (returning === 'tour' ? tourButtonRef : showroomButtonRef).current?.focus();
    setReturning(null);
  }, [view, returning]);

  const open = (next: 'tour' | 'showroom') => {
    window.scrollTo(0, 0);
    setView(next);
  };
  const close = (from: 'tour' | 'showroom') => {
    setReturning(from);
    setView('home');
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950">
      {view === 'showroom' ? (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950" role="status">
          <i className="fa-solid fa-dna animate-pulse text-3xl text-sky-400" aria-hidden="true" />
          <span className="sr-only">Loading Dunceious…</span>
        </div>}>
          <Showroom onExit={() => close('showroom')} />
        </Suspense>
      ) : view === 'tour' ? <GreeterTour onClose={() => close('tour')} /> : (
        <GreeterHome tourButtonRef={tourButtonRef} showroomButtonRef={showroomButtonRef}
          onTour={() => open('tour')} onShowroom={() => open('showroom')} />
      )}
    </div>
  );
}
