import { useEffect, useRef, useState } from 'react';
import type { RowListing } from '../components/surface';
import { readListingIdFromHash, writeListingIdToHash } from '../utils/listingLink';

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
    const qs = campaignId ? `?campaign_id=${campaignId}` : '';
    fetch(`/api/listings/${encodeURIComponent(linkedId)}${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setSelectedListing(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkedId, listings, campaignId, selectedListing?.id]);

  const openListing = (l: RowListing | null) => {
    setSelectedListing(l);
    writeListingIdToHash(l ? l.id : null);
  };

  return { selectedListing, openListing };
}
