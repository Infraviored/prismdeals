import React, { useState, useEffect, useCallback } from 'react';
import { Bar, Row, EmptyLine, type RowListing } from '../components/surface';
import { FundeDetailSheet } from './FundeDetailSheet';
import { useKept } from '../hooks/useKept';
import { useTranslation } from '../hooks/useTranslation';

export interface KeptScreenProps {
  onBack: () => void;
}

/** Every kept find, whichever hunt turned it up.
 *
 * The mark in a results list filters that one search. A find kept three
 * searches ago is only reachable if you remember which search it was in, which
 * is precisely what keeping it was meant to spare you.
 */
export const KeptScreen: React.FC<KeptScreenProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const { kept, toggle } = useKept();
  const [listings, setListings] = useState<RowListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RowListing | null>(null);

  const load = useCallback(() => {
    fetch('/api/kept?listings=1', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { listings: [] }))
      .then(d =>
        setListings(
          (d.listings || []).map((l: Record<string, unknown>) => ({
            ...(l as object),
            id: String(l.id),
            image_url: Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : null,
          })) as RowListing[]
        )
      )
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Releasing a find leaves the row in place until the screen is reopened.
  // Making it vanish under the finger would take away the way back from a
  // mis-tap.
  const shown = listings;

  return (
    <div className="w-full bg-[#011F1F] text-[#F2F5F4] flex flex-col min-h-screen">
      <Bar title={t('surface.kept')} count={loading ? undefined : shown.length} onBack={onBack} />

      <div className="flex-1">
        {!loading && shown.length === 0 && (
          <EmptyLine message={t('surface.nothingKept')} />
        )}

        {shown.map(listing => (
          <Row
            key={listing.id}
            listing={listing}
            isKept={kept.has(listing.id)}
            onToggleKeep={toggle}
            onClick={l => setSelected(l)}
          />
        ))}
      </div>

      <FundeDetailSheet listing={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default KeptScreen;
