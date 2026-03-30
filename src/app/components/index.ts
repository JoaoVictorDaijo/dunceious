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
