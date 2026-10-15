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
import { TOUR_STEPS } from './greeterContent';
import { TOUR_SCENES } from './TourScenes';

export default function GreeterTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const last = TOUR_STEPS.length - 1;
  const Scene = TOUR_SCENES[step];

  // Move focus with the content so a screen reader announces each step.
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col bg-slate-950 text-slate-200">
      <div className="grid grid-cols-4 gap-1.5 px-4 pt-4" aria-hidden="true">
        {TOUR_STEPS.map((_, i) => (
          <span key={i} className={`h-1 rounded-sm ${i <= step ? 'bg-sky-400' : 'bg-slate-800'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between pl-4 pr-2 pt-1.5">
        <span className="font-mono text-[13px] font-semibold text-slate-400">{step + 1} / {TOUR_STEPS.length}</span>
        <button type="button" onClick={onClose} aria-label="Close tour" className="flex h-11 w-11 items-center justify-center text-slate-400">
          <i className="fa-solid fa-xmark text-xl" aria-hidden="true" />
        </button>
      </div>

      <div className="mx-4 mt-2 flex min-h-[260px] items-center justify-center overflow-hidden py-6 [@media(min-height:700px)]:h-[380px] rounded-3xl border border-slate-800 bg-slate-900" aria-hidden="true">
        <Scene />
      </div>

      <div className="flex flex-col gap-2.5 px-6 pt-6">
        <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[28px] font-extrabold leading-tight tracking-tight outline-none">
          {TOUR_STEPS[step].title}
        </h1>
        <p className="m-0 text-base leading-normal text-slate-300">{TOUR_STEPS[step].body}</p>
      </div>

      <div className="mt-auto flex gap-2.5 px-4 pb-7 pt-6">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="h-[54px] w-[110px] rounded-[14px] border border-slate-700 font-semibold text-slate-200 disabled:opacity-40"
        >
          Back
        </button>
        {step < last ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="h-[54px] flex-1 rounded-[14px] bg-sky-700 font-bold text-white">
            Next
          </button>
        ) : (
          <button type="button" onClick={onClose} className="h-[54px] flex-1 rounded-[14px] bg-sky-700 font-bold text-white">
            Done
          </button>
        )}
      </div>
    </main>
  );
}
