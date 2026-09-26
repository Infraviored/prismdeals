import React, { useState, useEffect, useCallback } from 'react';
import { Bar } from '../components/surface';
import { KaLoginSheet } from './KaLoginSheet';
import { useTranslation } from '../hooks/useTranslation';

export interface AppScreenProps {
  onBack: () => void;
  sessionEmail: string | null;
  /** The Kleinanzeigen session changed: read its status again. */
  onConnected: () => void;
  onLogout: () => void;
  busy?: boolean;
}

interface Schedule {
  interval: number;
  fullFetchOnStartup: boolean;
  delayBetweenPages: number;
  delayBetweenListings: number;
}

const DEFAULTS: Schedule = {
  interval: 10,
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
  onConnected,
  onLogout,
  busy = false,
}) => {
  const { t, lang, toggleLanguage } = useTranslation();
  const [schedule, setSchedule] = useState<Schedule>(DEFAULTS);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [loginOpen, setLoginOpen] = useState(false);
  const [tone, setTone] = useState('');
  const [toneState, setToneState] = useState<'idle' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    fetch('/api/ka/tone')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => setTone(d.tone || ''))
      .catch(() => setToneState('failed'));
  }, []);

  const saveTone = async () => {
    try {
      const res = await fetch('/api/ka/tone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setToneState('saved');
      setTimeout(() => setToneState('idle'), 2500);
    } catch {
      setToneState('failed');
    }
  };

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

  const row = 'w-full px-3.5 py-3 min-h-[42px] rounded bg-[#06322C] border border-[#0E4A40] flex items-center justify-between gap-3 text-sm';

  return (
    <div className="w-full bg-[#011F1F] text-[#F2F5F4] flex flex-col min-h-screen">
      <Bar title={t('surface.app')} onBack={onBack} backLabel={t('surface.back')} measure="max-w-xl" />

      <main className="flex-1 px-4 py-5 space-y-6 max-w-xl w-full mx-auto">
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-[#8FA6A1]">{t('surface.connection')}</h2>
          <div className={row}>
            <span className="text-[#8FA6A1] truncate">
              {sessionEmail || t('surface.notConnected')}
            </span>
            <span className="flex gap-2 shrink-0">
              {sessionEmail && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/ka/logout', { method: 'POST' }).catch(() => {});
                    onConnected();
                  }}
                  className="px-3 py-1.5 rounded text-xs font-semibold border border-[#0E4A40] text-[#F2F5F4] whitespace-nowrap cursor-pointer"
                >
                  {t('ka.disconnect')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                disabled={busy}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {sessionEmail ? t('common.reauth') : t('common.login')}
              </button>
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-medium text-[#8FA6A1]">{t('chat.tone')}</h2>
          <textarea
            value={tone}
            onChange={e => setTone(e.target.value)}
            onBlur={saveTone}
            rows={5}
            aria-label={t('chat.tone')}
            className="w-full px-3.5 py-3 rounded bg-[#06322C] border border-[#0E4A40] text-sm text-[#F2F5F4] leading-relaxed focus:outline-none focus:border-[#8FA6A1]"
          />
          <p className="text-xs text-[#8FA6A1]">
            {toneState === 'saved' ? t('chat.toneSaved') : toneState === 'failed' ? t('chat.failed') : t('chat.toneHint')}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-medium text-[#8FA6A1]">{t('surface.schedule')}</h2>

          <label className={row} htmlFor="app-interval">
            <span className="text-[#8FA6A1]">{t('surface.crawlEvery')}</span>
            <span className="flex items-baseline gap-1 shrink-0">
              <input
                id="app-interval"
                type="number"
                min={0}
                value={schedule.interval}
                onChange={e => save({ ...schedule, interval: parseInt(e.target.value, 10) || 0 })}
                className="w-16 px-2 py-1 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] focus:outline-none focus:border-[#8FA6A1] text-sm tabular-nums text-right"
              />
              <span className="text-[#8FA6A1]">{t('surface.minutes')}</span>
            </span>
          </label>
          <p className="px-1 text-2xs text-[#8FA6A1]">
            {schedule.interval === 0 ? t('settings.frequencyOff') : t('settings.frequencyDesc')}
          </p>

        </section>

        <section className="space-y-2">
          <button type="button" onClick={toggleLanguage} className={row}>
            <span className="text-[#8FA6A1]">{t('surface.language')}</span>
            <span className="text-[#F2F5F4]">{lang === 'de' ? 'Deutsch' : 'English'}</span>
          </button>
        </section>

        {status === 'failed' && (
          <p className="text-sm text-[#C9A227]">{t('settings.saveError')}</p>
        )}
        {status === 'saved' && (
          <p className="text-sm text-[#4E8C6A]">{t('settings.saveSuccess')}</p>
        )}

        <div className="pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-4 py-2.5 rounded border border-[#0E4A40] text-sm text-[#8FA6A1] hover:text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors bg-transparent cursor-pointer"
          >
            {t('auth.logout')}
          </button>
        </div>
      </main>
      <KaLoginSheet isOpen={loginOpen} onClose={() => setLoginOpen(false)} onConnected={onConnected} />
    </div>
  );
};

export default AppScreen;
