export const languages = {
 'zh-TW': '繁體中文',
 en: 'English',
 ja: '日本語',
 fr: 'Français',
 nl: 'Nederlands',
 'zh-CN': '简体中文',
} as const;

export type Language = keyof typeof languages;

export function supportedLanguage(value: string): Language | undefined {
 const locale = value.toLowerCase();
 if (/^zh-(hans|cn|sg)(-|$)/.test(locale)) return 'zh-CN';
 if (/^zh(-|$)/.test(locale)) return 'zh-TW';
 const primary = locale.split('-')[0];
 return primary === 'en' || primary === 'ja' || primary === 'fr' || primary === 'nl' ? primary : undefined;
}

export function mapLanguage(value: string): 'zh-TW' | 'en' {
 const locale = supportedLanguage(value);
 return locale === 'zh-TW' || locale === 'zh-CN' ? 'zh-TW' : 'en';
}
