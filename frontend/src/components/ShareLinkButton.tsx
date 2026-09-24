import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';

/** Shares the address of what is on screen.
 *
 * The URL already names the find (#dashboard?campaignId=7&listingId=…), so
 * the link opens the same listing for whoever receives it. On a phone the
 * system share sheet, elsewhere the clipboard.
 */
export const ShareLinkButton: React.FC<{ title?: string | null }> = ({ title }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: title || undefined, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="shrink-0 py-3 px-4 rounded-[3px] border border-[#0E4A40] text-sm font-semibold text-[#F2F5F4] hover:border-[#8FA6A1] cursor-pointer"
    >
      {copied ? t('surface.linkCopied') : t('surface.shareLink')}
    </button>
  );
};

export default ShareLinkButton;
