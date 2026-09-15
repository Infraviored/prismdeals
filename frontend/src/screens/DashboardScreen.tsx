import type { Campaign, SearchTarget, Listing } from '../types'
import type { ScraperProgressCardProps } from '../types'
import RouteResultsView from '../components/RouteResultsView'
import ListingDetailCard from '../components/ListingDetailCard'
import ScraperProgressCard from '../components/ScraperProgressCard'
import { useTranslation } from '../hooks/useTranslation'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Sparkles, Search, RefreshCw, Settings, X } from 'lucide-react'
import { cn } from '../utils/cn'

/**
 * Actions for the standard (non-route/family) dashboard.
 * Defined once here; rendered by the header card. No button may appear
 * outside this list on this screen.
 */

interface DashboardScreenProps {
  campaign: Campaign | undefined
  searches: SearchTarget[]
  listings: Listing[]
  // Filters
  selectedSearchId: string
  setSelectedSearchId: (v: string) => void
  selectedStatusFilter: 'All' | 'High Niceness' | 'New' | 'Evaluate with AI'
  setSelectedStatusFilter: (v: 'All' | 'High Niceness' | 'New' | 'Evaluate with AI') => void
  // Listing selection
  selectedListingId: string | null
  setSelectedListingId: (id: string | null) => void
  activeProcessingListingIds: string[]
  handleProcessSingleListing: (id: string) => void
  // Scraper state
  isScraping: boolean
  isProcessing: boolean
  processingStatus: string
  scrapingStatus: string
  scrapingProgress: ScraperProgressCardProps['scrapingProgress']
  liveLogs: string
  showLogConsole: boolean
  setShowLogConsole: (v: boolean) => void
  // Handlers
  onBack: () => void
  onConfigure: () => void
  onStartScrape: () => void
  onStartDeepUpdate: () => void
  onStartProcess: () => void
  // Route/Family mode (shows RouteResultsView)
  isRouteOrFamilyMode: boolean
  onEvaluateWithAi: () => void
  onEditFamily: () => void
}

