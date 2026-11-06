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

import type { FindingSink } from './findings';

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
  finding?: FindingSink,
): { qualifiers: Record<string, string>; lastIdx: number; translationExceptions?: string[] } {
  const qualifiers: Record<string, string> = Object.create(null);
  const translationExceptions: string[] = [];
  let i = fromIdx;
  while (i < lines.length && lines[i].startsWith(INDENT21)) {
    const match = lines[i].trim().match(/^\/(\w+)(?:=(.*))?$/);
    if (!match) {
      finding?.('refuse', 'malformed-qualifier', 'Qualifier cannot be read; the rest of this feature was not checked.', i + 1);
      while (i < lines.length && lines[i].startsWith(INDENT21)) i++;
      break;
    }

    const qualifierLine = i + 1;
    const [, key, rawValue = ''] = match;
    let value = rawValue;
    const quoted = value.startsWith('"');
    let interrupted = false;
    while (i + 1 < lines.length && lines[i + 1].startsWith(INDENT21)) {
      const next = lines[i + 1].trim();
      const openQuote = quoted && !quotedValueIsClosed(value);
      if (openQuote && /^\/\w+="(?!")/.test(next)) {
        interrupted = true;
        while (i + 1 < lines.length && lines[i + 1].startsWith(INDENT21)) i++;
        break;
      }
      if (!openQuote && next.startsWith('/')) break;
      value += (key === 'translation' ? '' : ' ') + next;
      i++;
    }
    if (interrupted || (quoted && !quotedValueIsClosed(value))) {
      finding?.('refuse', 'malformed-qualifier', `/${key} has no closing quote; the rest of this feature was not checked.`, qualifierLine);
      break;
    }
    if (key !== 'transl_except' && Object.hasOwn(qualifiers, key)) finding?.('warning', 'repeated-qualifier', `/${key} is repeated; the last value is kept.`, i + 1);
    if (quoted) {
      value = value.slice(1);
      if (value.endsWith('"')) value = value.slice(0, -1);
      value = value.replace(/""/g, '"');
    }
    if (key === 'transl_except') translationExceptions.push(value);
    else qualifiers[key] = value;
    i++;
  }
  return { qualifiers, lastIdx: i - 1, ...(translationExceptions.length ? { translationExceptions } : {}) };
}
