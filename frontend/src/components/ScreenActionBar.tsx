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
    <div className={className || "flex flex-wrap gap-2 w-full lg:w-auto"}>
      {actions
        .filter(action => action.visible !== false)
        .map(action => {
          const Icon = action.icon;
          return (
            <Button
              key={action.id}
              variant={action.variant || 'primary'}
              size="sm"
              onClick={action.handler}
              disabled={action.disabled}
              className="min-w-[9.5rem] py-2.5 px-3 text-center flex items-center justify-center gap-1.5"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t(action.labelKey)}</span>
            </Button>
          );
        })}
    </div>
  );
}
