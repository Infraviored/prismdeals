import { useState, useEffect, useCallback } from 'react';

export type ViewState = 'landing' | 'dashboard' | 'edit' | 'create-campaign' | 'settings' | 'kept';

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

  if (['landing', 'dashboard', 'edit', 'create-campaign', 'settings', 'kept'].includes(path)) {
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
    newCampaignId?: number | null,
    newSearchId?: number | null,
    newListingId?: string | null,
    newStep?: 1 | 2 | 3
  ) => {
    setRoute((prev) => {
      const targetCampaignId = newCampaignId !== undefined ? newCampaignId : prev.campaignId;
      const targetSearchId = newSearchId !== undefined ? newSearchId : prev.searchId;
      const targetListingId = newListingId !== undefined ? newListingId : prev.listingId;
      const targetStep = newStep !== undefined ? newStep : prev.step;

      if (
        prev.view === newView &&
        prev.campaignId === targetCampaignId &&
        prev.searchId === targetSearchId &&
        prev.listingId === targetListingId &&
        prev.step === targetStep
      ) {
        return prev;
      }

      if (newView === 'settings' && prev.view !== 'settings') {
        setPreviousView(prev.view as Exclude<ViewState, 'settings'>);
      }

      const nextRoute: RouteState = {
        view: newView,
        campaignId: targetCampaignId,
        searchId: targetSearchId,
        listingId: targetListingId,
        step: targetStep,
      };

      updateHash(newView, targetCampaignId, targetSearchId, targetListingId, targetStep);
      return nextRoute;
    });
  }, [updateHash]);

  // Expose convenient, atomic individual setters for ease-of-use
  const setView = useCallback((v: ViewState) => {
    navigate(v);
  }, [navigate]);

  const setCurrentCampaignId = useCallback((cid: number | null) => {
    setRoute((prev) => {
      if (prev.campaignId === cid) return prev;
      const next: RouteState = { ...prev, campaignId: cid };
      updateHash(next.view, next.campaignId, next.searchId, next.listingId, next.step);
      return next;
    });
  }, [updateHash]);

  const setCurrentSearchId = useCallback((sid: number | null) => {
    setRoute((prev) => {
      if (prev.searchId === sid) return prev;
      const next: RouteState = { ...prev, searchId: sid };
      updateHash(next.view, next.campaignId, next.searchId, next.listingId, next.step);
      return next;
    });
  }, [updateHash]);

  const setSelectedListingId = useCallback((lid: string | null) => {
    setRoute((prev) => {
      if (prev.listingId === lid) return prev;
      const next: RouteState = { ...prev, listingId: lid };
      updateHash(next.view, next.campaignId, next.searchId, next.listingId, next.step);
      return next;
    });
  }, [updateHash]);

  const setWizardStep = useCallback((stepVal: 1 | 2 | 3) => {
    setRoute((prev) => {
      if (prev.step === stepVal) return prev;
      const next: RouteState = { ...prev, step: stepVal };
      updateHash(next.view, next.campaignId, next.searchId, next.listingId, next.step);
      return next;
    });
  }, [updateHash]);

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
