import { useState } from 'react';
import { useHashRouter } from './hooks/useHashRouter';
import { useTranslation } from './hooks/useTranslation';
import { useAuthSession } from './hooks/useAuthSession';
import { useAppData } from './hooks/useAppData';
import { useScraperControl } from './hooks/useScraperControl';
import { useCampaignEdit } from './hooks/useCampaignEdit';
import { useGuidelinesWizard } from './hooks/useGuidelinesWizard';
import AuthScreen from './components/AuthScreen';
import SettingsView from './components/SettingsView';
import LandingScreen from './screens/LandingScreen';
import DashboardScreen from './screens/DashboardScreen';
import EditScreen from './screens/EditScreen';
import CreateCampaignScreen from './screens/CreateCampaignScreen';
import { isValidKleinanzeigenUrl, suggestTitleFromUrl } from './utils/urlHelpers';
import { Globe, ChevronDown, LogOut, Key, Menu, X, Settings } from 'lucide-react';
import { Button } from './components/ui/Button';
import { cn } from './utils/cn';

export default function App() {
  const {
    view, currentCampaignId, currentSearchId, selectedListingId, wizardStep,
    previousView, setView, setCurrentCampaignId, setCurrentSearchId,
    setSelectedListingId, setWizardStep, navigate,
  } = useHashRouter();

  const { t, lang, toggleLanguage } = useTranslation();

  // --- UI chrome state ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  // --- Dashboard filters ---
  const [selectedSearchId, setSelectedSearchId] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'High Niceness' | 'New' | 'Evaluate with AI'>('All');

  // --- Scraper / Worker control ---
  const scraper = useScraperControl({
    refreshAll: () => appData.refreshAll(),
    onScrapeCompleted: () => {
      if (activeSearchTarget?.id) guidelines.fetchSampleListings(activeSearchTarget.id);
    },
  });

  // --- Kleinanzeigen & app auth ---
  const auth = useAuthSession({
    onLoginSuccess: () => appData.refreshAll(),
    setIsScraping: scraper.setIsScraping,
    setScrapingStatus: scraper.setScrapingStatus,
  });

  // --- App data ---
  const appData = useAppData({
    currentCampaignId,
    setCurrentCampaignId,
    view,
    navigate,
    appUser: auth.appUser,
  });

  const activeSearches = appData.searches.filter(s => s.campaign_id === currentCampaignId);
  const activeSearchTarget = appData.searches.find(s => s.id === currentSearchId) || activeSearches[0];

  // --- Guidelines wizard state & actions ---
  const guidelines = useGuidelinesWizard({
    activeSearchTarget,
    searches: appData.searches,
    knowledgeSets: appData.knowledgeSets,
    setWizardStep,
    refreshAll: appData.refreshAll,
    setView,
    appUser: auth.appUser,
  });

  // --- Campaign target editing & corridor planning ---
  const campaignEdit = useCampaignEdit({
    currentCampaignId,
    campaigns: appData.campaigns,
    setCampaigns: appData.setCampaigns,
    searches: appData.searches,
    setSearches: appData.setSearches,
    listings: appData.listings,
    campaignRouteData: appData.campaignRouteData,
    setCampaignRouteData: appData.setCampaignRouteData,
    setGeometrySuccessMsg: appData.setGeometrySuccessMsg,
    refreshAll: appData.refreshAll,
    setCurrentSearchId,
    setIsScraping: scraper.setIsScraping,
    setScrapingStatus: scraper.setScrapingStatus,
    setLiveLogs: scraper.setLiveLogs,
    setScrapingProgress: scraper.setScrapingProgress,
  });

  if (auth.authLoading || !auth.appUser) {
    return (
      <AuthScreen
        authLoading={auth.authLoading}
        loginEmail={auth.loginEmail}
        setLoginEmail={auth.setLoginEmail}
        loginPassword={auth.loginPassword}
        setLoginPassword={auth.setLoginPassword}
        loginError={auth.loginError}
        isLoggingIn={auth.isLoggingIn}
        onLoginSubmit={auth.handleLoginSubmit}
      />
    );
  }

  const currentCampaign = appData.campaigns.find(c => c.id === currentCampaignId);
  const isRouteOrFamilyMode = !!(currentCampaign?.route_id || currentCampaign?.family_id);

  const configureCurrentCampaign = () => {
    const firstTarget = appData.searches.find(s => s.campaign_id === currentCampaignId);
    navigate('edit', currentCampaignId, firstTarget?.id || null);
  };

  return (
    <div className="min-h-screen bg-brand-primary text-text-primary flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-border-subtle bg-bg-surface/60 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('landing', null, null)}>
          <img src={`${import.meta.env.BASE_URL}logo-icon.svg`} alt="prismdeals Icon" className="w-8 h-8 rounded-lg shadow shadow-black/30" />
          {/* eslint-disable-next-line no-restricted-syntax -- product name */}
          <span className="font-bold text-xl tracking-wide text-white font-sans">prismdeals</span>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 text-text-muted hover:text-white transition-colors focus:outline-none min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6 animate-fade-in" /> : <Menu className="w-6 h-6 animate-fade-in" />}
        </button>

        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-3 bg-bg-input border border-border-subtle rounded-xl py-1.5 px-3 shadow-inner">
            <div className="flex items-center space-x-1.5">
              <span className={cn('w-2 h-2 rounded-full', auth.sessionEmail ? 'bg-status-good animate-pulse' : 'bg-status-danger')} />
              <span className="text-sm font-medium text-text-muted">
                {auth.sessionEmail ? t('common.sessionActive', { email: auth.sessionEmail }) : t('common.sessionUnauth')}
              </span>
            </div>
            {!auth.sessionEmail ? (
              <Button variant="primary" size="xs" onClick={auth.handleTriggerLogin} disabled={scraper.isScraping || scraper.isProcessing} className="flex items-center justify-center gap-1">
                <Key className="w-3 h-3" /><span>{t('common.login')}</span>
              </Button>
            ) : (
              <Button variant="secondary" size="xs" onClick={auth.handleTriggerLogin} disabled={scraper.isScraping || scraper.isProcessing} className="flex items-center justify-center gap-1 border-border-subtle">
                <Key className="w-3 h-3 text-brand-accent" /><span>{t('common.reauth')}</span>
              </Button>
            )}
          </div>

          <div className="h-6 w-px bg-border-subtle" />

          <div className="flex items-center gap-3">
            <div className="relative">
              <Button variant="badge" size="sm" onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)} className="px-3 py-1.5 text-sm flex items-center justify-center gap-1.5 border-border-subtle">
                <Globe className="w-3.5 h-3.5 text-text-muted" /><span>{lang.toUpperCase()}</span><ChevronDown className="w-3 h-3 text-text-muted" />
              </Button>
              {isLangDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsLangDropdownOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-24 bg-bg-surface border border-border-subtle rounded-xl shadow-xl z-20 py-1 overflow-hidden animate-fade-in">
                    <button onClick={() => { toggleLanguage(); setIsLangDropdownOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-surface-hover font-medium transition-colors min-h-[44px] flex items-center">
                      {lang === 'en' ? 'DEUTSCH' : 'ENGLISH'}
                    </button>
                  </div>
                </>
              )}
            </div>
            <Button variant="icon" size="sm" onClick={() => { if (view !== 'settings') setView('settings'); }} title={t('common.globalSettings')} className="p-2 border-border-subtle hover:border-brand-accent/30">
              <Settings className="w-4.5 h-4.5 text-text-muted hover:text-brand-accent transition-all duration-300" />
            </Button>
            <Button variant="danger" size="sm" onClick={auth.handleLogout} className="px-3 py-1.5 text-sm flex items-center justify-center gap-1.5 text-center">
              <LogOut className="w-3.5 h-3.5" /><span>{t('auth.logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {isMobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-72 bg-bg-surface border-l border-border-subtle p-6 z-50 flex flex-col gap-6 md:hidden animate-slide-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <span className="font-bold text-base text-text-primary tracking-wide">{t('common.navigation')}</span>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded-lg border border-border-subtle text-text-muted hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 bg-bg-input border border-border-subtle rounded-xl p-3 shadow-inner">
              <div className="flex items-center space-x-1.5">
                <span className={cn('w-2 h-2 rounded-full', auth.sessionEmail ? 'bg-status-good animate-pulse' : 'bg-status-danger')} />
                <span className="text-sm font-medium text-text-muted">
                  {auth.sessionEmail ? t('common.sessionActive', { email: auth.sessionEmail }) : t('common.sessionUnauth')}
                </span>
              </div>
              {!auth.sessionEmail ? (
                <Button variant="primary" size="sm" onClick={() => { auth.handleTriggerLogin(); setIsMobileMenuOpen(false); }} disabled={scraper.isScraping || scraper.isProcessing} className="w-full flex items-center justify-center gap-1.5">
                  <Key className="w-3.5 h-3.5" /><span>{t('common.login')}</span>
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => { auth.handleTriggerLogin(); setIsMobileMenuOpen(false); }} disabled={scraper.isScraping || scraper.isProcessing} className="w-full flex items-center justify-center gap-1.5 border-border-subtle">
                  <Key className="w-3.5 h-3.5 text-brand-accent" /><span>{t('common.reauth')}</span>
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-text-secondary block">{t('common.language')}</span>
              <Button variant="badge" size="sm" onClick={toggleLanguage} className="w-full justify-between px-3 border-border-subtle">
                <span className="flex items-center gap-2"><Globe className="w-4.5 h-4.5 text-text-muted" /><span>{lang === 'en' ? 'ENGLISH' : 'DEUTSCH'}</span></span>
                <span className="text-sm text-brand-accent font-semibold">{t('common.switchTo', { lang: lang === 'en' ? 'DE' : 'EN' })}</span>
              </Button>
            </div>
            <div className="space-y-3 mt-auto">
              <Button variant="secondary" size="sm" onClick={() => { setView('settings'); setIsMobileMenuOpen(false); }} className="w-full justify-start gap-2.5">
                <Settings className="w-4.5 h-4.5 text-text-muted" /><span>{t('common.globalSettings')}</span>
              </Button>
              <Button variant="danger" size="sm" onClick={() => { auth.handleLogout(); setIsMobileMenuOpen(false); }} className="w-full justify-start gap-2.5">
                <LogOut className="w-4 h-4" /><span>{t('auth.logout')}</span>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Main content — one screen component per view */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 flex flex-col justify-start">
        {view === 'landing' && (
          <LandingScreen
            campaigns={appData.campaigns}
            searches={appData.searches}
            listings={appData.listings}
            onOpenCampaign={(c) => {
              const campaignSearches = appData.searches.filter(s => s.campaign_id === c.id);
              navigate(campaignSearches.length === 0 ? 'edit' : 'dashboard', c.id, null);
            }}
            onConfigureCampaign={(c) => {
              const firstTarget = appData.searches.find(s => s.campaign_id === c.id);
              navigate('edit', c.id, firstTarget?.id || null);
            }}
            onDeleteCampaign={campaignEdit.handleDeleteCampaign}
            onCreateCampaign={() => setView('create-campaign')}
          />
        )}

        {view === 'dashboard' && (
          <DashboardScreen
            campaign={currentCampaign}
            searches={appData.searches}
            listings={appData.listings}
            selectedSearchId={selectedSearchId}
            setSelectedSearchId={setSelectedSearchId}
            selectedStatusFilter={selectedStatusFilter}
            setSelectedStatusFilter={setSelectedStatusFilter}
            selectedListingId={selectedListingId}
            setSelectedListingId={setSelectedListingId}
            activeProcessingListingIds={scraper.activeProcessingListingIds}
            handleProcessSingleListing={scraper.handleProcessSingleListing}
            isScraping={scraper.isScraping}
            isProcessing={scraper.isProcessing}
            processingStatus={scraper.processingStatus}
            scrapingStatus={scraper.scrapingStatus}
            scrapingProgress={scraper.scrapingProgress}
            liveLogs={scraper.liveLogs}
            showLogConsole={scraper.showLogConsole}
            setShowLogConsole={scraper.setShowLogConsole}
            onBack={() => navigate('landing', null, null)}
            onConfigure={configureCurrentCampaign}
            onStartScrape={() => scraper.handleStartScrape(currentCampaignId)}
            onStartDeepUpdate={() => scraper.handleStartDeepUpdate(currentCampaignId)}
            onStartProcess={() => scraper.handleStartProcess(currentCampaignId)}
            isRouteOrFamilyMode={isRouteOrFamilyMode}
            onEvaluateWithAi={() => {
              const firstTarget = appData.searches.find(s => s.campaign_id === currentCampaignId);
              navigate('edit', currentCampaignId, firstTarget?.id || null);
            }}
            onEditFamily={() => navigate('edit', currentCampaignId, null)}
          />
        )}

        {view === 'edit' && (
          <EditScreen
            campaign={currentCampaign}
            searches={appData.searches}
            knowledgeSets={appData.knowledgeSets}
            activeSearchTarget={activeSearchTarget}
            campaignRouteData={appData.campaignRouteData}
            loadingRouteData={appData.loadingRouteData}
            geometrySuccessMsg={appData.geometrySuccessMsg}
            newTargetUrl={campaignEdit.newTargetUrl}
            setNewTargetUrl={campaignEdit.setNewTargetUrl}
            searchTargetMode={campaignEdit.searchTargetMode}
            setSearchTargetMode={campaignEdit.setSearchTargetMode}
            routeFrom={campaignEdit.routeFrom}
            setRouteFrom={campaignEdit.setRouteFrom}
            routeTo={campaignEdit.routeTo}
            setRouteTo={campaignEdit.setRouteTo}
            routeRadiusKm={campaignEdit.routeRadiusKm}
            setRouteRadiusKm={campaignEdit.setRouteRadiusKm}
            routeCorridorKm={campaignEdit.routeCorridorKm}
            setRouteCorridorKm={campaignEdit.setRouteCorridorKm}
            routePlanning={campaignEdit.routePlanning}
            routeError={campaignEdit.routeError}
            routeResult={campaignEdit.routeResult}
            marketMemo={guidelines.marketMemo}
            setMarketMemo={guidelines.setMarketMemo}
            sampledListings={guidelines.sampledListings}
            sampledListingsLoading={guidelines.sampledListingsLoading}
            fetchSampleListings={guidelines.fetchSampleListings}
            researcherOutput={guidelines.researcherOutput}
            setResearcherOutput={guidelines.setResearcherOutput}
            researchPromptTemplate={guidelines.researchPromptTemplate}
            marketPromptTemplate={guidelines.marketPromptTemplate}
            profilePromptTemplate={guidelines.profilePromptTemplate}
            editKsError={guidelines.editKsError}
            wizardStep={wizardStep}
            setWizardStep={setWizardStep}
            handleSaveKnowledgeSet={guidelines.handleSaveKnowledgeSet}
            parsedExpertKnowledge={guidelines.parsedExpertKnowledge}
            parsedGoodRef={guidelines.parsedGoodRef}
            parsedBadRef={guidelines.parsedBadRef}
            parsedDemoMsg={guidelines.parsedDemoMsg}
            parsedItemJson={guidelines.parsedItemJson}
            isScraping={scraper.isScraping}
            scrapingStatus={scraper.scrapingStatus}
            scrapingProgress={scraper.scrapingProgress}
            onBack={() => navigate('dashboard', currentCampaignId, null)}
            onAddSearchTarget={campaignEdit.handleAddSearchTarget}
            onDeleteSearch={campaignEdit.handleDeleteSearch}
            onPlanCorridor={campaignEdit.handlePlanCorridor}
            onRemoveRoute={campaignEdit.handleRemoveRoute}
            onUpdateCorridor={campaignEdit.handleUpdateCorridor}
            onSaveFamily={(savedFamily) => {
              if (currentCampaignId) {
                appData.setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, family_id: savedFamily.id } : c));
              }
              appData.refreshAll();
            }}
            isValidKleinanzeigenUrl={isValidKleinanzeigenUrl}
            suggestTitleFromUrl={suggestTitleFromUrl}
            previewLoading={campaignEdit.previewLoading}
            previewCount={campaignEdit.previewCount}
            previewError={campaignEdit.previewError}
            onUpdateCampaignName={campaignEdit.handleUpdateCampaignName}
          />
        )}

        {view === 'create-campaign' && (
          <CreateCampaignScreen
            newCampaignName={campaignEdit.newCampaignName}
            setNewCampaignName={campaignEdit.setNewCampaignName}
            onSave={async () => {
              if (!campaignEdit.newCampaignName.trim()) return;
              const newId = await campaignEdit.handleCreateCampaign();
              if (newId) navigate('edit', newId, null);
            }}
            onCancel={() => setView('landing')}
          />
        )}

        {view === 'settings' && (
          <SettingsView onBack={() => setView(previousView)} />
        )}
      </main>
    </div>
  );
}
