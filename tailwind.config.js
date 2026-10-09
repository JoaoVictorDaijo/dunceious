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

import animate from 'tailwindcss-animate';
import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono Variable"', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        // The three darkest slates are the app chrome; lifted from Tailwind's stock
        // values along the same hue so the dark surfaces read less like black.
        slate: { 800: '#243146', 900: '#151e34', 950: '#091023' },
        // The environment accent set by the active theme (see src/app/logic/theme.ts).
        env: 'color-mix(in srgb, var(--env) calc(<alpha-value> * 100%), transparent)',
      },
      keyframes: {
        'spin-slow': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        // A returned-to hub row: a warm pulse that settles into its resting tint.
        'row-return': {
          '0%': { backgroundColor: 'rgb(253 230 138 / 0.9)' },
          '35%': { backgroundColor: 'rgb(254 243 199 / 0.9)' },
          '60%': { backgroundColor: 'rgb(253 230 138 / 0.7)' },
          '100%': { backgroundColor: 'rgb(255 251 235 / 0)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 12s linear infinite',
        'row-return': 'row-return 1.6s ease-out both',
      },
    },
  },
  plugins: [animate],
};
