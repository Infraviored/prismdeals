import { useHashRouter } from './hooks/useHashRouter';
import { useAuthSession } from './hooks/useAuthSession';
import { useAppData } from './hooks/useAppData';
import { useScraperControl } from './hooks/useScraperControl';
import { useCampaignEdit } from './hooks/useCampaignEdit';
import AuthScreen from './components/AuthScreen';
import AppScreen from './screens/AppScreen';
import LandingScreen from './screens/LandingScreen';
import FundeScreen from './screens/FundeScreen';
import EditScreen from './screens/EditScreen';
import HuntSetupScreen from './screens/HuntSetupScreen';
import CreateCampaignScreen from './screens/CreateCampaignScreen';
import KeptScreen from './screens/KeptScreen';

export default function App() {
  const {
    view, currentCampaignId,
    previousView, setView, setCurrentCampaignId, setCurrentSearchId,
    navigate,
  } = useHashRouter();



  // --- Scraper / Worker control ---
  const scraper = useScraperControl({
    refreshAll: () => appData.refreshAll(),
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

  const configureCurrentCampaign = () => {
    const firstTarget = appData.searches.find(s => s.campaign_id === currentCampaignId);
    navigate('edit', currentCampaignId, firstTarget?.id || null);
  };

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans">
        <LandingScreen
          campaigns={appData.campaigns}
          searches={appData.searches}
          listings={appData.listings}
          onOpenCampaign={(c) => {
            const campaignSearches = appData.searches.filter(s => s.campaign_id === c.id);
            navigate(campaignSearches.length === 0 ? 'edit' : 'dashboard', c.id, null);
          }}
          onCreateCampaign={() => navigate('hunt-setup', null, null)}
          onOpenKept={() => setView('kept')}
          onOpenApp={() => setView('settings')}
        />
      </div>
    );
  }

  if (view === 'hunt-setup') {
    return (
      <HuntSetupScreen
        onBack={() => navigate('landing', null, null)}
        onSaved={({ campaignId }) => {
          appData.refreshAll();
          navigate('dashboard', campaignId, null);
          scraper.handleStartScrape(campaignId);
        }}
      />
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans">
        <FundeScreen
          campaign={currentCampaign}
          onBack={() => navigate('landing', null, null)}
          onConfigure={configureCurrentCampaign}
          onStartScrape={() => scraper.handleStartScrape(currentCampaignId)}
          isScraping={scraper.isScraping}
          onCampaignChanged={() => appData.refreshAll()}
        />
      </div>
    );
  }

  if (view === 'edit') {
    return (
      <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans">
        <EditScreen
          campaign={currentCampaign}
          searches={appData.searches}
          // Back from setup went to the results of a search that has none yet,
          // which is an empty screen the redirect then bounces you out of. A
          // search with nothing to show sends you home instead.
          onBack={() => {
            const configured =
              appData.searches.some(s => s.campaign_id === currentCampaignId) ||
              !!currentCampaign?.route_id ||
              !!currentCampaign?.family_id;
            if (configured) navigate('dashboard', currentCampaignId, null);
            else navigate('landing', null, null);
          }}
          onSaved={(savedFamily, change) => {
            if (currentCampaignId) {
              appData.setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, family_id: savedFamily.id } : c));
            }
            appData.refreshAll();
            navigate('dashboard', currentCampaignId, null);
            // A changed search is a new question to Kleinanzeigen. Ask it now:
            // waiting for the schedule (which is usually off) left the buyer
            // looking at a list that could not change.
            // Only when something about the search changed; a new name is not
            // worth a crawl.
            if (change?.searchChanged !== false) scraper.handleStartScrape(currentCampaignId);
          }}
          onDelete={(camp) => {
            campaignEdit.handleDeleteCampaign(camp);
            navigate('landing', null, null);
          }}
        />
      </div>
    );
  }

  if (view === 'kept') {
    return <KeptScreen onBack={() => navigate('landing', null, null)} />;
  }

  if (view === 'create-campaign') {
    return (
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
    );
  }

  // Everything that used to live in a 64px header above every screen -- the
  // connection state, the language, the logout -- is one screen now. The bar
  // announced "Not Connected" in red above a list of things to buy, for a
  // state most people think about twice a month.
  return (
    <AppScreen
      onBack={() => setView(previousView)}
      sessionEmail={auth.sessionEmail}
      onConnect={auth.handleTriggerLogin}
      onLogout={auth.handleLogout}
      busy={scraper.isScraping || scraper.isProcessing}
    />
  );
}
