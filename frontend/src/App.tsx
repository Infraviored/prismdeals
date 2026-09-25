import { useHashRouter } from './hooks/useHashRouter';
import { useAuthSession } from './hooks/useAuthSession';
import { useAppData } from './hooks/useAppData';
import { useScraperControl } from './hooks/useScraperControl';
import { useTranslation } from './hooks/useTranslation';
import AuthScreen from './components/AuthScreen';
import AppScreen from './screens/AppScreen';
import LandingScreen from './screens/LandingScreen';
import FundeScreen from './screens/FundeScreen';
import EditScreen from './screens/EditScreen';
import HuntSetupScreen from './screens/HuntSetupScreen';
import KeptScreen from './screens/KeptScreen';

const page = 'min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans';

export default function App() {
  const { t } = useTranslation();
  const { view, currentCampaignId: huntId, previousView, setView, navigate } = useHashRouter();

  const scraper = useScraperControl({ refreshAll: () => appData.refreshAll() });

  const auth = useAuthSession({
    onLoginSuccess: () => appData.refreshAll(),
    setIsScraping: scraper.setIsScraping,
    setScrapingStatus: scraper.setScrapingStatus,
  });

  const appData = useAppData({ appUser: auth.appUser });

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

  const deleteHunt = async (id: number) => {
    const res = await fetch(`/api/hunts/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      window.alert(body?.error || t('landing.deleteFailed'));
      return;
    }
    appData.refreshAll();
    navigate('landing', null, null);
  };

  if (view === 'landing') {
    return (
      <div className={page}>
        <LandingScreen
          hunts={appData.hunts}
          error={appData.error}
          onOpenHunt={(h) => navigate('dashboard', h.id, null)}
          onCreateHunt={() => navigate('hunt-setup', null, null)}
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
        onSaved={(saved) => {
          appData.refreshAll();
          navigate('dashboard', saved.id ?? null, null);
          scraper.handleStartScrape(saved.id ?? null);
        }}
      />
    );
  }

  if (view === 'dashboard') {
    return (
      <div className={page}>
        <FundeScreen
          key={huntId ?? 0}
          huntId={huntId}
          onBack={() => navigate('landing', null, null)}
          onConfigure={() => navigate('edit', huntId, null)}
          onStartScrape={() => scraper.handleStartScrape(huntId)}
          isScraping={scraper.isScraping}
          onCampaignChanged={() => appData.refreshAll()}
        />
      </div>
    );
  }

  if (view === 'edit') {
    return (
      <div className={page}>
        <EditScreen
          key={huntId ?? 0}
          huntId={huntId}
          onBack={() => navigate('dashboard', huntId, null)}
          onSaved={(_stored, searchChanged) => {
            appData.refreshAll();
            navigate('dashboard', huntId, null);
            // A changed search is a new question to Kleinanzeigen: ask it now.
            // A new name or condition is not; the verdicts change on read.
            if (searchChanged) scraper.handleStartScrape(huntId);
          }}
          onDelete={deleteHunt}
        />
      </div>
    );
  }

  if (view === 'kept') {
    return <KeptScreen onBack={() => navigate('landing', null, null)} />;
  }

  return (
    <AppScreen
      onBack={() => setView(previousView)}
      sessionEmail={auth.sessionEmail}
      onConnect={auth.handleTriggerLogin}
      onLogout={auth.handleLogout}
      busy={scraper.isScraping}
    />
  );
}
