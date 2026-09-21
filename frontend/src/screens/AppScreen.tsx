import React, { useState, useEffect, useCallback } from 'react';
import { Bar, Pill } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';

export interface AppScreenProps {
  onBack: () => void;
  sessionEmail: string | null;
  onConnect: () => void;
  onLogout: () => void;
  busy?: boolean;
}

interface Schedule {
  interval: number;
  autoAiEval: boolean;
  fullFetchOnStartup: boolean;
  delayBetweenPages: number;
  delayBetweenListings: number;
}

const DEFAULTS: Schedule = {
  interval: 10,
  autoAiEval: true,
  fullFetchOnStartup: false,
  delayBetweenPages: 0.25,
  delayBetweenListings: 0.25,
};

/** What holds for every search.
 *
 * The Kleinanzeigen connection lives here now. It used to sit in a bar above
 * every screen, announcing "Not Connected" over a list of things to buy -- a
 * permanent red mark for a state most people need to think about twice a month.
 */
export const AppScreen: React.FC<AppScreenProps> = ({
  onBack,
  sessionEmail,
  onConnect,
  onLogout,
  busy = false,
}) => {
  const { t, lang, toggleLanguage } = useTranslation();
  const [schedule, setSchedule] = useState<Schedule>(DEFAULTS);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    fetch('/api/schedule')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => setSchedule({ ...DEFAULTS, ...d }))
      .catch(() => setStatus('failed'));
  }, []);

  const save = useCallback(
    async (next: Schedule) => {
      setSchedule(next);
      setStatus('saving');
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(String(res.status));
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2500);
      } catch {
        setStatus('failed');
      }
    },
    []
  );

  const row = 'w-full px-3.5 py-3 min-h-[44px] rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between gap-3 text-sm';

  return (
    <div className="w-full bg-[#011F1F] text-[#F2F5F4] flex flex-col min-h-screen">
      <Bar title={t('surface.app')} onBack={onBack} />

      <main className="flex-1 px-4 py-5 space-y-6 max-w-xl w-full">
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-[#9FB3B0]">{t('surface.connection')}</h2>
          <div className={row}>
            <span className="text-[#9FB3B0] truncate">
              {sessionEmail || t('surface.notConnected')}
            </span>
            <Pill
              label={sessionEmail ? t('common.reauth') : t('common.login')}
              onClick={onConnect}
              disabled={busy}
            />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-medium text-[#9FB3B0]">{t('surface.schedule')}</h2>

          <label className={row} htmlFor="app-interval">
            <span className="text-[#9FB3B0]">{t('surface.crawlEvery')}</span>
            <span className="flex items-baseline gap-1 shrink-0">
              <input
                id="app-interval"
                type="number"
                min={0}
                value={schedule.interval}
                onChange={e => save({ ...schedule, interval: parseInt(e.target.value, 10) || 0 })}
                className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F2F5F4] focus:outline-none focus:border-white/30 text-sm tabular-nums text-right"
              />
              <span className="text-[#9FB3B0]">{t('surface.minutes')}</span>
            </span>
          </label>
          <p className="px-1 text-2xs text-[#9FB3B0]/70">
            {schedule.interval === 0 ? t('settings.frequencyOff') : t('settings.frequencyDesc')}
          </p>

          <button
            type="button"
            onClick={() => save({ ...schedule, autoAiEval: !schedule.autoAiEval })}
            aria-pressed={schedule.autoAiEval}
            className={row}
          >
            <span className="text-[#9FB3B0]">{t('surface.autoEvaluate')}</span>
            <span className={schedule.autoAiEval ? 'text-[#F2F5F4]' : 'text-[#9FB3B0]/50'}>
              {schedule.autoAiEval ? '✓' : t('surface.off')}
            </span>
          </button>
        </section>

        <section className="space-y-2">
          <button type="button" onClick={toggleLanguage} className={row}>
            <span className="text-[#9FB3B0]">{t('surface.language')}</span>
            <span className="text-[#F2F5F4]">{lang === 'de' ? 'Deutsch' : 'English'}</span>
          </button>
        </section>

        {status === 'failed' && (
          <p className="text-sm text-[#D9A441]">{t('settings.saveError')}</p>
        )}
        {status === 'saved' && (
          <p className="text-sm text-[#9FB3B0]">{t('settings.saveSuccess')}</p>
        )}

        <div className="pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-4 py-3 rounded-xl border border-white/[0.12] text-sm text-[#9FB3B0] hover:text-[#F2F5F4] hover:border-white/30 transition-colors bg-transparent"
          >
            {t('auth.logout')}
          </button>
        </div>
      </main>
    </div>
  );
};

export default AppScreen;
