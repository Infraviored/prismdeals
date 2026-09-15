import type { Campaign, ScraperProgressCardProps } from '../types'
import ResultsScreen from '../screens/ResultsScreen'
import { useTranslation } from '../hooks/useTranslation'
import { Button } from './ui/Button'
import { Settings } from 'lucide-react'

interface RouteModeViewProps {
  campaign: Campaign | undefined
  campaignId: number | null
  onBack: () => void
  onConfigure: () => void
  onEvaluateWithAi: () => void
  isScraping: boolean
  onStartScrape: () => void
  scrapingStatus: string
  scrapingProgress: ScraperProgressCardProps['scrapingProgress']
  liveLogs: string
  showLogConsole: boolean
  setShowLogConsole: (v: boolean) => void
  onEditFamily: () => void
}

export default function RouteModeView({
  campaign,
  campaignId,
  onBack,
  onConfigure,
  onEvaluateWithAi,
  isScraping,
  onStartScrape,
  scrapingStatus,
  scrapingProgress,
  liveLogs,
  showLogConsole,
  setShowLogConsole,
  onEditFamily,
}: RouteModeViewProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col space-y-3 sm:space-y-6 animate-fadeIn w-full">
      <div className="flex items-center space-x-3">
        <Button
          variant="badge"
          size="sm"
          onClick={onBack}
          className="px-3 py-1.5"
        >
          <span className="mr-1">←</span>
          <span>{t('common.backToCampaigns')}</span>
        </Button>
        <div className="w-[1px] h-5 bg-border-subtle" />
        <Button
          variant="icon"
          size="xs"
          onClick={onConfigure}
          title={t('landing.configureTooltip')}
          className="p-1.5 border-border-subtle hover:border-brand-accent/30"
        >
          <Settings className="w-4 h-4 transition-transform duration-500 hover:rotate-90 text-text-muted hover:text-brand-accent" />
        </Button>
      </div>

      <ResultsScreen
        campaignId={campaignId || 0}
        campaignName={campaign?.name || ''}
        familyId={campaign?.family_id ?? undefined}
        onEvaluateWithAi={onEvaluateWithAi}
        isScraping={isScraping}
        onStartScrape={onStartScrape}
        scrapingStatus={scrapingStatus}
        scrapingProgress={scrapingProgress}
        liveLogs={liveLogs}
        showLogConsole={showLogConsole}
        setShowLogConsole={setShowLogConsole}
        onEditFamily={onEditFamily}
      />
    </div>
  )
}
