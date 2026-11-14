import {lazy,Suspense} from 'react';
import {useTranslation} from 'react-i18next';
import CampaignApp from './CampaignApp.tsx';
import {alphaMode,useCampaign} from './game/campaign-store.ts';
const AlphaCampaign=lazy(()=>import('./AlphaCampaign.tsx').then(m=>({default:m.AlphaCampaign})));

export default function App(){
 const started=useCampaign(s=>s.started),{t}=useTranslation();
 return alphaMode&&started?<Suspense fallback={<p role="status">{t('loadingMap')}</p>}><AlphaCampaign/></Suspense>:<CampaignApp/>;
}
