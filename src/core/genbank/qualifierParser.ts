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

const INDENT21 = ' '.repeat(21);

function quotedValueIsClosed(value: string): boolean {
  for (let i = 1; i < value.length; i++) {
    if (value[i] !== '"') continue;
    if (value[i + 1] === '"') i++;
    else return true;
  }
  return false;
}

/** Text continuations need a word boundary; translation continuations contain only residues. */
export function parseQualifiers(
  lines: string[],
  fromIdx: number,
): { qualifiers: Record<string, string>; lastIdx: number } {
  const qualifiers: Record<string, string> = {};
  let i = fromIdx;
  while (i < lines.length && lines[i].startsWith(INDENT21)) {
    const match = lines[i].trim().match(/^\/(\w+)(?:=(.*))?$/);
    if (!match) {
      i++;
      continue;
    }

    const [, key, rawValue = ''] = match;
    let value = rawValue;
    const quoted = value.startsWith('"');
    while (i + 1 < lines.length && lines[i + 1].startsWith(INDENT21)) {
      const next = lines[i + 1].trim();
      const openQuote = quoted && !quotedValueIsClosed(value);
      if (!openQuote && next.startsWith('/')) break;
      value += (key === 'translation' ? '' : ' ') + next;
      i++;
    }
    if (quoted) {
      value = value.slice(1);
      if (value.endsWith('"')) value = value.slice(0, -1);
      value = value.replace(/""/g, '"');
    }
    qualifiers[key] = value;
    i++;
  }
  return { qualifiers, lastIdx: i - 1 };
}
