import {useMemo,useState} from 'react';import {useTranslation} from 'react-i18next';
import type {Cell} from './game/campaign-map.ts';
const PAGE_SIZE=200;
export function MapKeyboardControls({reachable,cells,current,onPreview}:{reachable:Map<string,number>;cells:Map<string,Cell>;current:string;onPreview:(id:string)=>void}){
 const {t}=useTranslation(),[chosen,setChosen]=useState(current),[open,setOpen]=useState(false),[page,setPage]=useState(0);
 const entries=useMemo(()=>open?[...reachable]:[],[open,reachable]),pages=Math.max(1,Math.ceil(entries.length/PAGE_SIZE)),active=Math.min(page,pages-1);
 const visible=entries.slice(active*PAGE_SIZE,(active+1)*PAGE_SIZE);
 const value=visible.some(([id])=>id===chosen)?chosen:visible[0]?.[0]??'';
 const changePage=(next:number)=>{const target=Math.max(0,Math.min(pages-1,next));setPage(target);setChosen(entries[target*PAGE_SIZE]?.[0]??'');};
 return <details className="map-keyboard-controls" onToggle={e=>setOpen(e.currentTarget.open)}><summary id="map-keyboard-title">{t('a_mapKeyboard')}</summary>{open&&<>
  <p id="map-keyboard-help">{t('a_mapKeyboardHelp')}</p><label>{t('a_chooseCell')}<select aria-describedby="map-keyboard-help" value={value} disabled={!visible.length} onChange={e=>setChosen(e.target.value)}>
   {!visible.length&&<option value="">{t('a_noReachable')}</option>}{visible.map(([id,cost])=>{const c=cells.get(id)!;return <option value={id} key={id}>{t('c_hexCell',{q:c.q,r:c.r,terrain:t(`c_terrain_${c.terrain}`),cost})}{id===current?` · ${t('a_currentCell')}`:''}</option>;})}
  </select></label>{pages>1&&<div><button type="button" className="outline-button" disabled={active===0} onClick={()=>changePage(active-1)}>{t('a_previousCells')}</button><span aria-live="polite"> {t('a_cellPage',{page:active+1,total:pages})} </span><button type="button" className="outline-button" disabled={active===pages-1} onClick={()=>changePage(active+1)}>{t('a_nextCells')}</button></div>}
  <button className="outline-button" disabled={!value||value===current} onClick={()=>onPreview(value)}>{t('a_previewCell')}</button><button className="outline-button" onClick={()=>document.getElementById('campaign-actions')?.focus()}>{t('a_toConfirm')}</button>
 </>}</details>;
}
