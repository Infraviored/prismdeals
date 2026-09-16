import React, { useState } from 'react';
import { Bar, Row, Pill, Sheet, EmptyLine, type RowListing } from '../components/surface';

const DEMO_LISTINGS: RowListing[] = [
  {
    id: 'demo-1',
    title: 'Federkern-Matratze Ikea 140x200 sehr guter Zustand',
    price_eur: 90,
    price: '90 €',
    location: 'Landsberg am Lech',
    detour_min: 0,
    images: ['https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=150&auto=format&fit=crop&q=80'],
    first_seen_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    is_deal: false,
  },
  {
    id: 'demo-2',
    title: 'Novilla Matratzentopper 180x200 Gelschaum fast neu',
    price_eur: 55,
    price: '55 €',
    location: 'Sigmarszell',
    detour_min: 4,
    images: ['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=150&auto=format&fit=crop&q=80'],
    first_seen_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    is_deal: false,
  },
  {
    id: 'demo-3',
    title: 'Ikea Bettgestell inkl. Taschenfederkernmatratze',
    price_eur: 35,
    price: '35 €',
    location: 'Memmingen',
    detour_min: 12,
    images: ['https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=150&auto=format&fit=crop&q=80'],
    first_seen_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    is_deal: true, // Deal signal in Coral (#E87967)
  },
  {
    id: 'demo-4',
    title: 'Gästematratze klappbar 80x200 (kein Foto hochgeladen)',
    price_eur: 20,
    price: '20 €',
    location: 'Augsburg',
    detour_min: null,
    offroute_km: 15,
    images: [],
    first_seen_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-5',
    title: 'Latexmatratze Natur H3 90x200 (ohne Ortsangabe im Inserat)',
    price_eur: 70,
    price: '70 €',
    location: null,
    detour_min: 8,
    images: ['https://images.unsplash.com/photo-1540518614846-7ede433c4550?w=150&auto=format&fit=crop&q=80'],
    first_seen_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-6',
    title: 'Matratzenschoner und Topper zu verschenken',
    price_eur: null,
    price: null,
    location: 'Konstanz',
    detour_min: null,
    images: ['https://images.unsplash.com/photo-1582582621959-48d27397dc69?w=150&auto=format&fit=crop&q=80'],
    first_seen_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-7',
    title: 'Tempur Original 19 Matratze 90x200cm',
    price_eur: 120,
    price: '120 €',
    location: 'Kempten',
    detour_min: 25,
    images: ['https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=150&auto=format&fit=crop&q=80'],
    first_seen_at: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(), // Stale (> 7 days)
  },
];

import { useTranslation } from '../hooks/useTranslation';

export interface SurfacePreviewScreenProps {
  onBack: () => void;
}

export const SurfacePreviewScreen: React.FC<SurfacePreviewScreenProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [selectedListing, setSelectedListing] = useState<RowListing | null>(null);
  const [activeRadius, setActiveRadius] = useState<number>(30);
  const [dealsOnly, setDealsOnly] = useState<boolean>(false);

  const displayedListings = dealsOnly
    ? DEMO_LISTINGS.filter((l) => l.is_deal)
    : DEMO_LISTINGS;

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col">
      {/* 1. Bar: 48px sticky header */}
      <Bar
        title="Matratze"
        count={displayedListings.length}
        onBack={onBack}
        backLabel={t('landing.title')}
        actions={
          <>
            <Pill
              label="30 km"
              active={activeRadius === 30}
              onClick={() => setActiveRadius(30)}
            />
            <Pill
              label="≤ 100 €"
              active={true}
            />
            <Pill
              label={t('surface.dealsOnly')}
              variant="accent"
              active={dealsOnly}
              onClick={() => setDealsOnly(!dealsOnly)}
            />
          </>
        }
      />

      {/* 2. List of Rows (88px, hairline divider, hero price) */}
      <main className="w-full max-w-2xl mx-auto flex-1 flex flex-col">
        {displayedListings.map((listing) => (
          <Row
            key={listing.id}
            listing={listing}
            onClick={(l) => setSelectedListing(l)}
          />
        ))}

        {/* 3. EmptyLine: single line text + action pills */}
        <EmptyLine
          message={t('surface.noMatchesInRadius', { radius: activeRadius })}
          actions={
            <>
              <Pill
                label="50 km"
                count={4}
                active={activeRadius === 50}
                onClick={() => setActiveRadius(50)}
              />
              <Pill
                label="100 km"
                count={18}
                active={activeRadius === 100}
                onClick={() => setActiveRadius(100)}
              />
              <Pill
                label="200 km"
                count={42}
                active={activeRadius === 200}
                onClick={() => setActiveRadius(200)}
              />
            </>
          }
        />
      </main>

      {/* 4. Sheet: Slide-over details sheet */}
      <Sheet
        isOpen={selectedListing !== null}
        onClose={() => setSelectedListing(null)}
        title={selectedListing?.title || t('common.description')}
      >
        {selectedListing && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-3">
              <span className="text-2xl font-bold font-heading tabular-nums text-[#F2F5F4]">
                {selectedListing.price || t('surface.noPrice')}
              </span>
              <span className="text-xs text-[#9FB3B0]">
                {selectedListing.location || t('surface.noLocation')}
              </span>
            </div>
            {selectedListing.images && selectedListing.images.length > 0 && (
              <img
                src={selectedListing.images[0]}
                alt={selectedListing.title}
                className="w-full h-48 object-cover rounded-lg"
              />
            )}
            <p className="text-sm text-[#9FB3B0] leading-relaxed">
              {t('common.description')}
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
};

export default SurfacePreviewScreen;
