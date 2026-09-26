import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChatSheet } from './ChatSheet';

interface Reminder {
  id: string;
  ad_title: string | null;
  other_name: string | null;
  last_text: string | null;
}

/** Sellers who answered and have not been read: one line each, a tap opens the chat. */
export const KaReminders: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<Reminder[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/ka/reminders')
      .then(r => (r.ok ? r.json() : { reminders: [] }))
      .then(d => setItems(d.reminders || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <>
      {items.length > 0 && (
        <section className="panel" data-testid="ka-reminders">
          <h2>{t('chat.newAnswers', { count: items.length })}</h2>
          <ul className="space-y-1 mt-2">
            {items.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className="w-full text-left py-2 border-b border-[#0E4A40]">
                  <span className="block text-sm text-[#F2F5F4] truncate">
                    {r.other_name ? `${r.other_name} · ` : ''}{r.ad_title}
                  </span>
                  <span className="block text-xs text-[#8FA6A1] truncate">{r.last_text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ChatSheet
        conversationId={open}
        onClose={() => {
          setOpen(null);
          load();
        }}
      />
    </>
  );
};

export default KaReminders;
