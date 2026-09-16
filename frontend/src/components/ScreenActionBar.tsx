import type { ScreenAction } from '../types/screenActions';
import { Button } from './ui/Button';
import { useTranslation } from '../hooks/useTranslation';

interface ScreenActionBarProps {
  actions: ScreenAction[];
  className?: string;
}

export default function ScreenActionBar({ actions, className }: ScreenActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className={className || "flex items-center gap-2 shrink-0 flex-wrap"}>
      {actions
        .filter(action => action.visible !== false)
        .map(action => {
          const Icon = action.icon;
          const isPrimary = action.variant === 'action-emerald' || action.id === 'fetch-listings' || action.id === 'fetch-fresh';
          return (
            <Button
              key={action.id}
              data-testid={`screen-action-${action.id}`}
              variant={action.variant || 'primary'}
              size="sm"
              onClick={action.handler}
              disabled={action.disabled}
              aria-label={t(action.labelKey)}
              title={t(action.labelKey)}
              className={
                isPrimary
                  ? "py-2 px-3 sm:px-3.5 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  : "py-2 px-2.5 sm:px-3.5 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              }
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className={isPrimary ? "" : "hidden sm:inline"}>{t(action.labelKey)}</span>
            </Button>
          );
        })}
    </div>
  );
}
