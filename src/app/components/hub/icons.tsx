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

export function ExpandAllIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="mx-auto">
    <rect x="5.5" y="1.5" width="9" height="9" rx="1" />
    <rect x="1.5" y="5.5" width="9" height="9" rx="1" className="fill-white" />
    <path d="M3.5 10h5" /><path data-plus d="M6 7.5v5" />
  </svg>;
}

export function CollapseAllIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="mx-auto">
    <rect x="5.5" y="1.5" width="9" height="9" rx="1" />
    <rect x="1.5" y="5.5" width="9" height="9" rx="1" className="fill-white" />
    <path d="M3.5 10h5" />
  </svg>;
}
