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

/** Guaranteed first scores and received hits provide a lower bound on the final N-th score. */
export class LocalScoreBound {
  private readonly placeholders: Map<string, number>;
  private readonly actual: number[] = [];
  private current: number | null = null;

  constructor(private readonly limit: number, firstScores: Iterable<readonly [string, number]> = []) {
    this.placeholders = new Map(Array.from(firstScores).filter(([, score2]) => score2 > 0));
    this.update();
  }

  get score2(): number | null { return this.current; }

  acceptHit(stream: string, score2: number): number | null {
    const expected = this.placeholders.get(stream);
    if (expected !== undefined && score2 !== expected) {
      throw new Error('Local alignment first hit differs from scoring pass');
    }
    this.placeholders.delete(stream);
    this.actual.push(score2);
    this.actual.sort((a, b) => b - a);
    this.actual.length = Math.min(this.actual.length, this.limit);
    return this.update();
  }

  finishStream(stream: string): number | null {
    this.placeholders.delete(stream);
    return this.update();
  }

  private update(): number | null {
    const scores = [...this.actual, ...this.placeholders.values()].sort((a, b) => b - a);
    if (scores.length >= this.limit) {
      this.current = Math.max(this.current ?? 0, scores[this.limit - 1]);
    }
    return this.current;
  }
}
