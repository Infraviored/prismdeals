import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChatSheet } from './ChatSheet';

/** Writing to the seller of a listing: the chat when there is one, else a first
 * message drafted in the buyer's tone, sent with one button. */
export const MessageDraft: React.FC<{ huntId: number; listingId: string }> = ({ huntId, listingId }) => {
  const { t } = useTranslation();
  const [conversation, setConversation] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'writing' | 'ready' | 'sending' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/ka/listings/${listingId}/conversation`)
      .then(r => (r.ok ? r.json() : { id: null }))
      .then(d => setConversation(d.id || null))
      .catch(() => {});
  }, [listingId]);

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : '');
    setState('failed');
  };

  const write = async () => {
    setState('writing');
    setError('');
    try {
      const res = await fetch(`/api/hunts/${huntId}/listings/${listingId}/message-draft`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok || typeof d.text !== 'string') throw new Error(d.error || String(res.status));
      setText(d.text);
      setState('ready');
    } catch (e) {
      fail(e);
    }
  };

  const send = async () => {
    setState('sending');
    try {
      const res = await fetch(`/api/ka/listings/${listingId}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || String(res.status));
      setConversation(d.id || null);
      setText('');
      setState('idle');
      if (d.id) setChatOpen(true);
    } catch (e) {
      fail(e);
    }
  };

  const button = 'px-3 py-2 rounded text-xs font-semibold whitespace-nowrap disabled:opacity-50';
  const quiet = `${button} border border-[#0E4A40] text-[#F2F5F4]`;

  if (conversation) {
    return (
      <div data-testid="message-draft">
        <button type="button" className={quiet} onClick={() => setChatOpen(true)}>{t('chat.open')}</button>
        <ChatSheet conversationId={chatOpen ? conversation : null} onClose={() => setChatOpen(false)} />
      </div>
    );
  }

  if (state === 'idle' || (state === 'failed' && !text)) {
    return (
      <div className="space-y-2" data-testid="message-draft">
        <button type="button" className={quiet} onClick={write}>{t('chat.write')}</button>
        {state === 'failed' && <p className="text-xs text-[#C9A227]">{error || t('chat.failed')}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="message-draft">
      <textarea
        value={state === 'writing' && !text ? t('chat.drafting') : text}
        onChange={e => setText(e.target.value)}
        disabled={state === 'writing' || state === 'sending'}
        rows={7}
        aria-label={t('chat.message')}
        className="w-full px-3 py-2 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] text-sm leading-relaxed focus:outline-none focus:border-[#8FA6A1]"
      />
      {state === 'failed' && <p className="text-xs text-[#C9A227]">{error || t('chat.failed')}</p>}
      <div className="flex gap-2">
        <button type="button" className={`${button} bg-[#E4D6BE] text-[#011F1F]`} disabled={!text.trim() || state === 'sending' || state === 'writing'} onClick={send}>
          {state === 'sending' ? t('chat.sending') : t('chat.send')}
        </button>
        <button type="button" className={quiet} disabled={state === 'writing' || state === 'sending'} onClick={write}>{t('chat.again')}</button>
      </div>
    </div>
  );
};

export default MessageDraft;
