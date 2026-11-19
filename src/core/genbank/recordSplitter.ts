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

/**
 * Splits a raw multi-record GenBank string into an array of individual
 * record strings. A new LOCUS also starts a piece so an unterminated entry
 * cannot swallow the next entry before validation reports the missing terminator.
 */
export function splitRecords(content: string): string[] {
  return content.split(/\r?\n\/\/\s*(?:\r?\n|$)|(?=^LOCUS[ \t])/m).filter(s => s.trim());
}
