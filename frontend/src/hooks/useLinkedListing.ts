import { useCallback, useEffect, useRef, useState } from 'react';
import type { RowListing } from '../components/surface';
import { readListingIdFromHash, writeListingIdToHash } from '../utils/listingLink';
import { toRowListing, type ApiListing } from '../utils/toRowListing';

/** The open find, kept in the address.
 *
 * Every find has an address: its Kleinanzeigen id in the URL. Opening one
 * writes it there, so the address bar is a link to share; opening such a link
 * finds the listing in the list, or asks the server for it when it is on
 * another page or filtered out. Back closes it.
 */
export function useLinkedListing(listings: RowListing[], campaignId: number | null) {
  const [selectedListing, setSelectedListing] = useState<RowListing | null>(null);
  const linkedId = readListingIdFromHash();

  // Close only when an id leaves the address (back button), never merely
  // because none is there: a click opens the sheet before the address changes.
  const previousId = useRef<string | null>(linkedId);
  useEffect(() => {
    const hadId = previousId.current;
    previousId.current = linkedId;
    if (!linkedId) {
      if (hadId) setSelectedListing(null);
      return;
    }
    if (selectedListing?.id === linkedId) return;
    const found = listings.find((l) => l.id === linkedId);
    if (found) {
      setSelectedListing(found);
      return;
    }
    let cancelled = false;
    fetchListing(linkedId, campaignId).then((full) => {
      if (!cancelled && full) setSelectedListing(full);
    });
    return () => {
      cancelled = true;
    };
  }, [linkedId, listings, campaignId, selectedListing?.id]);

  const openListing = useCallback((l: RowListing | null) => {
    setSelectedListing(l);
    writeListingIdToHash(l ? l.id : null);
  }, []);

  /** A find known only by a map pin: shown at once, completed from the server. */
  const openPartial = useCallback(
    (preview: RowListing) => {
      openListing(preview);
      fetchListing(preview.id, campaignId).then((full) => {
        if (full) setSelectedListing((open) => (open?.id === full.id ? full : open));
      });
    },
    [openListing, campaignId]
  );

  return { selectedListing, openListing, openPartial };
}

/** The listing as the sheet needs it; the raw row lacks the mapped fields. */
function fetchListing(id: string, campaignId: number | null): Promise<RowListing | null> {
  const qs = campaignId ? `?campaign_id=${campaignId}` : '';
  return fetch(`/api/listings/${encodeURIComponent(id)}${qs}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: ApiListing | null) => (data ? toRowListing(data) : null))
    .catch(() => null);
}
