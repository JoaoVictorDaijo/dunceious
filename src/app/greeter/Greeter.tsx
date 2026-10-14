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
import GreeterHome, { SEND_SECTION_ID } from './GreeterHome';
import GreeterTour from './GreeterTour';
import { useSendLink } from './useSendLink';

type View = 'home' | 'tour';
/** What to do once the home page is back on screen. */
type Arrival = 'top' | 'tour-button' | 'send-section';

/**
 * The phone landing page: what Dunceious is, a short tour, and ways to get the
 * link onto a computer. It shares nothing with the workbench UI.
 */
export default function Greeter({ onOpenWorkbench }: { onOpenWorkbench: () => void }) {
  const link = useSendLink();
  const [view, setView] = useState<View>('home');
  const [arrival, setArrival] = useState<Arrival>('top');
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (view !== 'home' || arrival === 'top') return;
    if (arrival === 'tour-button') {
      tourButtonRef.current?.focus();
    } else {
      document.getElementById(SEND_SECTION_ID)?.scrollIntoView({ block: 'start' });
      copyButtonRef.current?.focus({ preventScroll: true });
    }
    setArrival('top');
  }, [view, arrival]);

  const openTour = () => {
    window.scrollTo(0, 0);
    setView('tour');
  };

  const showSendSection = () => {
    setArrival('send-section');
    setView('home');
  };

  // navigator.share needs the tap's user activation, so it is called synchronously in the handler.
  const send = () => {
    if (!link.canShare) {
      showSendSection();
      return;
    }
    void link.share().then((ok) => { if (!ok) showSendSection(); });
    if (view === 'tour') showSendSection();
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950">
      {view === 'tour' ? (
        <GreeterTour
          onClose={() => { setArrival('tour-button'); setView('home'); }}
          onSend={send}
        />
      ) : (
        <GreeterHome
          link={link}
          tourButtonRef={tourButtonRef}
          copyButtonRef={copyButtonRef}
          onTour={openTour}
          onSend={send}
          onOpenWorkbench={onOpenWorkbench}
        />
      )}
    </div>
  );
}
