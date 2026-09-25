/** The find on screen, as part of the address.
 *
 * `#dashboard?campaignId=7&listingId=3517306856`: the listing id is the
 * Kleinanzeigen ad id, unique across the site, so the address alone identifies
 * the find and can be sent to someone else.
 */
export function readListingIdFromHash(hash: string = window.location.hash): string | null {
  const query = hash.split('?')[1];
  if (!query) return null;
  return new URLSearchParams(query).get('listingId');
}

/** Sets or clears the listing in the address. A new history entry, so the
 * back button closes the sheet instead of leaving the campaign. */
export function writeListingIdToHash(id: string | null): void {
  const [path, query = ''] = window.location.hash.split('?');
  const params = new URLSearchParams(query);
  if (id) params.set('listingId', id);
  else params.delete('listingId');
  const next = params.toString();
  const hash = `${path || '#dashboard'}${next ? `?${next}` : ''}`;
  if (window.location.hash !== hash) window.location.hash = hash;
}
