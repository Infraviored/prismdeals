import { useState } from 'react'
import type { Campaign, SearchTarget, KnowledgeSet, SampleListing } from '../types'
import type { RouteCorridorData } from '../components/RouteResultsView'
import type { Place } from '../components/PlaceInput'
import { useTranslation } from '../hooks/useTranslation'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import CorridorPlanner from '../components/CorridorPlanner'
import PlaceInput from '../components/PlaceInput'
import SearchFamilyEditor from '../components/SearchFamilyEditor'
import GuidelinesWizard from '../components/GuidelinesWizard'
import {
  Layers,
  MapPin,
  Sparkles,
  Navigation,
  Trash2,
  Check,
  Plus,
} from 'lucide-react'

type EditTab = 'terms' | 'geometry' | 'guidelines'

interface EditScreenProps {
  campaign: Campaign | undefined
  searches: SearchTarget[]
  knowledgeSets: KnowledgeSet[]
  activeSearchTarget: SearchTarget | undefined
  campaignRouteData: RouteCorridorData | null
  loadingRouteData: boolean
  geometrySuccessMsg: string | null
  // Inline form state
  newTargetUrl: string
  setNewTargetUrl: (v: string) => void
  searchTargetMode: 'point' | 'route' | 'family'
  setSearchTargetMode: (m: 'point' | 'route' | 'family') => void
  routeFrom: Place | null
  setRouteFrom: (p: Place | null) => void
  routeTo: Place | null
  setRouteTo: (p: Place | null) => void
  routeRadiusKm: number
  setRouteRadiusKm: (n: number) => void
  routeCorridorKm: number
  setRouteCorridorKm: (n: number) => void
  routePlanning: boolean
  routeError: string | null
  routeResult: { count: number; width: number } | null
  // Wizard state
  marketMemo: string
  setMarketMemo: (v: string) => void
  sampledListings: SampleListing[]
  sampledListingsLoading: boolean
  fetchSampleListings: (id: number) => Promise<void>
  researcherOutput: string
  setResearcherOutput: (v: string) => void
  researchPromptTemplate: string
  marketPromptTemplate: string
  profilePromptTemplate: string
  editKsError: string
  wizardStep: 1 | 2 | 3
  setWizardStep: (s: 1 | 2 | 3) => void
  handleSaveKnowledgeSet: () => Promise<void>
  parsedExpertKnowledge: string
  parsedGoodRef: string
  parsedBadRef: string
  parsedDemoMsg: string
  parsedItemJson: string
  isScraping: boolean
  scrapingStatus: string
  scrapingProgress: { phase: string; current: number; total: number; status: string } | null
  // Handlers
  onBack: () => void
  onAddSearchTarget: () => void
  onDeleteSearch: (id: number) => void
  onPlanCorridor: () => void
  onRemoveRoute: () => void
  onUpdateCorridor: (radiusKm: number, corridorKm: number) => void
  onSaveFamily: (family: { id: number }) => void
  // URL utilities
  isValidKleinanzeigenUrl: (url: string) => boolean
  suggestTitleFromUrl: (url: string) => string
  previewLoading: boolean
  previewCount: number | null
  previewError: string | null
  // Campaign rename
  onUpdateCampaignName: (name: string) => void
}

