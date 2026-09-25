import { useState, useCallback, useEffect, useRef } from 'react';
import type { HuntSummary } from '../types/hunt';
import { api } from '../utils/api';

interface UseAppDataProps {
  appUser: { email: string; role: string } | null;
}

/** Every hunt with its counts and newest fitting offer: the start screen. */
export function useAppData({ appUser }: UseAppDataProps) {
  const [hunts, setHunts] = useState<HuntSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    api<HuntSummary[]>('/api/hunts')
      .then((data) => {
        setHunts(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const refreshRef = useRef(refreshAll);
  useEffect(() => {
    refreshRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    if (appUser) refreshRef.current();
  }, [appUser]);

  return { hunts, error, refreshAll };
}
