import {useState} from 'react';
import {useTranslation} from 'react-i18next';

const questions=[
 {prompt:'p_quizDistricts',choices:['10','12','16'],answer:1},
 {prompt:'p_quizPier2',choices:['p_quizQijin','p_quizZuoying','p_quizYancheng'],answer:2},
 {prompt:'p_quizWeiwuying',choices:['p_quizFengshan','p_quizYancheng','p_quizQijin'],answer:0},
] as const;

export function KaohsiungWarmup(){
 const {t}=useTranslation();
 const [round,setRound]=useState(0);
 const [selected,select]=useState<number|null>(null);
 const {prompt,choices,answer}=questions[round];
 const labelled=(option:string)=>option.startsWith('p_')?t(option):option;

 return <section className="map-boot-quiz" aria-labelledby="boot-quiz-question">
  <h2 id="boot-quiz-question">{t(prompt)}</h2>
  <div className="map-boot-options">{choices.map((option,index)=><button key={option} type="button"
   aria-disabled={selected!==null} aria-pressed={selected===index}
   onClick={()=>{if(selected===null)select(index);}}>{labelled(option)}</button>)}</div>
  <p role="status">{selected!==null?t(selected===answer?'p_quizCorrect':'p_quizAnswer',{answer:labelled(choices[answer])}):''}</p>
  {selected!==null&&<button type="button" onClick={()=>{setRound((round+1)%questions.length);select(null);}}>{t(round===questions.length-1?'p_quizReplay':'p_quizNext')}</button>}
 </section>;
}