export default function EditScreen({
  campaign,
  searches,
  activeSearchTarget,
  campaignRouteData,
  loadingRouteData,
  geometrySuccessMsg,
  newTargetUrl,
  setNewTargetUrl,
  searchTargetMode,
  setSearchTargetMode,
  routeFrom,
  setRouteFrom,
  routeTo,
  setRouteTo,
  routeRadiusKm,
  setRouteRadiusKm,
  routeCorridorKm,
  setRouteCorridorKm,
  routePlanning,
  routeError,
  routeResult,
  marketMemo,
  setMarketMemo,
  sampledListings,
  sampledListingsLoading,
  fetchSampleListings,
  researcherOutput,
  setResearcherOutput,
  researchPromptTemplate,
  marketPromptTemplate,
  profilePromptTemplate,
  editKsError,
  wizardStep,
  setWizardStep,
  handleSaveKnowledgeSet,
  parsedExpertKnowledge,
  parsedGoodRef,
  parsedBadRef,
  parsedDemoMsg,
  parsedItemJson,
  isScraping,
  scrapingStatus,
  scrapingProgress,
  onBack,
  onAddSearchTarget,
  onDeleteSearch,
  onPlanCorridor,
  onRemoveRoute,
  onUpdateCorridor,
  onSaveFamily,
  isValidKleinanzeigenUrl,
  suggestTitleFromUrl,
  previewLoading,
  previewCount,
  previewError,
  onUpdateCampaignName,
}: EditScreenProps) {
  const { t } = useTranslation()
  const [editTab, setEditTab] = useState<EditTab>('terms')
  const [isEditingCampaignName, setIsEditingCampaignName] = useState(false)

  const campaignId = campaign?.id ?? null
  const activeSearches = searches.filter(s => s.campaign_id === campaignId)

  return (
    <div className="flex flex-col space-y-6 w-full animate-fadeIn max-w-6xl mx-auto py-2">
      {/* Sub Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center items-start gap-3 pb-4 border-b border-border-subtle w-full">
        <div className="flex flex-col sm:flex-row sm:items-center items-start gap-3 w-full sm:w-auto">
          <Button
            variant="badge"
            size="sm"
            onClick={onBack}
            className="shrink-0"
          >
            <span>← {t('common.backToDashboard')}</span>
          </Button>
          <div className="hidden sm:block w-[1px] h-5 bg-border-subtle shrink-0" />
          <div className="flex flex-col min-w-0">
            {isEditingCampaignName ? (
              <div className="flex items-center space-x-2">
                <Input
                  type="text"
                  value={campaign?.name || ''}
                  onChange={e => onUpdateCampaignName(e.target.value)}
                  onBlur={() => setIsEditingCampaignName(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') setIsEditingCampaignName(false)
                  }}
                  className="py-1 text-sm rounded-lg"
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => setIsEditingCampaignName(false)}
                >
                  {t('common.done')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 group">
                <h1 className="text-xl font-bold text-text-primary truncate">
                  {campaign?.name} {t('common.settings')}
                </h1>
                <Button
                  variant="icon"
                  size="xs"
                  onClick={() => setIsEditingCampaignName(true)}
                  title={t('common.renameCampaign')}
                  className="p-1 shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </Button>
              </div>
            )}
            <p className="text-sm text-text-secondary mt-0.5">{t('common.targetsAndGuidelines')}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-bg-input border border-border-subtle rounded-xl max-w-3xl overflow-x-auto">
        <button
          type="button"
          onClick={() => setEditTab('terms')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
            editTab === 'terms'
              ? 'bg-brand-accent/15 text-brand-accent shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span className="sm:hidden">{t('campaignSettings.tabTermsShort')}</span><span className="hidden sm:inline">{t('campaignSettings.tabTerms')}</span>
        </button>
        <button
          type="button"
          onClick={() => setEditTab('geometry')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
            editTab === 'geometry'
              ? 'bg-brand-accent/15 text-brand-accent shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="sm:hidden">{t('campaignSettings.tabGeometryShort')}</span><span className="hidden sm:inline">{t('campaignSettings.tabGeometry')}</span>
        </button>
        <button
          type="button"
          onClick={() => setEditTab('guidelines')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
            editTab === 'guidelines'
              ? 'bg-brand-accent/15 text-brand-accent shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="sm:hidden">{t('campaignSettings.tabGuidelinesShort')}</span><span className="hidden sm:inline">{t('campaignSettings.tabGuidelines')}</span>
        </button>
      </div>

      {/* TAB 1: SEARCH TERMS & MODELS */}
      {editTab === 'terms' && (
        <div className="w-full space-y-3 sm:space-y-6 animate-fadeIn">
          {campaign?.family_id || searchTargetMode === 'family' ? (
            <div className="max-w-3xl mx-auto w-full space-y-4">
              <SearchFamilyEditor
                campaignId={campaignId}
                familyId={campaign?.family_id ?? undefined}
                initialBaseUrl={newTargetUrl || (activeSearches[0]?.url || '')}
                onSave={(savedFamily) => {
                  onSaveFamily(savedFamily)
                }}
                onCancel={() => {
                  if (!campaign?.family_id) {
                    setSearchTargetMode('point')
                  }
                  onBack()
                }}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-6">
              {/* Add Single Search Target Card */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">{t('common.pasteSearchUrl')}</h2>
                    <p className="text-xs text-text-secondary">{t('wizard.targetsDescription')}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setSearchTargetMode('family')}
                    className="flex items-center gap-1 text-brand-accent font-semibold"
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('campaignSettings.btnCreateFamily')}</span>
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newTargetUrl}
                      onChange={e => setNewTargetUrl(e.target.value)}
                      placeholder={t('common.searchUrlPlaceholder')}
                      className="font-mono text-sm flex-1"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl)}
                      onClick={onAddSearchTarget}
                      className="shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      <span>{t('common.add')}</span>
                    </Button>
                  </div>

                  {newTargetUrl && (
                    <div className="bg-bg-input border border-border-subtle rounded-xl p-3 text-xs space-y-1.5 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">{t('common.urlStatus')}:</span>
                        {isValidKleinanzeigenUrl(newTargetUrl) ? (
                          <span className="text-status-good font-bold">{t('common.validUrl')}</span>
                        ) : (
                          <span className="text-status-danger font-bold">{t('common.invalidUrl')}</span>
                        )}
                      </div>
                      {suggestTitleFromUrl(newTargetUrl) && (
                        <div className="flex items-center justify-between">
                          <span className="text-text-muted">{t('common.suggestedName')}:</span>
                          <span className="text-text-primary font-semibold">{suggestTitleFromUrl(newTargetUrl)}</span>
                        </div>
                      )}
                      {previewLoading && (
                        <div className="text-text-muted flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping" />
                          <span>{t('common.processing')}</span>
                        </div>
                      )}
                      {previewCount !== null && (
                        <div className="text-status-good font-semibold">
                          {t('common.foundCount', { count: previewCount })}
                        </div>
                      )}
                      {previewError && (
                        <div className="text-status-danger font-semibold">
                          {previewError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Active Searches List */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
                  {t('campaignSettings.singleSearchesTitle')} ({activeSearches.length})
                </h3>
                {activeSearches.length === 0 ? (
                  <Card className="p-8 text-center text-text-muted text-sm border-dashed">
                    {t('campaignSettings.noSearchesYet')}
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {activeSearches.map(s => (
                      <Card key={s.id} className="p-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-text-primary truncate">{s.name || s.url}</h4>
                          <p className="text-xs text-text-muted font-mono truncate">{s.url}</p>
                        </div>
                        <Button
                          variant="icon"
                          size="xs"
                          onClick={() => s.id && onDeleteSearch(s.id)}
                          title={t('common.delete')}
                          className="text-text-muted hover:text-status-danger"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GEOMETRY & LOCATION */}
      {editTab === 'geometry' && (
        <div className="max-w-3xl mx-auto w-full space-y-3 sm:space-y-6 animate-fadeIn">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-text-primary tracking-tight font-heading">
              {t('campaignSettings.geometryTitle')}
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('campaignSettings.geometrySubtitle')}
            </p>
          </div>

          {geometrySuccessMsg && (
            <div className="bg-status-good/10 text-status-good px-4 py-2.5 rounded-xl border border-status-good/20 text-sm font-semibold flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 shrink-0" />
              <span>{geometrySuccessMsg}</span>
            </div>
          )}

          {campaign?.route_id ? (
            /* Route Corridor Active */
            <Card className="p-6 space-y-5 border-brand-accent/30 bg-bg-surface">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-accent/15 border border-border-brand flex items-center justify-center text-brand-accent shrink-0">
                    <Navigation className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-brand-accent/15 text-brand-accent border border-border-brand">
                        {t('campaignSettings.activeModeRoute')}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {t('campaignSettings.currentRouteNotice')}
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRemoveRoute}
                  className="text-status-danger border-status-danger/30 hover:bg-status-danger/10 shrink-0 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  <span>{t('campaignSettings.btnSwitchToLocation')}</span>
                </Button>
              </div>

              {routeResult && (
                <div className="text-sm bg-status-good/10 text-status-good px-3.5 py-2.5 rounded-xl border border-status-good/20 font-semibold animate-fadeIn">
                  {t('common.corridorPlanned', { count: routeResult.count, width: routeResult.width })}
                </div>
              )}

              {campaignRouteData?.route && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-bg-input p-3 rounded-xl border border-border-subtle">
                      <span className="text-text-muted block">{t('common.routeFrom')} → {t('common.routeTo')}</span>
                      <span className="font-bold text-text-primary text-sm mt-0.5 block truncate">
                        {campaignRouteData.route.origin} → {campaignRouteData.route.destination}
                      </span>
                    </div>
                    <div className="bg-bg-input p-3 rounded-xl border border-border-subtle">
                      <span className="text-text-muted block">{t('corridor.radiusLabel', { km: campaignRouteData.route.radius_km })}</span>
                      <span className="font-bold text-text-primary text-sm mt-0.5 block">
                        {campaignRouteData.route.radius_km} km
                      </span>
                    </div>
                    <div className="bg-bg-input p-3 rounded-xl border border-border-subtle">
                      <span className="text-text-muted block">{t('corridor.halfWidthLabel', { km: campaignRouteData.route.half_width_km })}</span>
                      <span className="font-bold text-text-primary text-sm mt-0.5 block">
                        ±{campaignRouteData.route.half_width_km} km ({campaignRouteData.route.half_width_km * 2} km {t('corridor.totalWidth')})
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border-subtle">
                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">
                      {t('corridor.editSettings')}
                    </h4>
                    <CorridorPlanner
                      baseUrl={campaignRouteData.route.base_url || newTargetUrl || (activeSearches[0]?.url || 'https://www.kleinanzeigen.de/s-multimedia-elektronik/c161')}
                      origin={campaignRouteData.route.origin}
                      destination={campaignRouteData.route.destination}
                      originName={campaignRouteData.route.origin}
                      destinationName={campaignRouteData.route.destination}
                      radiusKm={campaignRouteData.route.radius_km}
                      corridorKm={campaignRouteData.route.half_width_km}
                      onRadiusChange={(r) => onUpdateCorridor(r, campaignRouteData.route.half_width_km)}
                      onCorridorChange={(c) => onUpdateCorridor(campaignRouteData.route.radius_km, c)}
                      onCommit={() => onUpdateCorridor(campaignRouteData.route.radius_km, campaignRouteData.route.half_width_km)}
                      committing={loadingRouteData}
                      commitLabel={t('corridor.commitChange')}
                    />
                  </div>
                </div>
              )}
            </Card>
          ) : (
            /* Single Location Active */
            <div className="space-y-6">
              <Card className="p-6 space-y-4 bg-bg-surface border-border-subtle">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-status-good/15 border border-status-good/20 flex items-center justify-center text-status-good shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-status-good/15 text-status-good border border-status-good/20">
                      {t('campaignSettings.activeModeLocation')}
                    </span>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      {t('campaignSettings.currentLocationNotice')}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Switch to Route Form */}
              <Card className="p-6 space-y-4 bg-bg-surface border-border-subtle">
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    {t('campaignSettings.switchToRoutePrompt')}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {t('common.routeExplainer')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PlaceInput
                    label={t('common.routeFrom')}
                    placeholder={t('common.routePlaceholder')}
                    value={routeFrom}
                    onChange={setRouteFrom}
                    emptyHint={t('common.routeNoMatches')}
                  />
                  <PlaceInput
                    label={t('common.routeTo')}
                    placeholder={t('common.routePlaceholder')}
                    value={routeTo}
                    onChange={setRouteTo}
                    emptyHint={t('common.routeNoMatches')}
                  />
                </div>

                {routeFrom && routeTo ? (
                  <CorridorPlanner
                    baseUrl={newTargetUrl || activeSearches[0]?.url || 'https://www.kleinanzeigen.de/s-multimedia-elektronik/c161'}
                    origin={routeFrom.postal_code}
                    destination={routeTo.postal_code}
                    originName={routeFrom.name}
                    destinationName={routeTo.name}
                    radiusKm={routeRadiusKm}
                    corridorKm={routeCorridorKm}
                    onRadiusChange={setRouteRadiusKm}
                    onCorridorChange={setRouteCorridorKm}
                    onCommit={onPlanCorridor}
                    committing={routePlanning}
                    commitLabel={t('campaignSettings.btnSwitchToRoute')}
                  />
                ) : (
                  <p className="text-xs text-text-muted text-center py-2">
                    {!routeFrom && !routeTo
                      ? t('common.routeNeedsBoth')
                      : !routeFrom
                        ? t('common.routeNeedsFrom')
                        : t('common.routeNeedsTo')}
                  </p>
                )}

                {routeError && (
                  <div className="text-xs bg-status-danger/10 text-status-danger px-3.5 py-2 rounded-xl border border-status-danger/20 font-semibold animate-fadeIn">
                    {routeError}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI GUIDELINES */}
      {editTab === 'guidelines' && (
        <div className="w-full animate-fadeIn space-y-4">
          {activeSearchTarget ? (
            <GuidelinesWizard
              activeSearchTarget={activeSearchTarget}
              marketMemo={marketMemo}
              setMarketMemo={setMarketMemo}
              sampledListings={sampledListings}
              sampledListingsLoading={sampledListingsLoading}
              fetchSampleListings={fetchSampleListings}
              researcherOutput={researcherOutput}
              setResearcherOutput={setResearcherOutput}
              researchPromptTemplate={researchPromptTemplate}
              marketPromptTemplate={marketPromptTemplate}
              profilePromptTemplate={profilePromptTemplate}
              editKsError={editKsError}
              wizardStep={wizardStep}
              setWizardStep={setWizardStep}
              handleSaveKnowledgeSet={handleSaveKnowledgeSet}
              parsedExpertKnowledge={parsedExpertKnowledge}
              parsedGoodRef={parsedGoodRef}
              parsedBadRef={parsedBadRef}
              parsedDemoMsg={parsedDemoMsg}
              parsedItemJson={parsedItemJson}
              isScraping={isScraping}
              scrapingStatus={scrapingStatus}
              scrapingProgress={scrapingProgress}
            />
          ) : (
            <Card className="p-8 text-center space-y-3">
              <p className="text-text-muted text-sm">{t('campaignSettings.noSearchesYet')}</p>
              <Button variant="primary" size="sm" onClick={() => setEditTab('terms')}>
                {t('campaignSettings.tabTerms')} →
              </Button>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
