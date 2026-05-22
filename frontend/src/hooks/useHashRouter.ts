import { useState, useEffect, useCallback } from 'react';

export type ViewState = 'landing' | 'dashboard' | 'edit' | 'create-campaign' | 'settings';

export interface RouteState {
  view: ViewState;
  campaignId: number | null;
  searchId: number | null;
  listingId: string | null;
  step: 1 | 2 | 3;
}

const parseHash = (hashStr: string): RouteState => {
  const hash = hashStr || '#landing';
  const match = hash.match(/^#([^?]+)(?:\?(.+))?$/);
  if (!match) return { view: 'landing', campaignId: null, searchId: null, listingId: null, step: 1 };
  const path = match[1];
  const queryParams = new URLSearchParams(match[2] || '');

  if (['landing', 'dashboard', 'edit', 'create-campaign', 'settings'].includes(path)) {
    const view = path as ViewState;
    const campaignIdStr = queryParams.get('campaignId');
    const campaignId = campaignIdStr ? parseInt(campaignIdStr, 10) : null;
    const searchIdStr = queryParams.get('searchId');
    const searchId = searchIdStr ? parseInt(searchIdStr, 10) : null;
    const listingId = queryParams.get('listingId');
    const stepStr = queryParams.get('step');
    let step: 1 | 2 | 3 = 1;
    if (stepStr === '2') step = 2;
    else if (stepStr === '3') step = 3;

    return {
      view,
      campaignId: campaignId && !isNaN(campaignId) ? campaignId : null,
      searchId: searchId && !isNaN(searchId) ? searchId : null,
      listingId: listingId || null,
      step,
    };
  }
  return { view: 'landing', campaignId: null, searchId: null, listingId: null, step: 1 };
};

/**
 * Custom React hook that coordinates state across view navigation, campaign tracking,
 * listing drawers, and step-wizard stages with browser navigation history (hash routing).
 */
export function useHashRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseHash(window.location.hash));
  const [previousView, setPreviousView] = useState<Exclude<ViewState, 'settings'>>('landing');

  // Unified update logic that avoids layout thrashing or recursive effect triggers
  const updateHash = useCallback((
    view: ViewState,
    campaignId: number | null,
    searchId: number | null,
    listingId: string | null,
    step: 1 | 2 | 3
  ) => {
    let hash = `#${view}`;
    const params = new URLSearchParams();
    if (campaignId !== null) params.set('campaignId', campaignId.toString());
    if (searchId !== null) params.set('searchId', searchId.toString());
    if (listingId !== null) params.set('listingId', listingId);
    if (step !== 1) params.set('step', step.toString());

    const paramStr = params.toString();
    if (paramStr) {
      hash += `?${paramStr}`;
    }

    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  // Listen to browser back/forward history transitions (hashchange event)
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseHash(window.location.hash);
      setRoute((prev) => {
        // Track the previous view before settings for backward pathing compatibility
        if (parsed.view === 'settings') {
          if (prev.view !== 'settings') {
            setPreviousView(prev.view as Exclude<ViewState, 'settings'>);
          }
        }
        return parsed;
      });
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Expose state mutators that automatically synchronize back into the URL hash
  const navigate = useCallback((
    newView: ViewState,
    newCampaignId: number | null = route.campaignId,
    newSearchId: number | null = route.searchId,
    newListingId: string | null = route.listingId,
    newStep: 1 | 2 | 3 = route.step
  ) => {
    if (newView === 'settings') {
      if (route.view !== 'settings') {
        setPreviousView(route.view as Exclude<ViewState, 'settings'>);
      }
    }

    const nextRoute = {
      view: newView,
      campaignId: newCampaignId,
      searchId: newSearchId,
      listingId: newListingId,
      step: newStep,
    };

    setRoute(nextRoute);
    updateHash(newView, newCampaignId, newSearchId, newListingId, newStep);
  }, [route, updateHash]);

  // Expose convenient, atomic individual setters for ease-of-use
  const setView = useCallback((v: ViewState) => {
    navigate(v);
  }, [navigate]);

  const setCurrentCampaignId = useCallback((cid: number | null) => {
    navigate(route.view, cid);
  }, [navigate, route.view]);

  const setCurrentSearchId = useCallback((sid: number | null) => {
    navigate(route.view, route.campaignId, sid);
  }, [navigate, route.view, route.campaignId]);

  const setSelectedListingId = useCallback((lid: string | null) => {
    navigate(route.view, route.campaignId, route.searchId, lid);
  }, [navigate, route.view, route.campaignId, route.searchId]);

  const setWizardStep = useCallback((stepVal: 1 | 2 | 3) => {
    navigate(route.view, route.campaignId, route.searchId, route.listingId, stepVal);
  }, [navigate, route.view, route.campaignId, route.searchId, route.listingId]);

  return {
    view: route.view,
    currentCampaignId: route.campaignId,
    currentSearchId: route.searchId,
    selectedListingId: route.listingId,
    wizardStep: route.step,
    previousView,
    setView,
    setCurrentCampaignId,
    setCurrentSearchId,
    setSelectedListingId,
    setWizardStep,
    navigate,
  };
}
