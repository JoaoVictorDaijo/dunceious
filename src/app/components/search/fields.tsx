/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import React from 'react';

/** A dotted underline marks a term whose definition opens in the app tooltip. */
export function Term({ tip, children, className = '' }: { tip: string; children: React.ReactNode; className?: string }) {
  return <span data-tip={tip}
    className={`cursor-help underline decoration-slate-500 decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-slate-300 ${className}`}>
    {children}
  </span>;
}

/** The control surface every search field shares, so heights and borders line up. */
export const CONTROL = 'h-8 rounded-lg border border-slate-800 bg-slate-950 transition-colors hover:border-slate-700 focus-within:border-env';

interface NumberFieldProps {
  id?: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max?: number;
  step: number;
  /** Empty means "no value" (a filter that is off); stepping below `min` returns to empty. */
  nullable?: boolean;
  placeholder?: string;
  suffix?: string;
  tip?: string;
  className?: string;
}

/** Buttons move on round multiples of `step` (100 → 110, not 101); arrow keys keep exact ±1 edits. */
function stepped(value: number | null, direction: 1 | -1, { min, max, step, nullable }: Pick<NumberFieldProps, 'min' | 'max' | 'step' | 'nullable'>): number | null {
  if (value === null) return direction === 1 ? min : null;
  if (direction === -1 && value <= min) return nullable ? null : min;
  const k = value / step;
  const next = step * (direction === 1 ? Math.floor(k) + 1 : Math.ceil(k) - 1);
  return Math.max(min, max === undefined ? next : Math.min(max, next));
}

/** A number input whose stepper is part of the field instead of the browser's spin buttons. */
export function NumberField({ id, label, value, onChange, min, max, step, nullable, placeholder, suffix, tip, className = '' }: NumberFieldProps) {
  const bounds = { min, max, step, nullable };
  const canUp = value === null || max === undefined || value < max;
  const canDown = value !== null && (nullable || value > min);
  const stepButton = (direction: 1 | -1) => <button type="button" tabIndex={-1}
    aria-label={`${direction === 1 ? 'Increase' : 'Decrease'} ${label}`}
    disabled={direction === 1 ? !canUp : !canDown}
    onClick={() => onChange(stepped(value, direction, bounds))}
    className="flex flex-1 items-center justify-center text-slate-500 hover:bg-slate-800 hover:text-env active:bg-slate-700 disabled:pointer-events-none disabled:opacity-30">
    <i aria-hidden="true" className={`fas fa-chevron-${direction === 1 ? 'up' : 'down'} text-[7px]`} />
  </button>;
  return <div className={`flex items-stretch overflow-hidden ${CONTROL} ${className}`}>
    <input id={id} aria-label={label} data-tip={tip} type="number" inputMode="numeric" min={min} max={max} step={1}
      placeholder={placeholder} value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="w-full min-w-0 bg-transparent pl-2.5 text-[12px] font-semibold tabular-nums text-slate-100 outline-hidden placeholder:font-medium placeholder:text-slate-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
    {suffix && <span aria-hidden="true" className="self-center pr-2 text-[11px] font-semibold text-slate-500">{suffix}</span>}
    <div className="flex w-5 shrink-0 flex-col border-l border-slate-800">
      {stepButton(1)}
      <div className="h-px bg-slate-800" />
      {stepButton(-1)}
    </div>
  </div>;
}
