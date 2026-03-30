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
    'Dunceious Pro v3.3 [Unified Workspace] initialized. Ready for research.',
  ]);

  const addLog = (msg: string) =>
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

  return { logs, addLog };
}
