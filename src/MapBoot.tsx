import {LanguageSelect} from './LanguageSelect.tsx';
import {useEffect,useRef,useState} from 'react';
import type {ComponentType} from 'react';
import {useTranslation} from 'react-i18next';
import {loadStreetRuntime} from './game/street-runtime.ts';
import {browserFeatures,missingFeatures} from './browser-capabilities.ts';
import {alphaMode,vehicleBase} from './game/browser-routing-mode.ts';
import {preloadVehiclePackages} from './game/vehicle-packages.ts';
import {KaohsiungWarmup} from './KaohsiungWarmup.tsx';
import './map-boot.css';
export default function MapBoot(){
 const {t}=useTranslation();
 const [App,setApp]=useState<ComponentType|null>(null);
 const [error,setError]=useState<'map'|'app'|null>(null);
 const [attempt,retry]=useState(0);
 const [quiz,setQuiz]=useState(false);
 const [hold,setHold]=useState(false);
 const [missing]=useState(()=>missingFeatures(browserFeatures()));
 const focusGame=useRef(false);

 useEffect(()=>{
  if(missing.length)return;
  let active=true;
  async function load(){
   // Vehicle bytes can arrive independently of the walking graph. Validation still
   // runs against the complete walking graph before any campaign or save opens.
   if(vehicleBase)preloadVehiclePackages(vehicleBase);
   try{await loadStreetRuntime();}
   catch{if(active)setError('map');return;}
   if(!active)return;
   try{
    const app=await import('./App.tsx');
    if(active)setApp(()=>app.default);
   }catch{if(active)setError('app');}
  }
  const timer=setTimeout(()=>void load(),0);
  return()=>{active=false;clearTimeout(timer);};
 },[attempt,missing]);

 const showGame=App!==null&&!hold&&!quiz;
 useEffect(()=>{
  if(showGame&&focusGame.current)document.getElementById('campaign-main')?.focus();
 },[showGame]);

 if(App&&showGame)return <App/>;
 return <main className="map-boot"><div>
  <div className="map-boot-header"><span aria-hidden="true">✦</span><div onFocus={()=>setHold(true)}><LanguageSelect/></div></div>
  <h1>{t('title')}</h1>
  <p role="status">{t(missing.length?'a_unsupported':error?'p_bootFailed':App?'p_bootReady':'p_bootLoading')}</p>
  {missing.length>0&&<ul>{missing.map(key=><li key={key}>{t(`a_feature_${key}`)}</li>)}</ul>}
  <div className="map-boot-actions">
   {error&&<button type="button" onClick={()=>{
    if(error==='app'){window.location.reload();return;}
    setError(null);retry(n=>n+1);
   }}>{t('p_retry')}</button>}
   {App&&<button type="button" className="map-boot-primary" onClick={()=>{focusGame.current=true;setHold(false);setQuiz(false);}}>{t('p_bootEnter')}</button>}
   {alphaMode&&!missing.length&&<button type="button" aria-expanded={quiz} onClick={()=>{setHold(true);setQuiz(!quiz);}}>{t('p_quizTitle')}</button>}
  </div>
  {quiz&&<KaohsiungWarmup/>}
 </div></main>;
}
