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
 * Barrel export for all App-level UI components.
 *
 * @example
 * import { TopNav, Sidebar, StatusBar } from '@/src/app/components';
 */
export { default as DatabaseHubPanel } from './DatabaseHubPanel';
export type { FlatItem } from './DatabaseHubPanel';

export { default as FeatureEditorModal } from './FeatureEditorModal';
export type { EditingFeatureState } from './FeatureEditorModal';

export { default as ProcessingOverlay } from './ProcessingOverlay';

export { default as RecordDetailsModal } from './RecordDetailsModal';

export { default as SearchPanel } from './SearchPanel';
export type { GroupedSearchResults } from './SearchPanel';

export { default as Sidebar } from './Sidebar';
export type { SidebarProps } from './Sidebar';

export { default as StatusBar } from './StatusBar';

export { default as TopNav } from './TopNav';
export type { TopNavProps } from './TopNav';
