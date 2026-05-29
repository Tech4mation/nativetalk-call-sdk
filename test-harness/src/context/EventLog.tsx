import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export type EventCategory =
  | 'registration'
  | 'incoming'
  | 'outgoing'
  | 'callState'
  | 'callEnded'
  | 'error'
  | 'native'
  | 'engine'
  | 'app';

export interface LogEntry {
  id: number;
  ts: number;
  category: EventCategory;
  message: string;
  data?: unknown;
}

interface EventLogApi {
  entries: LogEntry[];
  push: (category: EventCategory, message: string, data?: unknown) => void;
  clear: () => void;
}

const EventLogContext = createContext<EventLogApi | null>(null);

const MAX_ENTRIES = 500;

export function EventLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const idRef = useRef(0);

  const push = useCallback(
    (category: EventCategory, message: string, data?: unknown) => {
      const id = ++idRef.current;
      const entry: LogEntry = { id, ts: Date.now(), category, message, data };
      setEntries((prev) => {
        const next = [entry, ...prev];
        return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
      });
    },
    []
  );

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo(() => ({ entries, push, clear }), [entries, push, clear]);

  return (
    <EventLogContext.Provider value={value}>{children}</EventLogContext.Provider>
  );
}

export function useEventLog(): EventLogApi {
  const ctx = useContext(EventLogContext);
  if (!ctx) {
    throw new Error('useEventLog() must be used inside <EventLogProvider>.');
  }
  return ctx;
}
