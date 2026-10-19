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

import { expect, it } from 'vitest';
import { LocalScoreBound } from '../bound';

it('replaces each placeholder once and lets a later hit displace an unaligned stream score', () => {
  const bound = new LocalScoreBound(3, [['a', 100], ['b', 80], ['c', 60], ['zero', 0]]);
  expect(bound.score2).toBe(60);
  expect(bound.acceptHit('a', 100)).toBe(60);
  expect(bound.acceptHit('a', 90)).toBe(80);
  expect(bound.acceptHit('a', 80)).toBe(80);
  expect(bound.finishStream('c')).toBe(80);
  expect(bound.acceptHit('b', 80)).toBe(80);
  expect(bound.acceptHit('a', 95)).toBe(90);
});
it('forms a bound with fewer positive streams once actual hits fill the multiset', () => {
  const bound = new LocalScoreBound(3, [['a', 100], ['b', 80], ['zero', 0]]);
  expect(bound.score2).toBeNull();
  expect(bound.acceptHit('a', 100)).toBeNull();
  expect(bound.acceptHit('a', 90)).toBe(80);
  expect(bound.finishStream('b')).toBe(80);
  expect(bound.acceptHit('a', 70)).toBe(80);
});
it('counts equal scores from separate streams and never double counts their first hits', () => {
  const bound = new LocalScoreBound(3, [['a', 100], ['b', 80], ['c', 80], ['d', 60]]);
  expect(bound.score2).toBe(80);
  expect(bound.acceptHit('a', 100)).toBe(80);
  expect(bound.acceptHit('b', 80)).toBe(80);
  expect(bound.acceptHit('a', 90)).toBe(80);
  expect(bound.acceptHit('c', 80)).toBe(80);
  expect(bound.acceptHit('a', 95)).toBe(90);
});
it('rejects a mismatching first hit without removing its placeholder', () => {
  const bound = new LocalScoreBound(2, [['a', 100], ['b', 80]]);
  expect(() => bound.acceptHit('a', 99)).toThrow('Local alignment first hit differs from scoring pass');
  expect(bound.score2).toBe(80);
  expect(bound.acceptHit('a', 100)).toBe(80);
  expect(bound.acceptHit('a', 110)).toBe(100);
});
it('uses actual hits alone when no placeholders are supplied', () => {
  const bound = new LocalScoreBound(2);
  expect(bound.score2).toBeNull();
  expect(bound.acceptHit('a', 100)).toBeNull();
  expect(bound.acceptHit('b', 80)).toBe(80);
  expect(bound.acceptHit('a', 90)).toBe(90);
  expect(bound.finishStream('b')).toBe(90);
});
it('drops finished placeholders while preserving the previous bound', () => {
  const bound = new LocalScoreBound(2, [['a', 100], ['b', 80], ['c', 70]]);
  expect(bound.score2).toBe(80);
  expect(bound.finishStream('a')).toBe(80);
  expect(bound.acceptHit('b', 80)).toBe(80);
  expect(bound.acceptHit('b', 90)).toBe(80);
  expect(bound.acceptHit('b', 85)).toBe(85);
});
