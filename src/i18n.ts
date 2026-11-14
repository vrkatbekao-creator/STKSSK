import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {languages,supportedLanguage} from './languages.ts';
import zh from './locales/zh-TW.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import fr from './locales/fr.json';
import nl from './locales/nl.json';
import simplified from './locales/zh-CN.json';

export function detectLanguage(){
 try {
  const saved=supportedLanguage(localStorage.getItem('capital-language')??'');
  if(saved)return saved;
 }catch{/* Storage is optional. */}
 return (navigator.languages??[navigator.language]).map(supportedLanguage).find(Boolean)??'zh-TW';
}

function updateDocument(language:string){
 const locale=supportedLanguage(language)??'zh-TW';
 document.documentElement.lang=locale==='zh-TW'?'zh-Hant':locale==='zh-CN'?'zh-Hans':locale;
 document.title=i18n.t('title');
}

void i18n.use(initReactI18next).init({
 resources:{'zh-TW':{translation:zh},en:{translation:en},ja:{translation:ja},fr:{translation:fr},nl:{translation:nl},'zh-CN':{translation:simplified}},
 supportedLngs:Object.keys(languages),lng:detectLanguage(),fallbackLng:'en',interpolation:{escapeValue:false},
 saveMissing:import.meta.env.DEV,missingKeyHandler:(_lng,_ns,key)=>{if(import.meta.env.DEV)console.warn('Missing translation:',key);},
});
i18n.on('languageChanged',language=>{
 try{localStorage.setItem('capital-language',language);}catch{/* Continue without persistence. */}
 updateDocument(language);
});
updateDocument(i18n.language);
export default i18n;
