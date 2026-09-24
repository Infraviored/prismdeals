import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { ArrowRight, Loader2 } from 'lucide-react';

export interface StepIntentProps {
  initialText: string;
  isAnalyzing: boolean;
  onNext: (text: string) => void;
}

export const StepIntent: React.FC<StepIntentProps> = ({
  initialText,
  isAnalyzing,
  onNext,
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isAnalyzing) return;
    onNext(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="hunt-intent-input"
          className="block text-xs font-semibold uppercase tracking-wider text-[#8FA6A1]"
        >
          {t('hunt.step1Title')}
        </label>
        <p className="text-xs text-[#8FA6A1]/80">
          {t('hunt.step1Subtitle')}
        </p>
        <div className="relative mt-2">
          <textarea
            id="hunt-intent-input"
            data-testid="hunt-intent-input"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnalyzing}
            placeholder={t('hunt.step1Placeholder')}
            className="w-full px-4 py-3 rounded-lg bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-base leading-relaxed transition-colors resize-none disabled:opacity-50"
            autoFocus
          />
        </div>
      </div>

      {isAnalyzing && (
        <div
          data-testid="hunt-intent-analyzing"
          className="flex items-center space-x-2 text-xs text-[#E4D6BE] font-medium animate-pulse"
        >
          <Loader2 className="w-4 h-4 animate-spin text-[#E4D6BE]" />
          <span>{t('hunt.step1Analyzing')}</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          data-testid="hunt-step1-next-btn"
          disabled={!text.trim() || isAnalyzing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>{t('hunt.next')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
};

export default StepIntent;
