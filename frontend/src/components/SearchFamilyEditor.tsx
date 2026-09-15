import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { useTranslation } from '../hooks/useTranslation';
import type { SearchFamilyTerm, SearchFamilyPreview } from '../types';
import { parseLinesToTerms } from '../utils/searchFamily';
import SearchFamilyPreviewBanner from './SearchFamilyPreviewBanner';
import SearchFamilyTermItem from './SearchFamilyTermItem';
import { Plus, Layers } from 'lucide-react';

export interface SearchFamilyEditorProps {
  familyId?: number;
  initialName?: string;
  initialBaseUrl?: string;
  initialTerms?: SearchFamilyTerm[];
  campaignId?: number | null;
  routeSearchId?: number | null;
  onSave?: (savedFamily: { id: number; searches: number; conflicts?: unknown[] }) => void;
  onCancel?: () => void;
  className?: string;
}

export default function SearchFamilyEditor({
  familyId,
  initialName = '',
  initialBaseUrl = '',
  initialTerms = [],
  campaignId = null,
  routeSearchId = null,
  onSave,
  onCancel,
  className = '',
}: SearchFamilyEditorProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(initialName);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [terms, setTerms] = useState<SearchFamilyTerm[]>(initialTerms);
  const [pasteText, setPasteText] = useState('');
  const [additionalText, setAdditionalText] = useState('');

  const [preview, setPreview] = useState<SearchFamilyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(false);

  useEffect(() => {
    if (!familyId) return;
    if (initialTerms.length > 0 && initialName && initialBaseUrl) return;
    setLoadingFamily(true);
    fetch(`/api/search-families/${familyId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.name) setName(data.name);
        if (data.base_url) setBaseUrl(data.base_url);
        if (Array.isArray(data.terms)) {
          setTerms(
            data.terms.map((t: { id?: number; term: string; label?: string; enabled?: boolean | number }) => ({
              id: t.id,
              term: t.term,
              label: t.label || t.term,
              enabled: t.enabled !== 0 && t.enabled !== false,
            }))
          );
        }
      })
      .catch((err) => console.error('Failed to load search family data:', err))
      .finally(() => setLoadingFamily(false));
  }, [familyId]);

  const requestId = useRef(0);

  const handleApplyPaste = useCallback(() => {
    if (!pasteText.trim()) return;
    const newItems = parseLinesToTerms(pasteText);
    if (newItems.length > 0) {
      setTerms(newItems);
      setPasteText('');
    }
  }, [pasteText]);

  const handleAddAdditional = useCallback(() => {
    if (!additionalText.trim()) return;
    const newItems = parseLinesToTerms(additionalText);
    if (newItems.length > 0) {
      setTerms((prev) => [...prev, ...newItems]);
      setAdditionalText('');
    }
  }, [additionalText]);

  const handleToggleTerm = useCallback((index: number) => {
    setTerms((prev) =>
      prev.map((term, i) => (i === index ? { ...term, enabled: !term.enabled } : term))
    );
  }, []);

  const handleDeleteTerm = useCallback((index: number) => {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleToggleAll = useCallback(() => {
    setTerms((prev) => {
      const someDisabled = prev.some((term) => !term.enabled);
      return prev.map((term) => ({ ...term, enabled: someDisabled }));
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setTerms([]);
    setPasteText('');
  }, []);

  const activeTerms = useMemo(() => terms.filter((t) => t.enabled), [terms]);
  const activeTermLabelsKey = useMemo(
    () => activeTerms.map((t) => t.label || t.term).join('|'),
    [activeTerms]
  );

  const loadPreview = useCallback(async () => {
    const trimmedUrl = baseUrl.trim();
    if (!trimmedUrl || activeTerms.length === 0) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    const mine = ++requestId.current;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await fetch('/api/search-families/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: trimmedUrl,
          terms: activeTerms.map((t) => t.label || t.term),
          route_search_id: routeSearchId ?? undefined,
        }),
      });

      const data = await res.json();
      if (mine !== requestId.current) return;

      if (!res.ok) {
        setPreviewError(data.error || t('common.connectionIssueFailed'));
        setPreview(null);
      } else {
        setPreview(data);
      }
    } catch {
      if (mine === requestId.current) {
        setPreviewError(t('common.connectionIssueFailed'));
        setPreview(null);
      }
    } finally {
      if (mine === requestId.current) {
        setPreviewLoading(false);
      }
    }
  }, [baseUrl, activeTerms, routeSearchId, t]);

  useEffect(() => {
    const timer = setTimeout(loadPreview, 350);
    return () => clearTimeout(timer);
  }, [baseUrl, activeTermLabelsKey, routeSearchId, loadPreview]);

  const disabledReason = useMemo(() => {
    if (!name.trim()) return t('searchFamily.saveDisabledNoName');
    if (!baseUrl.trim()) return t('searchFamily.saveDisabledNoUrl');
    if (terms.length === 0 || activeTerms.length === 0) return t('searchFamily.saveDisabledNoTerms');
    if (previewLoading) return t('searchFamily.saveDisabledPreviewLoading');
    if (previewError) return t('searchFamily.saveDisabledPreviewError');
    return null;
  }, [name, baseUrl, terms.length, activeTerms.length, previewLoading, previewError, t]);

  const isSaveDisabled = disabledReason !== null || saving;

  const handleSave = async () => {
    if (isSaveDisabled) return;

    setSaving(true);
    setSaveError(null);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      base_url: baseUrl.trim(),
      terms: terms.map((t) => ({
        ...(t.id ? { id: t.id } : {}),
        term: t.term,
        label: t.label || t.term,
        enabled: t.enabled,
      })),
    };
    if (campaignId) payload.campaign_id = campaignId;
    if (routeSearchId) payload.route_search_id = routeSearchId;

    try {
      const url = familyId ? `/api/search-families/${familyId}` : '/api/search-families';
      const method = familyId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || t('common.connectionIssueFailed'));
      } else if (onSave) {
        onSave(data);
      }
    } catch {
      setSaveError(t('common.connectionIssueFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`p-5 sm:p-6 space-y-5 bg-bg-surface border-border-subtle max-w-3xl mx-auto animate-fadeIn ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-accent shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight font-heading">
              {t('searchFamily.editorTitle')}
            </h2>
            {loadingFamily && (
              <span className="text-xs text-brand-accent animate-pulse font-mono">
                ({t('common.processing')})
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
            {t('searchFamily.editorDescription')}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="family-name" className="text-xs sm:text-sm font-semibold text-text-secondary">
            {t('searchFamily.nameLabel')}
          </label>
          <Input
            id="family-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('searchFamily.namePlaceholder')}
            className="w-full text-sm bg-bg-input border-border-subtle"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="family-base-url" className="text-xs sm:text-sm font-semibold text-text-secondary">
            {t('searchFamily.baseUrlLabel')}
          </label>
          <Input
            id="family-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t('searchFamily.baseUrlPlaceholder')}
            className="w-full text-sm font-mono bg-bg-input border-border-subtle"
          />
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="family-models-textarea" className="text-xs sm:text-sm font-semibold text-text-secondary">
            {t('searchFamily.modelsLabel')}
          </label>
          {terms.length > 0 && (
            <div className="flex items-center gap-3 text-2xs text-text-muted">
              <span>
                {t('searchFamily.activeCount', {
                  active: activeTerms.length,
                  total: terms.length,
                })}
              </span>
              <button
                type="button"
                onClick={handleToggleAll}
                className="hover:text-text-primary underline cursor-pointer"
              >
                {t('searchFamily.toggleTermActive')}
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="hover:text-status-danger underline cursor-pointer"
              >
                {t('searchFamily.clearAll')}
              </button>
            </div>
          )}
        </div>

        {terms.length === 0 ? (
          <div className="space-y-2">
            <textarea
              id="family-models-textarea"
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.includes('\n')) {
                  e.preventDefault();
                  const parsed = parseLinesToTerms(pasted);
                  if (parsed.length > 0) {
                    setTerms(parsed);
                    setPasteText('');
                  }
                }
              }}
              placeholder={t('searchFamily.modelsPlaceholder')}
              className="w-full p-3 rounded-xl border border-border-subtle bg-bg-input text-text-primary text-sm font-mono focus:outline-none focus:border-brand-accent/50 transition-colors"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xs text-text-muted">{t('searchFamily.modelsHelp')}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleApplyPaste}
                disabled={!pasteText.trim()}
                className="font-semibold text-xs py-1.5"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t('searchFamily.parseButton')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {terms.map((term, index) => (
                <SearchFamilyTermItem
                  key={`${term.term}-${index}`}
                  term={term}
                  index={index}
                  onToggle={handleToggleTerm}
                  onDelete={handleDeleteTerm}
                  toggleLabel={t('searchFamily.toggleTermActive')}
                  deleteLabel={t('searchFamily.deleteTerm')}
                />
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Input
                type="text"
                value={additionalText}
                onChange={(e) => setAdditionalText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAdditional();
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted.includes('\n')) {
                    e.preventDefault();
                    const parsed = parseLinesToTerms(pasted);
                    if (parsed.length > 0) {
                      setTerms((prev) => [...prev, ...parsed]);
                      setAdditionalText('');
                    }
                  }
                }}
                placeholder={t('searchFamily.addModelPlaceholder')}
                className="flex-1 text-xs bg-bg-input border-border-subtle font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddAdditional}
                disabled={!additionalText.trim()}
                className="shrink-0 text-xs px-3"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t('searchFamily.addModelButton')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <SearchFamilyPreviewBanner
        preview={preview}
        loading={previewLoading}
        error={previewError}
      />

      {saveError && (
        <p className="text-xs text-status-danger font-semibold">{saveError}</p>
      )}

      <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={isSaveDisabled}
            title={disabledReason || undefined}
            className="min-w-[12rem] py-3 font-bold text-sm"
          >
            {saving ? t('searchFamily.saving') : t('searchFamily.saveButton')}
          </Button>

          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
              className="py-3 text-sm"
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>

        {disabledReason && (
          <p className="text-xs text-text-muted italic">
            {disabledReason}
          </p>
        )}
      </div>
    </Card>
  );
}
