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

import { Children, cloneElement, createContext, forwardRef, useContext, type CSSProperties, type ReactElement, type ReactNode } from 'react';

export type CardLayout = { key: string; start: number; size: number; first: number; last: number; folded: boolean };
export const CardContext = createContext<{ cards: CardLayout[]; current: string | null }>({ cards: [], current: null });

const GroupedInner = forwardRef<HTMLDivElement, { style?: CSSProperties; children?: ReactNode }>(function GroupedInner({ style, children }, ref) {
  const { cards, current } = useContext(CardContext);
  const groups = new Map<CardLayout, ReactNode[]>();
  const outside: ReactNode[] = [];
  Children.forEach(children, child => {
    const row = child as ReactElement<{ index: number; style: CSSProperties }>;
    const card = cards.find(card => row.props.index >= card.first && row.props.index <= card.last);
    if (!card) { outside.push(child); return; }
    const content = groups.get(card) ?? [];
    content.push(cloneElement(row, { style: { ...row.props.style, top: Number(row.props.style.top) - card.start - 12 } }));
    groups.set(card, content);
  });
  return <div ref={ref} style={style}>{outside}{[...groups].map(([card, content]) => <section key={card.key} data-hub-card={card.key} data-folded={card.folded} className={`hub-group-card ${card.key === current ? 'hub-group-current' : ''}`} style={{ top: card.start + 12, height: card.size - 12 }}>{content}</section>)}</div>;
});
export default GroupedInner;
