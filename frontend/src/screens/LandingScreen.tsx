import React from 'react';
import { Plus } from 'lucide-react';
import { Bar, SearchRow, Pill, EmptyLine } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign, SearchTarget, Listing } from '../types';
import { getSearchLocationSubtitle, getSearchFreshnessSubtitle } from '../utils/searchHelpers';

export interface LandingScreenProps {
  campaigns: Campaign[];
  searches: SearchTarget[];
  listings: Listing[];
  onOpenCampaign: (campaign: Campaign) => void;
  onCreateCampaign: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  campaigns,
  searches,
  listings,
  onOpenCampaign,
  onCreateCampaign,
}) => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col w-full">
      {/* 1. Sticky Bar (48px) */}
      <Bar
        title={t('surface.searches')}
        actions={
          <Pill
            data-testid="create-campaign-btn"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onCreateCampaign}
            title={t('surface.newSearch')}
            aria-label={t('surface.newSearch')}
          />
        }
      />

      {/* 2. Main Search List */}
      <main className="w-full max-w-3xl mx-auto flex-1 flex flex-col">
        {campaigns.map((c) => {
          const campaignSearches = searches.filter((s) => s.campaign_id === c.id);
          const campaignListings = listings.filter((l) => {
            return campaignSearches.some((s) => s.id === l.search_id) || l.campaign_name === c.name;
          });

          // Youngest listing with image for the thumbnail
          const listingWithImg = campaignListings.find((l) => l.images && l.images.length > 0);
          const firstImg = listingWithImg?.images?.[0] || null;

          const locationLabel = getSearchLocationSubtitle(c, campaignSearches, campaignListings, t);
          const freshnessLabel = getSearchFreshnessSubtitle(campaignListings, t);

          return (
            <SearchRow
              key={c.id}
              id={c.id}
              name={c.name}
              count={campaignListings.length}
              locationLabel={locationLabel}
              freshnessLabel={freshnessLabel}
              imageUrl={firstImg}
              onClick={() => onOpenCampaign(c)}
            />
          );
        })}

        {/* Empty State */}
        {campaigns.length === 0 && (
          <EmptyLine
            message={t('surface.noSearches')}
            actions={
              <Pill
                data-testid="create-campaign-empty-btn"
                label={t('surface.newSearch')}
                onClick={onCreateCampaign}
              />
            }
          />
        )}
      </main>
    </div>
  );
};

export default LandingScreen;
