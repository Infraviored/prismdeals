import type { Campaign, ScraperProgressCardProps } from '../types'
import ResultsScreen from '../screens/ResultsScreen'

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
  return (
    <ResultsScreen
      campaignId={campaignId || 0}
      campaignName={campaign?.name || ''}
      familyId={campaign?.family_id ?? undefined}
      onBack={onBack}
      onConfigure={onConfigure}
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
  )
}
