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


export interface IntervalNode<T extends { start: number; end: number }> {
  span: T;
  maxEnd: number;
  left: IntervalNode<T> | null;
  right: IntervalNode<T> | null;
}

/** Input is sorted by start; max-end pruning retains nested and split intervals exactly. */
export function indexCodonPieces<T extends { start: number; end: number }>(spans: T[], from = 0, to = spans.length): IntervalNode<T> | null {
  if (from >= to) return null;
  const middle = Math.floor((from + to) / 2);
  const span = spans[middle];
  const left = indexCodonPieces(spans, from, middle);
  const right = indexCodonPieces(spans, middle + 1, to);
  return { span, left, right, maxEnd: Math.max(span.end, left?.maxEnd ?? 0, right?.maxEnd ?? 0) };
}

export function visibleCodonPieces<T extends { start: number; end: number }>(node: IntervalNode<T> | null, start: number, end: number, result: T[] = []): T[] {
  if (!node || node.maxEnd <= start || end <= start) return result;
  visibleCodonPieces(node.left, start, end, result);
  if (node.span.start >= end) return result;
  if (node.span.end > start) result.push(node.span);
  return visibleCodonPieces(node.right, start, end, result);
}
