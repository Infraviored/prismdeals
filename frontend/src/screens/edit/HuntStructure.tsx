import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { filterText, wantText, type HuntDocument } from '../../utils/huntDocument';

export interface HuntStructureProps {
  doc: HuntDocument;
  place: string | null;
  filters: string[];
}

/** How the hunt is stored: per model, for all, and what goes into the search. */
export const HuntStructure: React.FC<HuntStructureProps> = ({ doc, place, filters }) => {
  const { t } = useTranslation();
  const labels = { must: t('surface.editMust'), wish: t('surface.editWish'), absent: t('surface.editAbsent') };

  const list = (items: string[]) =>
    items.length ? (
      <ul className="mt-1 space-y-0.5">
        {items.map((text) => (
          <li key={text} className="text-sm text-[#F2F5F4]">{text}</li>
        ))}
      </ul>
    ) : (
      <p className="mt-1 text-sm text-[#8FA6A1]">{t('surface.editNothing')}</p>
    );

  const search = [
    place ? (doc.radius_km ? t('surface.editRadius', { km: doc.radius_km, place }) : place) : t('surface.editEverywhere'),
    doc.max_price ? t('surface.editUpTo', { price: doc.max_price }) : t('surface.editNoPrice'),
    ...filters.map(filterText),
  ];

  return (
    <section className="space-y-4 rounded border border-[#0E4A40] p-4" data-testid="hunt-structure">
      <h2 className="text-xs font-medium text-[#8FA6A1]">{t('surface.editStructure')}</h2>
      {doc.models.map((model) => (
        <div key={model.name}>
          <h3 className="text-sm font-semibold text-[#E4D6BE]">{model.name}</h3>
          {list(model.requirements.map((r) => wantText(r, labels)))}
        </div>
      ))}
      <div>
        <h3 className="text-sm font-semibold text-[#E4D6BE]">{t('surface.editForAll')}</h3>
        {list(doc.requirements.map((r) => wantText(r, labels)))}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#E4D6BE]">{t('surface.editSearch')}</h3>
        {list(search)}
      </div>
    </section>
  );
};

export default HuntStructure;
