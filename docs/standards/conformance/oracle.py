#
# Dunceious
#
# This file is part of Dunceious.
#
# Dunceious is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Dunceious is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
#

# Textbook expectations from INSDC FT v11.4 §3.4.2: join concatenates in written order,
# complement reverse-complements its operand. Independent of any tool under test.
s = open('fixture.seq').read()
C = str.maketrans('ACGT', 'TGCA')
rc = lambda x: x.translate(C)[::-1]
r = lambda a, b: s[a - 1:b]
exp = {
 'J1': r(1, 10) + r(21, 30),
 'J2': rc(r(1, 10) + r(21, 30)),
 'J3': rc(r(21, 30)) + r(1, 10),
 'J4': rc(rc(r(1, 2)) + r(5, 6)),
 'J5': rc(rc(r(1, 2)) + rc(r(5, 6))),
 'W2': rc(rc(r(115, 120)) + r(1, 5)),
 'O1': 'NOT JOINED: intervals 1..3 and 11..13 only',
 'P1': r(5, 25) + '  (partial both ends)',
 'W1': r(115, 120) + r(1, 5),
 'S1': 'zero-length site between 10 and 11',
 'C1': 'MKF (table 11, GTG start read as M)',
 'C2': 'MAC (frame from base 52: ATG GCC TGT TAA; 5-prime partial)',
 'C3': 'MUP (TGA at 74..76 as Sec)',
}
for k, v in exp.items(): print(f'{k}\t{v}')
