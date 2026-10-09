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

import React from 'react';

interface SectionTitleProps {
  /** FontAwesome icon class, e.g. `fa-compass`. */
  icon: string;
  children: React.ReactNode;
  /** Controls rendered on the right of the heading row. */
  trailing?: React.ReactNode;
}

/** The one heading style for sidebar sections; only the icon takes the environment accent. */
const SectionTitle: React.FC<SectionTitleProps> = ({ icon, children, trailing }) => (
  <div className="flex items-center justify-between gap-3 mb-3">
    <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      <i
        className={`fas ${icon} text-[10px] w-3 text-center transition-colors duration-700 motion-reduce:transition-none`}
        style={{ color: 'var(--env)' }}
        aria-hidden="true"
      ></i>
      {children}
    </h3>
    {trailing}
  </div>
);

export default SectionTitle;
