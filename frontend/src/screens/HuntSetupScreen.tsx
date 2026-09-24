import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useHuntSetup } from '../hooks/useHuntSetup';
import { Bar } from '../components/surface';
import StepIntent from './hunt/StepIntent';
import StepHuntType from './hunt/StepHuntType';
import StepDetails from './hunt/StepDetails';
import StepLocation from './hunt/StepLocation';
import MarketPicture from './hunt/MarketPicture';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';

export interface HuntSetupScreenProps {
  onBack: () => void;
  onSaved: (saved: { campaignId: number; familyId: number }) => void;
}

export const HuntSetupScreen: React.FC<HuntSetupScreenProps> = ({
  onBack,
  onSaved,
}) => {
  const { t } = useTranslation();
  const setup = useHuntSetup({ onSaved, onCancel: onBack });

  const totalSteps = setup.huntType === 'exact' ? 4 : 5;
  const displayStep = setup.step === 4 && setup.huntType === 'exact' ? 3 : (setup.step === 5 && setup.huntType === 'exact' ? 4 : setup.step);

  const handleBackNavigation = () => {
    if (setup.step === 1) {
      onBack();
    } else {
      setup.prevStep();
    }
  };

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans w-full overflow-x-hidden">
      {/* 1. Header Bar (44px) */}
      <Bar
        measure="max-w-xl"
        title={t('hunt.setupTitle')}
        onBack={handleBackNavigation}
        backLabel={setup.step === 1 ? t('surface.back') : t('hunt.back')}
        actions={
          setup.step === 5 ? (
            <button
              type="button"
              data-testid="hunt-top-save-btn"
              disabled={setup.isSaving}
              onClick={setup.saveHunt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-40"
            >
              {setup.isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('hunt.saving')}</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>{t('hunt.saveAndSearch')}</span>
                </>
              )}
            </button>
          ) : undefined
        }
      />

      {/* 2. Step Progress Indicator */}
      <div className="w-full max-w-xl mx-auto px-4 pt-3 pb-1 flex items-center justify-between text-xs text-[#8FA6A1]">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i + 1 === displayStep
                  ? 'w-6 bg-[#E4D6BE]'
                  : i + 1 < displayStep
                  ? 'w-3 bg-[#0E4A40]'
                  : 'w-3 bg-[#00100F] border border-[#0E4A40]/60'
              }`}
            />
          ))}
        </div>
        <span className="text-xs [font-variant-numeric:tabular-nums]">
          {displayStep} / {totalSteps}
        </span>
      </div>

      {/* 3. Main Form Body */}
      <main className="w-full max-w-xl mx-auto px-4 py-5 flex-1 flex flex-col">
        {/* Step 1: Free Text Intent */}
        {setup.step === 1 && (
          <StepIntent
            initialText={setup.intentText}
            isAnalyzing={setup.isAnalyzingIntent}
            onNext={setup.submitIntent}
          />
        )}

        {/* Step 2: Hunt Type Chips */}
        {setup.step === 2 && (
          <StepHuntType
            selectedType={setup.huntType}
            onSelectType={setup.setHuntType}
            onNext={setup.nextStep}
            onBack={setup.prevStep}
          />
        )}

        {/* Step 3: Type-specific Details */}
        {setup.step === 3 && (
          <StepDetails
            huntType={setup.huntType}
            models={setup.models}
            onChangeModels={setup.setModels}
            proposedModels={setup.proposedModels}
            isLoadingProposals={setup.isLoadingProposals}
            onToggleProposedModel={setup.toggleProposedModel}
            musts={setup.musts}
            onChangeMusts={setup.setMusts}
            prefs={setup.prefs}
            onChangePrefs={setup.setPrefs}
            sizes={setup.sizes}
            onChangeSizes={setup.setSizes}
            styles={setup.styles}
            onChangeStyles={setup.setStyles}
            onNext={setup.nextStep}
            onBack={setup.prevStep}
          />
        )}

        {/* Step 4: Location, Radius, Price, Category */}
        {setup.step === 4 && (
          <StepLocation
            place={setup.place}
            locationId={setup.locationId}
            radius={setup.radius}
            maxPrice={setup.maxPrice}
            categoryId={setup.categoryId}
            attributes={setup.attributes}
            intentQuery={setup.intentText}
            onPlaceChange={setup.handlePlaceChange}
            onRadiusChange={setup.setRadius}
            onMaxPriceChange={setup.setMaxPrice}
            onCategoryChange={setup.setCategoryId}
            onAttributesChange={setup.setAttributes}
            onNext={setup.nextStep}
            onBack={setup.prevStep}
          />
        )}

        {/* Step 5: Live Market Picture & Save Action */}
        {setup.step === 5 && (
          <div className="space-y-6">
            <MarketPicture
              isProbing={setup.probe.isProbing}
              rungs={setup.probe.rungs}
              marketPicture={setup.probe.marketPicture}
              error={setup.probe.error}
              selectedBudgetMax={setup.probe.selectedBudgetMax}
              effectiveLikelyCount={setup.probe.effectiveLikelyCount}
              relaxedMusts={setup.probe.relaxedMusts}
              huntType={setup.huntType}
              onRelaxMust={setup.probe.relaxMust}
              onSelectBudget={setup.probe.selectBudget}
              onRetry={setup.launchProbe}
              onStop={setup.probe.stopProbe}
            />

            {setup.saveError && (
              <p className="text-xs text-[#E87967] font-semibold">
                {setup.saveError}
              </p>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#0E4A40]/40">
              <button
                type="button"
                data-testid="hunt-step5-back-btn"
                onClick={setup.prevStep}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-[#8FA6A1] hover:text-[#F2F5F4] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('hunt.back')}</span>
              </button>

              <button
                type="button"
                data-testid="hunt-save-btn"
                disabled={setup.isSaving}
                onClick={setup.saveHunt}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {setup.isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('hunt.saving')}</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>{t('hunt.saveAndSearch')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default HuntSetupScreen;
