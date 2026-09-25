import { useCallback, useEffect, useState } from 'react';
import type { HuntDocument } from '../types/hunt';
import { api } from '../utils/api';

/** One stored hunt: read once per id, changed locally, saved with PUT. */
export function useHuntDocument(huntId: number | null) {
  const [doc, setDoc] = useState<HuntDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!huntId) return Promise.resolve(null);
    return api<HuntDocument>(`/api/hunts/${huntId}`)
      .then((d) => {
        setDoc(d);
        setError(null);
        return d;
      })
      .catch((e: Error) => {
        setError(e.message);
        return null;
      });
  }, [huntId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoc(null);
    load();
  }, [load]);

  /** Stores `next` (or the current document); returns the stored one. */
  const save = useCallback(
    async (next?: HuntDocument): Promise<HuntDocument | null> => {
      const body = next || doc;
      if (!huntId || !body) return null;
      setSaving(true);
      setSaveError(null);
      try {
        const stored = await api<HuntDocument>(`/api/hunts/${huntId}`, { method: 'PUT', body });
        setDoc(stored);
        return stored;
      } catch (e) {
        setSaveError((e as Error).message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [huntId, doc]
  );

  return { doc, setDoc, error, reload: load, save, saving, saveError };
}
