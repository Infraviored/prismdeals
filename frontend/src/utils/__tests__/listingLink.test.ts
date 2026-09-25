import { describe, it, expect, beforeEach } from 'vitest';
import { readListingIdFromHash, writeListingIdToHash } from '../listingLink';

describe('listing link', () => {
  beforeEach(() => {
    window.location.hash = '#dashboard?campaignId=7';
  });

  it('puts the Kleinanzeigen id into the address and keeps the campaign', () => {
    writeListingIdToHash('3517306856');
    expect(window.location.hash).toBe('#dashboard?campaignId=7&listingId=3517306856');
    expect(readListingIdFromHash()).toBe('3517306856');
  });

  it('closing removes it again', () => {
    writeListingIdToHash('3517306856');
    writeListingIdToHash(null);
    expect(window.location.hash).toBe('#dashboard?campaignId=7');
    expect(readListingIdFromHash()).toBeNull();
  });
});
