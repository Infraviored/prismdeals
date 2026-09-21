import { useState, useEffect, useCallback } from 'react';

/** The buyer's own shortlist, shared by every screen that shows a find.
 *
 * Held once at the top rather than fetched per row: a list of fifty rows would
 * otherwise ask the server fifty times whether each one is kept.
 */
export function useKept() {
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/kept', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { kept: [] }))
      .then(d => setKept(new Set((d.kept || []).map((k: { listing_id: string }) => k.listing_id))))
      .catch(() => setKept(new Set()))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (listingId: string) => {
      const wasKept = kept.has(listingId);

      // Move the mark first. A shortlist that lags a tap by a round trip feels
      // broken, and the worst case is a mark that flicks back.
      setKept(prev => {
        const next = new Set(prev);
        if (wasKept) next.delete(listingId);
        else next.add(listingId);
        return next;
      });

      try {
        const res = await fetch(`/api/kept/${encodeURIComponent(listingId)}`, {
          method: wasKept ? 'DELETE' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: wasKept ? undefined : '{}',
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setKept(prev => {
          const next = new Set(prev);
          if (wasKept) next.add(listingId);
          else next.delete(listingId);
          return next;
        });
      }
    },
    [kept]
  );

  return { kept, loaded, toggle, refresh };
}
