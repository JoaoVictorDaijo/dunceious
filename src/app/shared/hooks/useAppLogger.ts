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

import { useState } from 'react';

/**
 * Manages the in-app activity log shown in the sidebar.
 *
 * Keeps a capped list of timestamped entries (max 50) and exposes
 * a stable `addLog` callback for any part of the app to append a message.
 */
export function useAppLogger(): {
  logs: string[];
  addLog: (msg: string) => void;
} {
  const [logs, setLogs] = useState<string[]>([
    `Dunceious Pro v${__APP_VERSION__} [Unified Workspace] initialized. Ready for research.`,
  ]);

  const addLog = (msg: string) =>
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

  return { logs, addLog };
}
