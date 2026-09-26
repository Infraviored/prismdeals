import { en } from './en';
import { de } from './de';

export const translations = { en, de } as const;

export type Language = "en" | "de";
export type TranslationKeys = typeof translations.en;

type PathKeys<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: `${K}${PathKeys<T[K]> extends "" ? "" : "."}${PathKeys<T[K]>}`;
    }[keyof T & string];

export type TranslationPath = PathKeys<TranslationKeys>;
