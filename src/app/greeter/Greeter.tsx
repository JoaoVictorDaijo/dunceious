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

import { useEffect, useRef, useState } from 'react';
import GreeterHome from './GreeterHome';
import GreeterTour from './GreeterTour';

/**
 * The phone landing page: what Dunceious is, a short tour, and where to find
 * it on a computer. It shares nothing with the workbench UI.
 */
export default function Greeter({ onOpenWorkbench }: { onOpenWorkbench: () => void }) {
  const [view, setView] = useState<'home' | 'tour'>('home');
  const [returning, setReturning] = useState(false);
  const tourButtonRef = useRef<HTMLButtonElement>(null);

  // Back from the tour, focus returns to the button that opened it.
  useEffect(() => {
    if (view !== 'home' || !returning) return;
    tourButtonRef.current?.focus();
    setReturning(false);
  }, [view, returning]);

  const openTour = () => {
    window.scrollTo(0, 0);
    setView('tour');
  };
  const closeTour = () => {
    setReturning(true);
    setView('home');
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950">
      {view === 'tour'
        ? <GreeterTour onClose={closeTour} />
        : <GreeterHome tourButtonRef={tourButtonRef} onTour={openTour} onOpenWorkbench={onOpenWorkbench} />}
    </div>
  );
}
