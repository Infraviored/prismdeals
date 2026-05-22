import { useState, useEffect } from 'react';
import { translations } from '../i18n/translations';
import type { Language } from '../i18n/translations';

// Keep a list of active listeners to sync state across all components simultaneously
const listeners = new Set<(lang: Language) => void>();

let globalLang: Language = (() => {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('ui-lang') as Language) || 'en';
  }
  return 'en';
})();

export function useTranslation() {
  const [lang, setLangState] = useState<Language>(globalLang);

  useEffect(() => {
    const handler = (newLang: Language) => setLangState(newLang);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const setLang = (newLang: Language) => {
    globalLang = newLang;
    localStorage.setItem('ui-lang', newLang);
    listeners.forEach((listener) => listener(newLang));
  };

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'de' : 'en');
  };

  const t = (
    path: string,
    replacements?: Record<string, string | number>
  ): string => {
    const keys = path.split('.');
    let current: unknown = translations[lang];
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        // Fallback to English if key is missing in active language
        let fallback: unknown = translations['en'];
        for (const fKey of keys) {
          if (fallback && typeof fallback === 'object' && fKey in (fallback as Record<string, unknown>)) {
            fallback = (fallback as Record<string, unknown>)[fKey];
          } else {
            return path;
          }
        }
        current = fallback;
        break;
      }
    }

    if (typeof current !== 'string') {
      return path;
    }

    let result = current;
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      });
    }

    return result;
  };

  return { t, lang, setLang, toggleLanguage };
}
