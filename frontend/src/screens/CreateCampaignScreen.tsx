import { Bar } from '../components/surface'
import { useTranslation } from '../hooks/useTranslation'

interface CreateCampaignScreenProps {
  newCampaignName: string
  setNewCampaignName: (name: string) => void
  onSave: () => void
  onCancel: () => void
}

/** Naming a new hunt. One field, one save.
 *
 * Everything else about a search -- what, where, how far, up to how much --
 * belongs to the setup screen this leads into, so asking for it twice would
 * only be a second chance to contradict yourself.
 */
export default function CreateCampaignScreen({
  newCampaignName,
  setNewCampaignName,
  onSave,
  onCancel,
}: CreateCampaignScreenProps) {
  const { t } = useTranslation()
  const canSave = newCampaignName.trim().length > 0

  return (
    <div className="w-full bg-[#011F1F] text-[#F2F5F4] flex flex-col min-h-screen">
      <Bar
        measure="max-w-xl"
        title={t('wizard.createCampaignTitle')}
        onBack={onCancel}
        backLabel={t('surface.cancel')}
        actions={
          <button
            type="button"
            onClick={canSave ? onSave : undefined}
            disabled={!canSave}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              canSave
                ? 'bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] cursor-pointer'
                : 'bg-[#06322C] text-[#8FA6A1]/50 border border-[#0E4A40] cursor-not-allowed'
            }`}
          >
            {t('surface.save')}
          </button>
        }
      />

      <main className="flex-1 px-4 py-5 space-y-2 max-w-xl w-full mx-auto">
        <label htmlFor="campaign-name" className="block text-xs font-medium text-[#8FA6A1]">
          {t('wizard.campaignNameLabel')}
        </label>
        <input
          id="campaign-name"
          autoFocus
          type="text"
          value={newCampaignName}
          onChange={e => setNewCampaignName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && canSave) onSave()
          }}
          placeholder={t('wizard.campaignNamePlaceholder')}
          className="w-full px-3.5 py-2.5 min-h-[40px] rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm transition-colors"
        />
      </main>
    </div>
  )
}
