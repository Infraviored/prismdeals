import { useTranslation } from '../hooks/useTranslation'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

interface CreateCampaignScreenProps {
  newCampaignName: string
  setNewCampaignName: (name: string) => void
  onSave: () => void
  onCancel: () => void
}

export default function CreateCampaignScreen({
  newCampaignName,
  setNewCampaignName,
  onSave,
  onCancel,
}: CreateCampaignScreenProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full animate-fadeIn py-12 max-w-lg mx-auto">
      <Card className="p-8 w-full relative overflow-hidden">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Button
              variant="badge"
              size="xs"
              onClick={onCancel}
            >
              <span>← {t('common.back')}</span>
            </Button>
          </div>
          <h2 className="text-2xl font-bold text-text-primary font-sans tracking-tight">{t('wizard.createCampaignTitle')}</h2>
          <p className="text-base text-text-secondary leading-relaxed font-normal">{t('wizard.createCampaignDesc')}</p>
        </div>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary font-medium block">{t('wizard.campaignNameLabel')}</label>
            <Input
              type="text"
              value={newCampaignName}
              onChange={e => setNewCampaignName(e.target.value)}
              placeholder={t('wizard.campaignNamePlaceholder')}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newCampaignName.trim()) {
                  onSave()
                }
              }}
            />
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <Button
            variant="secondary"
            onClick={onCancel}
            className="flex-1 py-3"
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            className="flex-1 py-3"
          >
            {t('common.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
