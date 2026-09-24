import { useState, useRef, useCallback, useEffect } from 'react';
import type { MarketPicture, ProbeRung } from '../types';
import { applyRelaxToMarketPicture, getLikelyCountForBudget } from '../utils/probeAggregation';

export interface ProbePayload {
  category_code?: string | null;
  filters?: Record<string, string>;
  location_id?: string | null;
  radius_km?: number | null;
  price?: { min?: number | null; max?: number | null };
  hunt_type?: string;
  musts?: Array<Record<string, unknown>>;
  prefs?: Array<Record<string, unknown>>;
  seed_terms?: string[];
  models?: string[];
  budget_steps?: number[];
  node_key?: string;
}

export interface UseProbeReturn {
  isProbing: boolean;
  rungs: ProbeRung[];
  marketPicture: MarketPicture | null;
  error: string | null;
  selectedBudgetMax: number | null;
  effectiveLikelyCount: number;
  relaxedMusts: Set<string>;
  startProbe: (payload: ProbePayload) => Promise<void>;
  stopProbe: () => void;
  relaxMust: (mustIdOrLabel: string) => void;
  selectBudget: (budgetMax: number | null) => void;
  resetProbe: () => void;
}

export function useProbe(): UseProbeReturn {
  const [isProbing, setIsProbing] = useState(false);
  const [rungs, setRungs] = useState<ProbeRung[]>([]);
  const [marketPicture, setMarketPicture] = useState<MarketPicture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBudgetMax, setSelectedBudgetMax] = useState<number | null>(null);
  const [relaxedMusts, setRelaxedMusts] = useState<Set<string>>(new Set());

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopProbe = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProbing(false);
  }, []);

  const resetProbe = useCallback(() => {
    stopProbe();
    setRungs([]);
    setMarketPicture(null);
    setError(null);
    setSelectedBudgetMax(null);
    setRelaxedMusts(new Set());
  }, [stopProbe]);

  const startProbe = useCallback(
    async (payload: ProbePayload) => {
      // Abort any ongoing probe
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsProbing(true);
      setError(null);
      setRungs([]);
      setMarketPicture(null);
      setSelectedBudgetMax(payload.price?.max ?? null);
      setRelaxedMusts(new Set());

      try {
        const response = await fetch('/api/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Probe failed with status ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body stream not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (!part.trim()) continue;

            let eventType = 'message';
            let dataStr = '';
            const lines = part.split('\n');

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.slice(5).trim();
              }
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (eventType === 'rung') {
                setRungs((prev) => [...prev, data as ProbeRung]);
              } else if (eventType === 'result') {
                setMarketPicture(data as MarketPicture);
              } else if (eventType === 'error') {
                setError(data.error || 'Probe encountered an error');
              } else if (eventType === 'done') {
                setIsProbing(false);
              }
            } catch {
              // Ignore malformed chunks
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Normal abort, do not set error
          return;
        }
        setError(err instanceof Error ? err.message : 'Market probe failed');
      } finally {
        setIsProbing(false);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    []
  );

  const relaxMust = useCallback((mustIdOrLabel: string) => {
    setRelaxedMusts((prev) => new Set([...prev, mustIdOrLabel]));
    setMarketPicture((prev) => {
      if (!prev) return prev;
      return applyRelaxToMarketPicture(prev, mustIdOrLabel);
    });
  }, []);

  const selectBudget = useCallback((budgetMax: number | null) => {
    setSelectedBudgetMax(budgetMax);
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const effectiveLikelyCount = getLikelyCountForBudget(marketPicture, selectedBudgetMax);

  return {
    isProbing,
    rungs,
    marketPicture,
    error,
    selectedBudgetMax,
    effectiveLikelyCount,
    relaxedMusts,
    startProbe,
    stopProbe,
    relaxMust,
    selectBudget,
    resetProbe,
  };
}
