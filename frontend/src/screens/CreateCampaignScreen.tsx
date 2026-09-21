import { Bar, Pill } from '../components/surface'
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
        title={t('wizard.createCampaignTitle')}
        onBack={onCancel}
        actions={
          <Pill label={t('surface.save')} active={canSave} onClick={canSave ? onSave : undefined} />
        }
      />

      <main className="flex-1 px-4 py-5 space-y-2 max-w-xl w-full">
        <label htmlFor="campaign-name" className="block text-xs font-medium text-[#9FB3B0]">
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
          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F2F5F4] placeholder-[#9FB3B0]/40 focus:outline-none focus:border-white/30 text-sm transition-colors"
        />
      </main>
    </div>
  )
}
