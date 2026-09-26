import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from './surface';
import { useTranslation } from '../hooks/useTranslation';

interface Thread {
  id: string;
  ad_title: string;
  other_name: string | null;
  messages: Array<{ mine: boolean; text: string; at: string }>;
}

/** One conversation with a seller: the thread, a suggested answer, one button to send it. */
export const ChatSheet: React.FC<{ conversationId: string | null; onClose: () => void }> = ({ conversationId, onClose }) => {
  const { t } = useTranslation();
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'loading' | 'drafting' | 'ready' | 'sending' | 'sent' | 'failed'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/ka/conversations/${encodeURIComponent(id)}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || String(res.status));
    setThread(d);
    return d as Thread;
  }, []);

  const draft = useCallback(async (id: string) => {
    setState('drafting');
    const res = await fetch(`/api/ka/conversations/${encodeURIComponent(id)}/draft`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok || typeof d.text !== 'string') throw new Error(d.error || String(res.status));
    setText(d.text);
    setState('ready');
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    setThread(null);
    setText('');
    setError('');
    setState('loading');
    load(conversationId)
      .then(th => (th.messages.length && !th.messages[th.messages.length - 1].mine ? draft(conversationId) : setState('ready')))
      .catch(e => {
        setError(e instanceof Error ? e.message : '');
        setState('failed');
      });
  }, [conversationId, load, draft]);

  const send = async () => {
    if (!conversationId || !text.trim()) return;
    setState('sending');
    try {
      const res = await fetch(`/api/ka/conversations/${encodeURIComponent(conversationId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || String(res.status));
      setText('');
      await load(conversationId);
      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : '');
      setState('failed');
    }
  };

  const button = 'px-3 py-2 rounded text-xs font-semibold whitespace-nowrap disabled:opacity-50';

  return (
    <Sheet isOpen={conversationId !== null} onClose={onClose} title={thread?.other_name || t('chat.title')}>
      <div className="space-y-3" data-testid="chat">
        {thread && <p className="text-xs text-[#8FA6A1]">{thread.ad_title}</p>}
        <div className="space-y-2">
          {thread?.messages.map((m, i) => (
            <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] px-3 py-2 rounded text-sm whitespace-pre-wrap ${
                  m.mine ? 'bg-[#06322C] text-[#F2F5F4]' : 'bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4]'
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>
        {state === 'failed' && <p className="text-xs text-[#C9A227]">{error || t('chat.failed')}</p>}
        <textarea
          value={state === 'drafting' ? t('chat.drafting') : text}
          onChange={e => setText(e.target.value)}
          disabled={state === 'drafting' || state === 'loading' || state === 'sending'}
          rows={6}
          aria-label={t('chat.answer')}
          className="w-full px-3 py-2 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] text-sm leading-relaxed focus:outline-none focus:border-[#8FA6A1]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || state === 'sending' || state === 'drafting'}
            className={`${button} bg-[#E4D6BE] text-[#011F1F]`}
          >
            {state === 'sending' ? t('chat.sending') : state === 'sent' ? t('chat.sent') : t('chat.send')}
          </button>
          {conversationId && (
            <button
              type="button"
              onClick={() => draft(conversationId).catch(e => { setError(e instanceof Error ? e.message : ''); setState('failed'); })}
              disabled={state === 'drafting' || state === 'sending'}
              className={`${button} border border-[#0E4A40] text-[#F2F5F4]`}
            >
              {t('chat.again')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
};

export default ChatSheet;
