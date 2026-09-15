export const isValidKleinanzeigenUrl = (urlStr: string): boolean => {
  try {
    return new URL(urlStr).hostname.includes('kleinanzeigen.de');
  } catch {
    return false;
  }
};

export const suggestTitleFromUrl = (urlStr: string): string => {
  try {
    const paths = new URL(urlStr).pathname.split('/');
    const candidate = paths.find(seg => {
      if (!seg || seg.startsWith('s-') || seg.includes(':')) return false;
      if (/^\d+$/.test(seg)) return false;
      if (seg.startsWith('k0') || seg.includes('+') || seg.includes('.')) return false;
      if (['suche', 'kategorie', 'anzeigen'].includes(seg.toLowerCase())) return false;
      return true;
    });
    return candidate ? decodeURIComponent(candidate).replace(/-/g, ' ').trim() : '';
  } catch {
    return '';
  }
};
