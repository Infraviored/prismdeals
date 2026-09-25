import { useCallback, useState } from 'react';
import type { HuntDocument } from '../types/hunt';
import { api } from '../utils/api';

export interface UseHuntSetupOptions {
  onSaved?: (saved: HuntDocument) => void;
}

/** A new hunt: the buyer's words, the AI's draft of them, the stored hunt. */
export function useHuntSetup({ onSaved }: UseHuntSetupOptions = {}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<HuntDocument | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitText = useCallback(async (words: string) => {
    setText(words);
    setDrafting(true);
    setError(null);
    try {
      setDraft(await api<HuntDocument>('/api/hunts/draft', { method: 'POST', body: { text: words } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const stored = await api<HuntDocument>('/api/hunts', { method: 'POST', body: { ...draft, text } });
      onSaved?.(stored);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, saving, text, onSaved]);

  /** Back to the words; the draft goes with them. */
  const restart = useCallback(() => {
    setDraft(null);
    setError(null);
  }, []);

  return { text, draft, setDraft, drafting, saving, error, submitText, save, restart };
}
