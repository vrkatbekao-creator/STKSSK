import {useTranslation} from 'react-i18next';
import {languages,supportedLanguage} from './languages.ts';

export function LanguageSelect(){
 const {t,i18n}=useTranslation();
 return <select aria-label={t('language')} value={supportedLanguage(i18n.language)??'zh-TW'}
  onChange={event=>void i18n.changeLanguage(event.target.value)}>
  {Object.entries(languages).map(([code,label])=><option key={code} value={code} lang={code}>{label}</option>)}
 </select>;
}
