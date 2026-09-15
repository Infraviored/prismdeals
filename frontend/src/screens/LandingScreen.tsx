import { Settings } from 'lucide-react'
import type { Campaign, SearchTarget, Listing } from '../types'
import { useTranslation } from '../hooks/useTranslation'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

interface LandingScreenProps {
  campaigns: Campaign[]
  searches: SearchTarget[]
  listings: Listing[]
  onOpenCampaign: (campaign: Campaign) => void
  onConfigureCampaign: (campaign: Campaign) => void
  onDeleteCampaign: (campaign: Campaign) => void
  onCreateCampaign: () => void
}

export default function LandingScreen({
  campaigns,
  searches,
  listings,
  onOpenCampaign,
  onConfigureCampaign,
  onDeleteCampaign,
  onCreateCampaign,
}: LandingScreenProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 sm:space-y-6 animate-fadeIn w-full">
      <div className="flex justify-between items-center pb-4 border-b border-border-subtle w-full mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">{t('landing.title')}</h1>
          <p className="text-base text-text-secondary mt-1">{t('landing.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map(c => {
          const campaignSearches = searches.filter(s => s.campaign_id === c.id)
          const campaignListings = listings.filter(l => {
            const s = searches.find(x => x.id === l.search_id)
            return s && s.campaign_id === c.id
          })
          const unprocessedCount = campaignListings.filter(l => !l.llm_processed).length
          const firstListingWithImages = campaignListings.find(l => l.images && l.images.length > 0)
          const firstImg = firstListingWithImages?.images?.[0]

          return (
            <Card
              interactive
              key={c.id}
              onClick={() => onOpenCampaign(c)}
              className="p-4 justify-between space-y-4"
            >
              {firstImg ? (
                <div className="w-full aspect-[21/9] rounded-xl overflow-hidden relative border border-border-subtle shadow-inner">
                  <img
                    src={firstImg}
                    alt={c.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/20 to-transparent" />
                </div>
              ) : (
                <div className="w-full aspect-[21/9] rounded-xl relative border border-border-subtle bg-bg-surface flex items-center justify-center overflow-hidden">
                  <span className="text-sm font-medium text-text-muted">{t('landing.noListings')}</span>
                </div>
              )}

              <div className="flex-1 flex flex-col justify-between pt-1">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-text-primary group-hover:text-brand-accent transition-colors tracking-tight line-clamp-1">{c.name}</h3>
                      <p className="text-sm text-text-secondary mt-0.5">{t('landing.profileType')}</p>
                    </div>

                    <div className="flex items-center shrink-0">
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          onConfigureCampaign(c)
                        }}
                        title={t('landing.configureTooltip')}
                        aria-label={t('landing.configureTooltip')}
                        className="w-11 h-11 flex items-center justify-center rounded-xl"
                      >
                        <Settings className="w-5 h-5 transition-transform duration-500 hover:rotate-90 text-text-muted hover:text-brand-accent" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-sm font-medium">
                    <span className="bg-bg-input text-text-secondary border border-border-subtle px-2.5 py-1 rounded-md">
                      {campaignSearches.length} {campaignSearches.length === 1 ? t('landing.target') : t('landing.targets')}
                    </span>
                    <span className="bg-bg-input text-text-primary border border-border-subtle px-2.5 py-1 rounded-md font-semibold">
                      {campaignListings.length} {t('landing.matches')}
                    </span>
                    {unprocessedCount > 0 && (
                      <span className="bg-brand-accent/15 text-brand-accent border border-brand-accent/25 px-2.5 py-1 rounded-md font-semibold">
                        {unprocessedCount} {t('landing.new')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-border-subtle mt-4 pt-3 flex justify-between items-center text-base font-semibold">
                  <span className="text-text-secondary group-hover:text-brand-accent transition-colors">
                    {t('landing.openDashboard')}
                  </span>
                  <Button
                    variant="icon"
                    size="xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteCampaign(c)
                    }}
                    title={t('landing.deleteTooltip')}
                    aria-label={t('landing.deleteTooltip')}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-text-muted hover:text-status-danger transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round"
                         className="w-5 h-5"
                         aria-hidden="true">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}

        {/* "+" Add Search Card */}
        <Card
          interactive
          onClick={onCreateCampaign}
          className="bg-bg-surface/20 border-dashed border-border-subtle hover:border-brand-accent/50 hover:bg-brand-accent/[0.02] p-6 items-center justify-center space-y-4 h-full min-h-[220px]"
        >
          <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold text-3xl group-hover:bg-brand-accent group-hover:text-bg-base transition-all shadow-inner">
            +
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold text-text-primary group-hover:text-brand-accent transition-colors">{t('landing.createCampaign')}</h3>
            <p className="text-sm text-text-muted mt-1 max-w-[200px]">{t('landing.createSubtitle')}</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
