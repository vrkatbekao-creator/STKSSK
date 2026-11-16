import {useEffect,useRef} from 'react';
import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {useModalDialog} from './useModalDialog.ts';

export function MobileMapSheet({title,kind,dismiss,children}:{
 title:string;kind:'place'|'travel';dismiss:()=>void;children:ReactNode;
}){
 const {t}=useTranslation();
 const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const drag=useRef<{id:number;start:number}|null>(null);
 const onDismiss=useRef(dismiss);
 onDismiss.current=dismiss;
 const backdrop=useRef(false);
 useModalDialog(dialog);
 useEffect(()=>{heading.current?.focus();},[kind]);
 useEffect(()=>{
  const marker=crypto.randomUUID();
  const previous=history.state;
  history.pushState({...previous,a3Sheet:marker},'');
  const back=()=>{if(history.state?.a3Sheet!==marker)onDismiss.current();};
  window.addEventListener('popstate',back);
  return ()=>{
   window.removeEventListener('popstate',back);
   if(history.state?.a3Sheet===marker)history.back();
  };
 },[]);
 return <dialog ref={dialog} className="a3-mobile-sheet" aria-labelledby="a3-sheet-title"
  onCancel={e=>{e.preventDefault();dismiss();}}
  onPointerDown={e=>{backdrop.current=e.target===e.currentTarget;}}
  onClick={e=>{if(backdrop.current&&e.target===e.currentTarget)dismiss();}}>
  <section className="a3-sheet-body">
   <div className="a3-sheet-grab" aria-hidden="true" onPointerDown={e=>{
    if(!e.isPrimary)return;
    drag.current={id:e.pointerId,start:e.clientY};
    e.currentTarget.setPointerCapture(e.pointerId);
   }} onLostPointerCapture={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onPointerUp={e=>{
     const start=drag.current;
     drag.current=null;
     if(start?.id===e.pointerId&&e.clientY-start.start>60)dismiss();
    }}><span/></div>
   <header className="a3-drawer-head">
    <h2 id="a3-sheet-title" data-dialog-title ref={heading} tabIndex={-1}>{title}</h2>
    <button type="button" onClick={dismiss}>{t('close')}</button>
   </header>
   {children}
  </section>
 </dialog>;
}
