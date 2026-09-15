/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react'
import type { Campaign, KnowledgeSet, SearchTarget, Listing, SampleListing } from './types'
import type { RouteCorridorData } from './components/RouteResultsView'
import type { Place } from './components/PlaceInput'
import SettingsView from './components/SettingsView'
import { transformListing } from './utils/listingTransformer'
import { useHashRouter } from './hooks/useHashRouter'
import { Globe, ChevronDown, LogOut, Key, Menu, X, Settings } from 'lucide-react'
import { useTranslation } from './hooks/useTranslation'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { Card } from './components/ui/Card'
import { cn } from './utils/cn'
import LandingScreen from './screens/LandingScreen'
import DashboardScreen from './screens/DashboardScreen'
import EditScreen from './screens/EditScreen'
import CreateCampaignScreen from './screens/CreateCampaignScreen'

const isValidKleinanzeigenUrl = (urlStr: string): boolean => {
  try {
    return new URL(urlStr).hostname.includes('kleinanzeigen.de');
  } catch { return false; }
};

const suggestTitleFromUrl = (urlStr: string): string => {
  try {
    const paths = new URL(urlStr).pathname.split('/');
    const candidate = paths.find(seg => {
      if (!seg || seg.startsWith('s-') || seg.includes(':')) return false;
      if (/^\d+$/.test(seg)) return false;
      if (seg.startsWith('k0') || seg.includes('+') || seg.includes('.')) return false;
      if (['suche', 'kategorie', 'anzeigen'].includes(seg.toLowerCase())) return false;
      return true;
    });
    return candidate ? decodeURIComponent(candidate).replace(/-/g, ' ').trim() : '';
  } catch { return ''; }
};

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

  // --- Data ---
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [searches, setSearches] = useState<SearchTarget[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [knowledgeSets, setKnowledgeSets] = useState<KnowledgeSet[]>([]);

  // --- Auth ---
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [appUser, setAppUser] = useState<{ email: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- Scraper / Processing ---
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStatus, setScrapingStatus] = useState('');
  const [scrapingProgress, setScrapingProgress] = useState<{ phase: string; current: number; total: number; status: string } | null>(null);
  const [liveLogs, setLiveLogs] = useState('');
  const [showLogConsole, setShowLogConsole] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [activeProcessingListingIds, setActiveProcessingListingIds] = useState<string[]>([]);

  // --- Dashboard filters ---
  const [selectedSearchId, setSelectedSearchId] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'High Niceness' | 'New' | 'Evaluate with AI'>('All');

  // --- Edit screen form state ---
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [searchTargetMode, setSearchTargetMode] = useState<'point' | 'route' | 'family'>('point');
  const [routeFrom, setRouteFrom] = useState<Place | null>(null);
  const [routeTo, setRouteTo] = useState<Place | null>(null);
  const [routeRadiusKm, setRouteRadiusKm] = useState(30);
  const [routeCorridorKm, setRouteCorridorKm] = useState(15);
  const [routePlanning, setRoutePlanning] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{ count: number; width: number } | null>(null);
  const [campaignRouteData, setCampaignRouteData] = useState<RouteCorridorData | null>(null);
  const [loadingRouteData, setLoadingRouteData] = useState(false);
  const [geometrySuccessMsg, setGeometrySuccessMsg] = useState<string | null>(null);
  const [isRegisteringTarget, setIsRegisteringTarget] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // --- Guidelines wizard state ---
  const [currentKnowledgeSetId, setCurrentKnowledgeSetId] = useState<number | null>(null);
  const [editKsName, setEditKsName] = useState('');
  const [editKsError, setEditKsError] = useState('');
  const [marketMemo, setMarketMemo] = useState('');
  const [sampledListings, setSampledListings] = useState<SampleListing[]>([]);
  const [sampledListingsLoading, setSampledListingsLoading] = useState(false);
  const [researcherOutput, setResearcherOutput] = useState('');
  const [researchPromptTemplate, setResearchPromptTemplate] = useState('');
  const [marketPromptTemplate, setMarketPromptTemplate] = useState('');
  const [profilePromptTemplate, setProfilePromptTemplate] = useState('');
  const [parsedExpertKnowledge, setParsedExpertKnowledge] = useState('');
  const [parsedGoodRef, setParsedGoodRef] = useState('');
  const [parsedBadRef, setParsedBadRef] = useState('');
  const [parsedDemoMsg, setParsedDemoMsg] = useState('');
  const [parsedItemJson, setParsedItemJson] = useState('');

  const activeSearches = searches.filter(s => s.campaign_id === currentCampaignId);
  const activeSearchTarget = searches.find(s => s.id === currentSearchId) || activeSearches[0];

  // =========================================================================
  // Data helpers
  // =========================================================================

  const refreshAll = useCallback(() => {
    Promise.all([
      fetch('/api/campaigns').then(r => r.json()),
      fetch('/api/search-urls').then(r => r.json()),
      fetch('/api/listings').then(r => r.json()),
      fetch('/api/knowledge-sets').then(r => r.json()),
      fetch('/api/search-families').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([campaignsData, searchesData, listingsData, ksData, familiesData]) => {
      const familyMap = new Map<number, number>();
      if (Array.isArray(familiesData)) {
        for (const fam of familiesData) {
          if (fam.campaign_id && fam.id) familyMap.set(fam.campaign_id, fam.id);
        }
      }
      setCampaigns(prev => {
        const prevFamilyMap = new Map(prev.map(c => [c.id, c.family_id]));
        return campaignsData.map((c: Campaign) => ({
          ...c,
          family_id: c.family_id ?? familyMap.get(c.id) ?? prevFamilyMap.get(c.id),
        }));
      });
      setSearches(searchesData);
      setKnowledgeSets(ksData);
      setListings(listingsData.map((l: Listing) => transformListing(l, searchesData, ksData)));
      if (campaignsData.length > 0 && currentCampaignId === null) {
        setCurrentCampaignId(campaignsData[0].id);
      }
    }).catch(err => console.error('Error refreshing:', err));
  }, [currentCampaignId, setCurrentCampaignId]);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) { const d = await res.json(); setAppUser(d.user || null); return d.user; }
      else setAppUser(null);
    } catch { setAppUser(null); }
    finally { setAuthLoading(false); }
    return null;
  }, []);

  const checkSessionStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/session-status');
      if (res.ok) { const d = await res.json(); setSessionEmail(d.email || null); }
    } catch { /* silent */ }
  }, []);

  const fetchSampleListings = useCallback(async (searchId: number) => {
    setSampledListingsLoading(true);
    try {
      const r = await fetch(`/api/searches/${searchId}/sample-listings`);
      if (r.ok) setSampledListings(await r.json());
      else alert('Failed to fetch sample listings from server.');
    } catch { alert('Error contacting the backend to fetch listings.'); }
    finally { setSampledListingsLoading(false); }
  }, []);

  // =========================================================================
  // Effects
  // =========================================================================

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (!appUser) return;
    refreshAll();
    checkSessionStatus();
    const i = setInterval(checkSessionStatus, 8000);
    return () => clearInterval(i);
  }, [appUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentCampaignId && view === 'dashboard') {
      const campaignSearches = searches.filter(s => s.campaign_id === currentCampaignId);
      if (campaignSearches.length === 0) navigate('edit', currentCampaignId, null);
    }
  }, [currentCampaignId, searches, view, navigate]);

  useEffect(() => {
    if (!currentCampaignId) { setCampaignRouteData(null); return; }
    const c = campaigns.find(c => c.id === currentCampaignId);
    if (!c?.route_id) { setCampaignRouteData(null); return; }
    setLoadingRouteData(true);
    fetch(`/api/campaigns/${currentCampaignId}/route`)
      .then(r => r.ok ? r.json() : null)
      .then(setCampaignRouteData)
      .catch(e => console.error('Failed to fetch campaign route:', e))
      .finally(() => setLoadingRouteData(false));
  }, [currentCampaignId, campaigns]);

  useEffect(() => {
    if (!currentCampaignId) return;
    const c = campaigns.find(c => c.id === currentCampaignId);
    if (c && !c.family_id && !c.route_id) {
      fetch(`/api/search-families?campaign_id=${currentCampaignId}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          if (Array.isArray(data) && data.length > 0 && data[0].id) {
            setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, family_id: data[0].id } : c));
          }
        }).catch(() => {});
    }
  }, [currentCampaignId, campaigns]);

  useEffect(() => {
    if (!appUser) return;
    fetch('/api/prompts/research').then(r => r.ok ? r.text() : '').then(setResearchPromptTemplate).catch(console.error);
    fetch('/api/prompts/market').then(r => r.ok ? r.text() : '').then(setMarketPromptTemplate).catch(console.error);
    fetch('/api/prompts/profile').then(r => r.ok ? r.text() : '').then(setProfilePromptTemplate).catch(console.error);
  }, [appUser]);

  useEffect(() => {
    const ekM = researcherOutput.match(/<expert_knowledge>([\s\S]*?)<\/expert_knowledge>/i);
    setParsedExpertKnowledge(ekM ? ekM[1].trim() : '');
    const grM = researcherOutput.match(/<good_reference_description>([\s\S]*?)<\/good_reference_description>/i);
    setParsedGoodRef(grM ? grM[1].trim() : '');
    const brM = researcherOutput.match(/<bad_reference_description>([\s\S]*?)<\/bad_reference_description>/i);
    setParsedBadRef(brM ? brM[1].trim() : '');
    const dmM = researcherOutput.match(/<demo_message>([\s\S]*?)<\/demo_message>/i);
    setParsedDemoMsg(dmM ? dmM[1].trim() : '');
    const ijM = researcherOutput.match(/<item_json>([\s\S]*?)<\/item_json>/i);
    setParsedItemJson(ijM ? ijM[1].trim() : '');
  }, [researcherOutput]);

  useEffect(() => {
    if (activeSearchTarget?.knowledge_set_id) {
      const ks = knowledgeSets.find(k => k.id === activeSearchTarget.knowledge_set_id);
      if (ks) {
        setCurrentKnowledgeSetId(ks.id || null);
        setEditKsName(ks.name);
        setMarketMemo(ks.market_memo || '');
        let samples: SampleListing[] = [];
        if (ks.market_samples_json) {
          try { samples = typeof ks.market_samples_json === 'string' ? JSON.parse(ks.market_samples_json) : ks.market_samples_json; } catch { /* empty */ }
        }
        setSampledListings(samples);
        let raw = '';
        if (ks.expert_knowledge) raw += `<expert_knowledge>\n${ks.expert_knowledge}\n</expert_knowledge>\n\n`;
        if (ks.good_reference_description) raw += `<good_reference_description>\n${ks.good_reference_description}\n</good_reference_description>\n\n`;
        if (ks.bad_reference_description) raw += `<bad_reference_description>\n${ks.bad_reference_description}\n</bad_reference_description>\n\n`;
        if (ks.item_json) {
          const s = typeof ks.item_json === 'string' ? ks.item_json : JSON.stringify(ks.item_json, null, 2);
          raw += `<item_json>\n${s}\n</item_json>`;
        }
        setResearcherOutput(raw.trim());
        setEditKsError('');
        if (ks.market_memo && ks.good_reference_description) setWizardStep(3);
        else if (ks.market_memo) setWizardStep(2);
        else setWizardStep(1);
      }
    } else {
      setCurrentKnowledgeSetId(null); setEditKsName(''); setMarketMemo('');
      setSampledListings([]); setResearcherOutput(''); setEditKsError(''); setWizardStep(1);
    }
  }, [activeSearchTarget, searches, knowledgeSets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scraper polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/scrape/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.active) {
          setIsScraping(true);
          setScrapingProgress(data.progress);
          if (data.progress?.status) setScrapingStatus(data.progress.status);
          const logsRes = await fetch('/api/logs');
          if (logsRes.ok) { const d = await logsRes.json(); setLiveLogs(d.logs || ''); }
        } else if (isScraping) {
          setIsScraping(false); setScrapingProgress(null); setScrapingStatus('Scraping completed!');
          refreshAll();
          if (activeSearchTarget?.id) fetchSampleListings(activeSearchTarget.id);
        }
      } catch { /* silent */ }
    };
    check();
    const id = setInterval(check, 1500);
    return () => clearInterval(id);
  }, [isScraping, activeSearchTarget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI processing polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/process/active');
        if (!res.ok) return;
        const data = await res.json();
        setActiveProcessingListingIds(prev => {
          const finished = prev.filter(id => !data.active.includes(id));
          if (finished.length > 0) refreshAll();
          return data.active;
        });
      } catch { /* silent */ }
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // URL preview debounce
  useEffect(() => {
    if (searchTargetMode === 'family' || campaigns.find(c => c.id === currentCampaignId)?.route_id) return;
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl)) return;
    const campaignSearches = searches.filter(s => s.campaign_id === currentCampaignId);
    if (!(campaignSearches.length === 0 || isRegisteringTarget)) return;
    const timer = setTimeout(async () => {
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';
      setPreviewLoading(true); setPreviewError(null); setPreviewCount(null);
      try {
        const countRes = await fetch('/api/searches/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: newTargetUrl }) });
        if (countRes.ok) { const d = await countRes.json(); setPreviewCount(d.count); }
        const ksRes = await fetch('/api/knowledge-sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${suggested} Guidelines`, expert_knowledge: '', item_json: {} }) });
        const boundKsId = ksRes.ok ? (await ksRes.json()).id : null;
        const searchRes = await fetch('/api/searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: currentCampaignId, name: suggested, url: newTargetUrl, knowledge_set_id: boundKsId }) });
        if (searchRes.ok) {
          const sd = await searchRes.json();
          setNewTargetUrl(''); setPreviewCount(null); setIsRegisteringTarget(false);
          setCurrentSearchId(sd.id);
          setIsScraping(true); setScrapingStatus('Spawning targeted crawler...'); setLiveLogs('Starting targeted Chrome headless scraper session...'); setScrapingProgress({ phase: 'starting', current: 0, total: 100, status: 'Spawning scraper worker...' });
          await fetch(`/api/searches/${sd.id}/scrape`, { method: 'POST' });
          refreshAll();
        } else { const e = await searchRes.json(); setPreviewError(e.error || 'Failed to auto-register search target.'); }
      } catch { setPreviewError('Failed to auto-register search query due to connection issues.'); }
      finally { setPreviewLoading(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [newTargetUrl, currentCampaignId, searches, isRegisteringTarget, searchTargetMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) { setLoginError('Please enter email and password.'); return; }
    setIsLoggingIn(true); setLoginError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      const data = await res.json();
      if (res.ok && data.success) { setAppUser(data.user); refreshAll(); checkSessionStatus(); }
      else setLoginError(data.error || t('auth.errorInvalid'));
    } catch { setLoginError('Network connection failed.'); }
    finally { setIsLoggingIn(false); }
  };

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); setAppUser(null); }
    catch (e) { console.error('Logout failed:', e); }
  };

  const handleTriggerLogin = async () => {
    setIsScraping(true); setScrapingStatus('Opening interactive browser window on your host...');
    try {
      const res = await fetch('/api/login-session', { method: 'POST' });
      if (res.ok) { const d = await res.json(); setScrapingStatus(d.success ? 'Authentication completed successfully!' : 'Session watcher finished or timed out.'); checkSessionStatus(); }
      else setScrapingStatus('Authentication process failed to trigger.');
    } catch { setScrapingStatus('Error connecting to backend server.'); }
    finally { setIsScraping(false); }
  };

  const handleDeleteCampaign = useCallback(async (c: Campaign) => {
    const campaignSearches = searches.filter(s => s.campaign_id === c.id);
    const campaignListings = listings.filter(l => { const s = searches.find(x => x.id === l.search_id); return s && s.campaign_id === c.id; });
    const contents = [
      campaignSearches.length ? t('landing.deleteSearches', { count: campaignSearches.length }) : null,
      campaignListings.length ? t('landing.deleteListings', { count: campaignListings.length }) : null,
    ].filter(Boolean).join(', ');
    const message = contents ? t('landing.deleteConfirmWithContents', { name: c.name, contents }) : t('landing.deleteConfirm', { name: c.name });
    if (!window.confirm(message)) return;
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || t('landing.deleteFailed')); return; }
      refreshAll();
    } catch { alert(t('common.connectionIssueFailed')); }
  }, [searches, listings, t, refreshAll]);

  const handleCreateCampaign = async (): Promise<number | null> => {
    if (!newCampaignName.trim()) return null;
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCampaignName }) });
      const data = await res.json();
      if (res.ok) { setNewCampaignName(''); refreshAll(); return data.id; }
      else alert(data.error || 'Failed to create campaign.');
    } catch { alert('Failed to connect to backend server.'); }
    return null;
  };

  const handleUpdateCampaignName = async (name: string) => {
    if (!currentCampaignId) return;
    const previous = campaigns.find(c => c.id === currentCampaignId)?.name;
    setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, name } : c));
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: currentCampaignId, name }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setCampaigns(prev => prev.map(c => c.id === currentCampaignId && previous ? { ...c, name: previous } : c)); alert(d.error || t('landing.renameFailed')); }
    } catch { setCampaigns(prev => prev.map(c => c.id === currentCampaignId && previous ? { ...c, name: previous } : c)); alert(t('common.connectionIssueFailed')); }
  };

  const handleAddSearchTarget = useCallback(async () => {
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl) || !currentCampaignId) return;
    try {
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';
      const ksRes = await fetch('/api/knowledge-sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${suggested} Guidelines`, expert_knowledge: '', item_json: {} }) });
      const boundKsId = ksRes.ok ? (await ksRes.json()).id : null;
      const searchRes = await fetch('/api/searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: currentCampaignId, name: suggested, url: newTargetUrl, knowledge_set_id: boundKsId }) });
      if (searchRes.ok) { const sd = await searchRes.json(); setNewTargetUrl(''); setCurrentSearchId(sd.id); refreshAll(); }
    } catch (e) { console.error('Failed to add search target:', e); }
  }, [newTargetUrl, currentCampaignId, refreshAll, setCurrentSearchId]);

  const handleDeleteSearch = async (searchId: number) => {
    try {
      const res = await fetch(`/api/searches/${searchId}`, { method: 'DELETE' });
      if (res.ok) { setSearches(prev => prev.filter(s => s.id !== searchId)); refreshAll(); }
    } catch (e) { console.error('Failed to delete search:', e); }
  };

  const handlePlanCorridor = useCallback(async () => {
    if (!newTargetUrl || !isValidKleinanzeigenUrl(newTargetUrl)) { setRouteError(t('common.routeNeedsUrl')); return; }
    if (!routeFrom || !routeTo) { setRouteError(t('common.routeNeedsBoth')); return; }
    setRoutePlanning(true); setRouteError(null); setRouteResult(null);
    try {
      const suggested = suggestTitleFromUrl(newTargetUrl) || 'New Search';
      const ksRes = await fetch('/api/knowledge-sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${suggested} Guidelines`, expert_knowledge: '', item_json: {} }) });
      const boundKsId = ksRes.ok ? (await ksRes.json()).id : null;
      const res = await fetch('/api/route-searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: currentCampaignId, base_url: newTargetUrl, origin: routeFrom.postal_code, destination: routeTo.postal_code, radius_km: routeRadiusKm, corridor_km: routeCorridorKm, knowledge_set_id: boundKsId, name: `${suggested}: ${routeFrom.name} → ${routeTo.name}` }) });
      const data = await res.json();
      if (!res.ok) { setRouteError(data.error || t('common.targetRegistrationFailed')); return; }
      setRouteResult({ count: (data.searches || []).length, width: (data.corridor_km || routeCorridorKm) * 2 });
      setNewTargetUrl(''); setRouteFrom(null); setRouteTo(null); setIsRegisteringTarget(false);
      if (data.searches?.length) setCurrentSearchId(data.searches[0].id);
      if (data.route_id && currentCampaignId) setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, route_id: data.route_id } : c));
      refreshAll();
    } catch { setRouteError(t('common.connectionIssueFailed')); }
    finally { setRoutePlanning(false); }
  }, [newTargetUrl, routeFrom, routeTo, routeRadiusKm, routeCorridorKm, currentCampaignId, t, setCurrentSearchId, refreshAll]);

  const handleRemoveRoute = async () => {
    if (!currentCampaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${currentCampaignId}/route`, { method: 'DELETE' });
      if (res.ok) { setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, route_id: null } : c)); setCampaignRouteData(null); setRouteResult(null); setGeometrySuccessMsg(t('campaignSettings.routeRemovedSuccess')); setTimeout(() => setGeometrySuccessMsg(null), 4000); refreshAll(); }
    } catch (e) { console.error('Failed to remove route:', e); }
  };

  const handleUpdateCorridor = useCallback(async (newRadiusKm: number, newCorridorKm: number) => {
    if (!campaignRouteData?.route?.id) return;
    try {
      const res = await fetch(`/api/route-searches/${campaignRouteData.route.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radius_km: newRadiusKm, corridor_km: newCorridorKm }) });
      if (res.ok) { setCampaignRouteData(await res.json()); setGeometrySuccessMsg(t('searchFamily.savedSuccess')); setTimeout(() => setGeometrySuccessMsg(null), 4000); }
    } catch (e) { console.error('Failed to update corridor:', e); }
  }, [campaignRouteData, t]);

  const handleProcessSingleListing = async (listingId: string) => {
    setActiveProcessingListingIds(prev => Array.from(new Set([...prev, listingId])));
    try {
      const res = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listing_id: listingId }) });
      if (!res.ok && res.status !== 409) { alert('Failed to run AI agent for this listing.'); setActiveProcessingListingIds(prev => prev.filter(id => id !== listingId)); }
    } catch { alert('Error contacting backend AI worker.'); setActiveProcessingListingIds(prev => prev.filter(id => id !== listingId)); }
  };

  const handleSaveKnowledgeSet = async () => {
    if (!editKsName.trim()) { alert('Please enter a name for the Guidelines Profile.'); return; }
    let parsedJson: Record<string, unknown> = {};
    if (parsedItemJson.trim()) {
      try { parsedJson = JSON.parse(parsedItemJson); } catch (e) { setEditKsError(`Invalid JSON syntax in <item_json>: ${(e as Error).message}`); return; }
    }
    const criteria = (parsedJson.extraction_criteria as { id: string; type: string }[]) || [];
    for (const c of criteria) {
      if (c.type !== 'boolean') { setEditKsError(`Criteria types must be boolean only. Criterion '${c.id}' has type '${c.type}'.`); return; }
    }
    try {
      const res = await fetch('/api/knowledge-sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: currentKnowledgeSetId || undefined, name: editKsName, expert_knowledge: parsedExpertKnowledge, item_json: parsedJson, market_memo: marketMemo, good_reference_description: parsedGoodRef, bad_reference_description: parsedBadRef, market_samples_json: JSON.stringify(sampledListings), source_search_url: activeSearchTarget?.url || '', sample_timestamp: new Date().toISOString() }) });
      if (res.ok) { setEditKsError(''); refreshAll(); setView('dashboard'); }
      else { const d = await res.json(); setEditKsError(d.error || 'Failed to save guidelines profile.'); }
    } catch { setEditKsError('Connection to backend server failed.'); }
  };

  const handleStartScrape = async () => {
    setIsScraping(true); setScrapingStatus('Spawning scraper worker...'); setLiveLogs('Initializing browser context and logging session...'); setScrapingProgress({ phase: 'starting', current: 0, total: 100, status: 'Spawning scraper worker...' });
    try { const res = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: currentCampaignId }) }); if (!res.ok) { alert('Failed to start scraper.'); setIsScraping(false); } }
    catch { alert('Error triggering scraper process.'); setIsScraping(false); }
  };

  const handleStartDeepUpdate = async () => {
    setIsScraping(true); setScrapingStatus('Spawning deep update worker...'); setLiveLogs('Initializing browser context for deep listing harvesting...'); setScrapingProgress({ phase: 'starting', current: 0, total: 100, status: 'Spawning deep update worker...' });
    try { const res = await fetch('/api/scrape/update-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: currentCampaignId }) }); if (!res.ok) { alert('Failed to start deep update.'); setIsScraping(false); } }
    catch { alert('Error triggering deep update process.'); setIsScraping(false); }
  };

  const handleStartProcess = async () => {
    setIsProcessing(true); setProcessingStatus('Launching AI Matcher checklist evaluation and deal scoring...');
    try {
      const res = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: currentCampaignId }) });
      if (res.ok) { setProcessingStatus('AI matching completed! Updating Deal Matcher results...'); setTimeout(() => { refreshAll(); setIsProcessing(false); }, 4000); }
      else { alert('Failed to launch AI Matcher.'); setIsProcessing(false); }
    } catch { alert('Error contacting AI Matching backend.'); setIsProcessing(false); }
  };

  // =========================================================================
  // Auth screens (pre-login)
  // =========================================================================

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-primary flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-text-secondary text-sm font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="min-h-screen bg-brand-primary flex items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="w-full max-w-md space-y-6 z-10">
          <div className="text-center">
            <img src={`${import.meta.env.BASE_URL}logo-default.svg`} alt="prismdeals Logo" className="w-64 h-auto mx-auto" />
          </div>
          <Card className="p-6 space-y-4">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm text-text-secondary font-medium block">{t('auth.emailLabel')}</label>
                <Input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-text-secondary font-medium block">{t('auth.passwordLabel')}</label>
                <Input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} required />
              </div>
              {loginError && <div className="bg-status-danger/10 border border-status-danger/25 p-3 rounded-xl text-sm text-status-danger font-semibold animate-fadeIn">{loginError}</div>}
              <Button type="submit" variant="primary" disabled={isLoggingIn} className="w-full py-3">
                {isLoggingIn ? t('auth.buttonLoggingIn') : t('auth.buttonLogin')}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Shared campaign & nav config
  // =========================================================================

  const currentCampaign = campaigns.find(c => c.id === currentCampaignId);
  const isRouteOrFamilyMode = !!(currentCampaign?.route_id || currentCampaign?.family_id);

  const configureCurrentCampaign = () => {
    const firstTarget = searches.find(s => s.campaign_id === currentCampaignId);
    navigate('edit', currentCampaignId, firstTarget?.id || null);
  };

  // =========================================================================
  // Main layout
  // =========================================================================

  return (
    <div className="min-h-screen bg-brand-primary text-text-primary flex flex-col font-sans">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="h-16 border-b border-border-subtle bg-bg-surface/60 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('landing', null, null)}>
          <img src={`${import.meta.env.BASE_URL}logo-icon.svg`} alt="prismdeals Icon" className="w-8 h-8 rounded-lg shadow shadow-black/30" />
          {/* eslint-disable-next-line no-restricted-syntax -- product name */}
          <span className="font-bold text-xl tracking-wide text-white font-sans">prismdeals</span>
        </div>

        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-text-muted hover:text-white transition-colors focus:outline-none min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Toggle menu">
          {isMobileMenuOpen ? <X className="w-6 h-6 animate-fade-in" /> : <Menu className="w-6 h-6 animate-fade-in" />}
        </button>

        <div className="hidden md:flex items-center gap-4">
          {/* Scraper session status */}
          <div className="flex items-center gap-3 bg-bg-input border border-border-subtle rounded-xl py-1.5 px-3 shadow-inner">
            <div className="flex items-center space-x-1.5">
              <span className={cn('w-2 h-2 rounded-full', sessionEmail ? 'bg-status-good animate-pulse' : 'bg-status-danger')} />
              <span className="text-sm font-medium text-text-muted">{sessionEmail ? t('common.sessionActive', { email: sessionEmail }) : t('common.sessionUnauth')}</span>
            </div>
            {!sessionEmail ? (
              <Button variant="primary" size="xs" onClick={handleTriggerLogin} disabled={isScraping || isProcessing} className="flex items-center justify-center gap-1"><Key className="w-3 h-3" /><span>{t('common.login')}</span></Button>
            ) : (
              <Button variant="secondary" size="xs" onClick={handleTriggerLogin} disabled={isScraping || isProcessing} className="flex items-center justify-center gap-1 border-border-subtle"><Key className="w-3 h-3 text-brand-accent" /><span>{t('common.reauth')}</span></Button>
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
            <Button variant="danger" size="sm" onClick={handleLogout} className="px-3 py-1.5 text-sm flex items-center justify-center gap-1.5 text-center">
              <LogOut className="w-3.5 h-3.5" /><span>{t('auth.logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile navigation drawer                                            */}
      {/* ------------------------------------------------------------------ */}
      {isMobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-72 bg-bg-surface border-l border-border-subtle p-6 z-50 flex flex-col gap-6 md:hidden animate-slide-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <span className="font-bold text-base text-text-primary tracking-wide">{t('common.navigation')}</span>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded-lg border border-border-subtle text-text-muted hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col gap-3 bg-bg-input border border-border-subtle rounded-xl p-3 shadow-inner">
              <div className="flex items-center space-x-1.5">
                <span className={cn('w-2 h-2 rounded-full', sessionEmail ? 'bg-status-good animate-pulse' : 'bg-status-danger')} />
                <span className="text-sm font-medium text-text-muted">{sessionEmail ? t('common.sessionActive', { email: sessionEmail }) : t('common.sessionUnauth')}</span>
              </div>
              {!sessionEmail ? (
                <Button variant="primary" size="sm" onClick={() => { handleTriggerLogin(); setIsMobileMenuOpen(false); }} disabled={isScraping || isProcessing} className="w-full flex items-center justify-center gap-1.5"><Key className="w-3.5 h-3.5" /><span>{t('common.login')}</span></Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => { handleTriggerLogin(); setIsMobileMenuOpen(false); }} disabled={isScraping || isProcessing} className="w-full flex items-center justify-center gap-1.5 border-border-subtle"><Key className="w-3.5 h-3.5 text-brand-accent" /><span>{t('common.reauth')}</span></Button>
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
              <Button variant="secondary" size="sm" onClick={() => { setView('settings'); setIsMobileMenuOpen(false); }} className="w-full justify-start gap-2.5"><Settings className="w-4.5 h-4.5 text-text-muted" /><span>{t('common.globalSettings')}</span></Button>
              <Button variant="danger" size="sm" onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="w-full justify-start gap-2.5"><LogOut className="w-4 h-4" /><span>{t('auth.logout')}</span></Button>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main content — one screen component per view                        */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 flex flex-col justify-start">
        {view === 'landing' && (
          <LandingScreen
            campaigns={campaigns}
            searches={searches}
            listings={listings}
            onOpenCampaign={(c) => {
              const campaignSearches = searches.filter(s => s.campaign_id === c.id);
              navigate(campaignSearches.length === 0 ? 'edit' : 'dashboard', c.id, null);
            }}
            onConfigureCampaign={(c) => {
              const firstTarget = searches.find(s => s.campaign_id === c.id);
              navigate('edit', c.id, firstTarget?.id || null);
            }}
            onDeleteCampaign={handleDeleteCampaign}
            onCreateCampaign={() => setView('create-campaign')}
          />
        )}

        {view === 'dashboard' && (
          <DashboardScreen
            campaign={currentCampaign}
            searches={searches}
            listings={listings}
            selectedSearchId={selectedSearchId}
            setSelectedSearchId={setSelectedSearchId}
            selectedStatusFilter={selectedStatusFilter}
            setSelectedStatusFilter={setSelectedStatusFilter}
            selectedListingId={selectedListingId}
            setSelectedListingId={setSelectedListingId}
            activeProcessingListingIds={activeProcessingListingIds}
            handleProcessSingleListing={handleProcessSingleListing}
            isScraping={isScraping}
            isProcessing={isProcessing}
            processingStatus={processingStatus}
            scrapingStatus={scrapingStatus}
            scrapingProgress={scrapingProgress}
            liveLogs={liveLogs}
            showLogConsole={showLogConsole}
            setShowLogConsole={setShowLogConsole}
            onBack={() => navigate('landing', null, null)}
            onConfigure={configureCurrentCampaign}
            onStartScrape={handleStartScrape}
            onStartDeepUpdate={handleStartDeepUpdate}
            onStartProcess={handleStartProcess}
            isRouteOrFamilyMode={isRouteOrFamilyMode}
            onEvaluateWithAi={() => {
              const firstTarget = searches.find(s => s.campaign_id === currentCampaignId);
              navigate('edit', currentCampaignId, firstTarget?.id || null);
            }}
            onEditFamily={() => navigate('edit', currentCampaignId, null)}
          />
        )}

        {view === 'edit' && (
          <EditScreen
            campaign={currentCampaign}
            searches={searches}
            knowledgeSets={knowledgeSets}
            activeSearchTarget={activeSearchTarget}
            campaignRouteData={campaignRouteData}
            loadingRouteData={loadingRouteData}
            geometrySuccessMsg={geometrySuccessMsg}
            newTargetUrl={newTargetUrl}
            setNewTargetUrl={setNewTargetUrl}
            searchTargetMode={searchTargetMode}
            setSearchTargetMode={setSearchTargetMode}
            routeFrom={routeFrom}
            setRouteFrom={setRouteFrom}
            routeTo={routeTo}
            setRouteTo={setRouteTo}
            routeRadiusKm={routeRadiusKm}
            setRouteRadiusKm={setRouteRadiusKm}
            routeCorridorKm={routeCorridorKm}
            setRouteCorridorKm={setRouteCorridorKm}
            routePlanning={routePlanning}
            routeError={routeError}
            routeResult={routeResult}
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
            onBack={() => navigate('dashboard', currentCampaignId, null)}
            onAddSearchTarget={handleAddSearchTarget}
            onDeleteSearch={handleDeleteSearch}
            onPlanCorridor={handlePlanCorridor}
            onRemoveRoute={handleRemoveRoute}
            onUpdateCorridor={handleUpdateCorridor}
            onSaveFamily={(savedFamily) => {
              if (currentCampaignId) setCampaigns(prev => prev.map(c => c.id === currentCampaignId ? { ...c, family_id: savedFamily.id } : c));
              refreshAll();
            }}
            isValidKleinanzeigenUrl={isValidKleinanzeigenUrl}
            suggestTitleFromUrl={suggestTitleFromUrl}
            previewLoading={previewLoading}
            previewCount={previewCount}
            previewError={previewError}
            onUpdateCampaignName={handleUpdateCampaignName}
          />
        )}

        {view === 'create-campaign' && (
          <CreateCampaignScreen
            newCampaignName={newCampaignName}
            setNewCampaignName={setNewCampaignName}
            onSave={async () => {
              if (!newCampaignName.trim()) return;
              const newId = await handleCreateCampaign();
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
