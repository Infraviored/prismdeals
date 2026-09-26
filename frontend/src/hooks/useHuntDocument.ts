import { useCallback, useEffect, useRef, useState } from 'react';
import type { HuntDocument, SavedHunt } from '../types/hunt';
import { api } from '../utils/api';

/** One stored hunt: read once per id, changed locally, saved with PUT. */
export function useHuntDocument(huntId: number | null) {
  const [doc, setDoc] = useState<HuntDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A second save while one is on its way would send the hunt twice.
  const inFlight = useRef(false);

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
    setSaveError(null);
    load();
  }, [load]);

  /** Stores `next` (or the current document); returns the stored one and
   * whether its crawl changed. Null when it failed or a save already runs. */
  const save = useCallback(
    async (next?: HuntDocument): Promise<SavedHunt | null> => {
      const body = next || doc;
      if (!huntId || !body || inFlight.current) return null;
      inFlight.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        const saved = await api<SavedHunt>(`/api/hunts/${huntId}`, { method: 'PUT', body });
        const { crawl_changed, ...stored } = saved;
        setDoc(stored);
        return { ...stored, crawl_changed: Boolean(crawl_changed) };
      } catch (e) {
        setSaveError((e as Error).message);
        return null;
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [huntId, doc]
  );

  return { doc, setDoc, error, reload: load, save, saving, saveError };
}