export default function DashboardScreen({
  campaign,
  searches,
  listings,
  selectedSearchId,
  setSelectedSearchId,
  selectedStatusFilter,
  setSelectedStatusFilter,
  selectedListingId,
  setSelectedListingId,
  activeProcessingListingIds,
  handleProcessSingleListing,
  isScraping,
  isProcessing,
  processingStatus,
  scrapingStatus,
  scrapingProgress,
  liveLogs,
  showLogConsole,
  setShowLogConsole,
  onBack,
  onConfigure,
  onStartScrape,
  onStartDeepUpdate,
  onStartProcess,
  isRouteOrFamilyMode,
  onEvaluateWithAi,
  onEditFamily,
}: DashboardScreenProps) {
  const { t } = useTranslation()
  const campaignId = campaign?.id ?? null

  if (isRouteOrFamilyMode) {
    return (
      <div className="flex flex-col space-y-3 sm:space-y-6 animate-fadeIn w-full">
        <div className="flex items-center space-x-3">
          <Button
            variant="badge"
            size="sm"
            onClick={onBack}
            className="px-3 py-1.5"
          >
            <span className="mr-1">←</span>
            <span>{t('common.backToCampaigns')}</span>
          </Button>
          <div className="w-[1px] h-5 bg-border-subtle" />
          {/* Single settings entry point for this screen */}
          <Button
            variant="icon"
            size="xs"
            onClick={onConfigure}
            title={t('landing.configureTooltip')}
            className="p-1.5 border-border-subtle hover:border-brand-accent/30"
          >
            <Settings className="w-4 h-4 transition-transform duration-500 hover:rotate-90 text-text-muted hover:text-brand-accent" />
          </Button>
        </div>

        <RouteResultsView
          campaignId={campaignId || 0}
          campaignName={campaign?.name || ''}
          familyId={campaign?.family_id ?? undefined}
          onEvaluateWithAi={onEvaluateWithAi}
          isScraping={isScraping}
          onStartScrape={onStartScrape}
          scrapingStatus={scrapingStatus}
          scrapingProgress={scrapingProgress}
          liveLogs={liveLogs}
          showLogConsole={showLogConsole}
          setShowLogConsole={setShowLogConsole}
          onEditFamily={onEditFamily}
        />
      </div>
    )
  }

  // Standard dashboard (non-route, non-family)
  const campaignSearches = searches.filter(s => s.campaign_id === campaignId)
  const filteredListings = listings.filter(l => {
    const targetSearch = searches.find(s => s.id === l.search_id)
    const matchesCampaign = !campaignId || (targetSearch && targetSearch.campaign_id === campaignId)
    const matchesSearch = selectedSearchId === 'All' || String(l.search_id) === selectedSearchId
    const isMatched = matchesCampaign && matchesSearch

    if (selectedStatusFilter === 'High Niceness') {
      return isMatched && l.llm_processed && l.niceness_score !== null && l.niceness_score !== undefined && l.niceness_score >= 70
    }
    if (selectedStatusFilter === 'New') {
      return isMatched && l.status === 'New'
    }
    if (selectedStatusFilter === 'Evaluate with AI') {
      return isMatched && !l.llm_processed
    }
    return isMatched
  })

  return (
    <div className="flex flex-col space-y-3 sm:space-y-6 animate-fadeIn w-full">
      {/* Campaign Breadcrumb Headers & Filters */}
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Button
            variant="badge"
            size="sm"
            onClick={onBack}
            className="px-3 py-1.5"
          >
            <span className="mr-1">←</span>
            <span>{t('common.backToCampaigns')}</span>
          </Button>
          <span className="text-text-muted hidden sm:inline">|</span>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white">
              {campaign?.name} {t('listing.dashboardTitle')}
            </h2>
            {/* Single settings entry point — no duplicate gear icons */}
            <Button
              variant="icon"
              size="xs"
              onClick={onConfigure}
              title={t('landing.configureTooltip')}
              className="p-1.5 border-border-subtle hover:border-brand-accent/30"
            >
              <Settings className="w-4 h-4 transition-transform duration-500 hover:rotate-90 text-text-muted hover:text-brand-accent" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-4 w-full md:w-auto">
          {/* Action list — all actions for this screen, defined here, rendered here */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <Button
              variant="action-emerald"
              size="sm"
              onClick={onStartScrape}
              disabled={isScraping || isProcessing}
              className="min-w-[9.5rem] py-2.5 px-3 text-center flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{t('dashboard.fetchFresh')}</span>
            </Button>
            <Button
              variant="action-sky"
              size="sm"
              onClick={onStartDeepUpdate}
              disabled={isScraping || isProcessing}
              className="min-w-[9.5rem] py-2.5 px-3 text-center flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('dashboard.updateDesc')}</span>
            </Button>
            <Button
              variant="action-indigo"
              size="sm"
              onClick={onStartProcess}
              disabled={isScraping || isProcessing}
              className="min-w-[9.5rem] py-2.5 px-3 text-center flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('dashboard.autoAi')}</span>
            </Button>
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <Select
              value={selectedSearchId}
              onChange={setSelectedSearchId}
              options={[
                { value: 'All', label: t('dashboard.filterAllSearches') },
                ...campaignSearches.map(s => ({ value: String(s.id), label: s.name }))
              ]}
              className="w-full sm:w-44"
            />
            <Select
              value={selectedStatusFilter}
              onChange={val => setSelectedStatusFilter(val as 'All' | 'High Niceness' | 'New' | 'Evaluate with AI')}
              options={[
                { value: 'All', label: t('dashboard.statusAll') },
                { value: 'High Niceness', label: `${t('dashboard.statusMatches')} (70+)` },
                { value: 'Evaluate with AI', label: t('dashboard.statusPending') },
                { value: 'New', label: t('dashboard.statusEvaluated') }
              ]}
              className="w-full sm:w-44"
            />
          </div>
        </div>
      </Card>

      <ScraperProgressCard
        isScraping={isScraping}
        scrapingStatus={scrapingStatus}
        scrapingProgress={scrapingProgress}
        liveLogs={liveLogs}
        showLogConsole={showLogConsole}
        setShowLogConsole={setShowLogConsole}
      />

      {isProcessing && (
        <div className="bg-brand-accent/5 border border-brand-accent/20 p-4 rounded-2xl flex items-center space-x-3 text-sm text-brand-accent">
          <div className="animate-pulse w-3 h-3 rounded-full bg-brand-accent" />
          <span className="font-semibold">{processingStatus}</span>
        </div>
      )}

      {/* Grid/Split of Matched Listings */}
      {filteredListings.length === 0 ? (
        <div className="bg-bg-surface/20 border border-dashed border-border-subtle rounded-2xl p-16 text-center shadow-inner">
          <span className="text-base text-text-muted font-semibold block mb-1">{t('common.noMatchingListings')}</span>
          <span className="text-sm text-text-muted block">{t('common.dashboardEmptyHint')}</span>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start w-full relative">

          {/* Left Master List / Mobile Grid */}
          <div className={cn(
            "w-full flex-1 flex flex-col gap-4",
            "lg:w-[380px] lg:max-w-[380px] lg:flex-initial lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-2 scrollbar-thin"
          )}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
              {filteredListings.map(l => (
                <ListingDetailCard
                  key={l.id}
                  l={l}
                  activeProcessingListingIds={activeProcessingListingIds}
                  handleProcessSingleListing={handleProcessSingleListing}
                  selectedListingId={selectedListingId}
                  setSelectedListingId={setSelectedListingId}
                  mode="list"
                />
              ))}
            </div>
          </div>

          {/* Right Detail Inspector (Desktop) */}
          <div className="hidden lg:block lg:flex-1 lg:sticky lg:top-24 bg-bg-surface border border-border-subtle rounded-2xl p-6 shadow-xl max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin w-full">
            {selectedListingId ? (() => {
              const selectedListing = listings.find(l => l.id === selectedListingId)
              return selectedListing ? (
                <ListingDetailCard
                  l={selectedListing}
                  activeProcessingListingIds={activeProcessingListingIds}
                  handleProcessSingleListing={handleProcessSingleListing}
                  selectedListingId={selectedListingId}
                  setSelectedListingId={setSelectedListingId}
                  mode="detail"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-text-muted">
                  <p className="text-sm font-semibold">{t('common.listingNotFound')}</p>
                </div>
              )
            })() : (
              <div className="h-[350px] flex flex-col items-center justify-center text-center p-8 text-text-muted border border-dashed border-border-subtle rounded-xl bg-bg-input/20">
                <Sparkles className="w-8 h-8 text-brand-accent/40 mb-3 animate-pulse" />
                <p className="text-sm font-semibold">{t('listing.selectListingPrompt') || 'Select a listing from the list to view its full AI evaluation, specs, and outreach drafts.'}</p>
              </div>
            )}
          </div>

          {/* Mobile Drawer Overlay / Dialog Modal for Details (lg:hidden) */}
          {selectedListingId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:hidden animate-fade-in">
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedListingId(null)} />
              <div className="bg-bg-surface border border-border-subtle w-full max-w-lg max-h-[85vh] rounded-2xl overflow-y-auto p-5 relative z-10 shadow-2xl animate-slide-up">
                <button
                  onClick={() => setSelectedListingId(null)}
                  className="absolute right-4 top-4 text-text-muted hover:text-white p-1 rounded-lg border border-border-subtle bg-bg-input"
                >
                  <X className="w-4 h-4" />
                </button>
                {(() => {
                  const selectedListing = listings.find(l => l.id === selectedListingId)
                  return selectedListing ? (
                    <div className="mt-4">
                      <ListingDetailCard
                        l={selectedListing}
                        activeProcessingListingIds={activeProcessingListingIds}
                        handleProcessSingleListing={handleProcessSingleListing}
                        selectedListingId={selectedListingId}
                        setSelectedListingId={setSelectedListingId}
                        mode="detail"
                      />
                    </div>
                  ) : null
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
