import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';

/** Logging in to Kleinanzeigen in the server's browser, shown here.
 *
 * The server has no screen; its browser's page arrives as pictures and every
 * tap and key goes back to it (backend/ka_browser.js). What is typed is sent
 * key by key and the field is emptied at once: nothing stays on this page.
 */
export const KaLoginSheet: React.FC<{ isOpen: boolean; onClose: () => void; onConnected: () => void }> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'starting' | 'open' | 'connected' | 'failed'>('starting');
  const [view, setView] = useState({ width: 400, height: 780 });
  const seq = useRef(0);
  const img = useRef<HTMLImageElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  // One space always in the hidden field: a phone keyboard's backspace on an
  // empty field sends no key event, on a space it removes the space.
  const [typed, setTyped] = useState(' ');

  // One after the other: keys sent side by side could arrive swapped.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const send = useCallback((event: Record<string, unknown>) => {
    queue.current = queue.current.then(() =>
      fetch('/api/ka/login/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }).catch(() => {})
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    let url: string | null = null;
    setState('starting');
    seq.current = 0;
    fetch('/api/ka/login', { method: 'POST' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (d.view) setView(d.view);
        if (alive) setState('open');
      })
      .catch(() => alive && setState('failed'));
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/ka/login/frame?after=${seq.current}`, { cache: 'no-store' });
        const s = r.headers.get('X-Ka-State');
        if (s === 'connected') {
          setState('connected');
          onConnected();
          clearInterval(poll);
          return;
        }
        if (r.status === 200) {
          seq.current = Number(r.headers.get('X-Ka-Seq')) || seq.current;
          const next = URL.createObjectURL(await r.blob());
          if (url) URL.revokeObjectURL(url);
          url = next;
          if (alive) setSrc(next);
        }
      } catch {
        // the next poll tries again
      }
    }, 250);
    return () => {
      alive = false;
      clearInterval(poll);
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [isOpen, onConnected]);

  const close = () => {
    fetch('/api/ka/login/stop', { method: 'POST' }).catch(() => {});
    onClose();
  };

  const tap = (e: React.MouseEvent<HTMLImageElement>) => {
    const box = img.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((e.clientX - box.left) / box.width) * view.width;
    const y = ((e.clientY - box.top) / box.height) * view.height;
    send({ type: 'click', x: Math.round(x), y: Math.round(y) });
    // Typing goes into the picture: the keyboard opens on the hidden field.
    keys.current?.focus();
  };

  const key = (k: string) => () => send({ type: 'key', key: k });
  const small = 'px-3 py-2 rounded text-xs font-semibold border border-[#0E4A40] text-[#F2F5F4] whitespace-nowrap';

  return (
    <Sheet isOpen={isOpen} onClose={close} title={t('ka.title')} side="right">
      <div className="space-y-3" data-testid="ka-login">
        <p className="text-sm text-[#8FA6A1]">
          {state === 'connected' ? t('ka.connected') : state === 'failed' ? t('ka.failed') : t('ka.hint')}
        </p>
        {state !== 'connected' && state !== 'failed' && (
          <>
            <div className="relative rounded overflow-hidden border border-[#0E4A40] bg-white" style={{ aspectRatio: `${view.width} / ${view.height}` }}>
              <input
                ref={keys}
                type="password"
                autoComplete="new-password"
                value={typed}
                aria-label={t('ka.typeHere')}
                onChange={e => {
                  const text = e.target.value;
                  if (text.length < 1) send({ type: 'key', key: 'Backspace' });
                  else if (text.length > 1) send({ type: 'text', text: text.startsWith(' ') ? text.slice(1) : text });
                  setTyped(' ');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    send({ type: 'key', key: 'Enter' });
                  }
                }}
                className="absolute left-0 top-0 w-px h-px opacity-0"
              />
              {src ? (
                <img
                  ref={img}
                  src={src}
                  alt={t('ka.title')}
                  onClick={tap}
                  onWheel={e => send({ type: 'scroll', dy: Math.round(e.deltaY) })}
                  className="w-full h-full cursor-pointer select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-[#011F1F]">{t('ka.loading')}</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={small} onClick={key('Backspace')}>{t('ka.backspace')}</button>
              <button type="button" className={small} onClick={key('Tab')}>{t('ka.tab')}</button>
              <button type="button" className={small} onClick={key('Enter')}>{t('ka.enter')}</button>
              <button type="button" className={small} onClick={() => send({ type: 'back' })}>{t('ka.back')}</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};

export default KaLoginSheet;
