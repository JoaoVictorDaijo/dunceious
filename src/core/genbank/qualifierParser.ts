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

/**
 * Parses a block of GenBank qualifier lines for a single feature.
 *
 * Qualifiers start at column 21 with "/key" or "/key=value".  Values that
 * span multiple lines are joined without extra whitespace.
 *
 * Returns a plain Record<string, string> where flag qualifiers (no "=") are
 * stored as an empty string.
 */

const INDENT21 = ' '.repeat(21);

/**
 * @param lines   Full record line array.
 * @param fromIdx Index of the first line *after* the feature location line.
 * @returns       Parsed qualifiers and the last line index consumed.
 */
export function parseQualifiers(
  lines: string[],
  fromIdx: number,
): { qualifiers: Record<string, string>; lastIdx: number } {
  const qualifiers: Record<string, string> = {};
  let i = fromIdx;

  while (i < lines.length && lines[i].startsWith(INDENT21)) {
    const qualLine = lines[i].trim();

    // A new qualifier must start with '/'
    if (!qualLine.startsWith('/')) {
      i++;
      continue;
    }

    const qualMatch = qualLine.match(/^\/(\w+)(?:=(.*))?$/);
    if (!qualMatch) {
      i++;
      continue;
    }

    const [, key, rawValue] = qualMatch;
    // Strip surrounding double-quotes if present
    let value = rawValue ? rawValue.replace(/^"|"$/g, '') : '';

    // Accumulate continuation lines (indented 21, not starting with '/')
    while (
      i + 1 < lines.length &&
      lines[i + 1].startsWith(INDENT21) &&
      !lines[i + 1].trim().startsWith('/')
    ) {
      value += lines[++i].trim().replace(/"/g, '');
    }

    qualifiers[key] = value;
    i++;
  }

  return { qualifiers, lastIdx: i - 1 };
}
