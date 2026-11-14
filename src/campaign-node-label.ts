import {wonders} from './game/campaign-map.ts';
import type {CampaignNode} from './game/campaign-map.ts';
import {mapLabel} from './map-language.ts';
export function nodeLabel(n:CampaignNode,lang:string,t:(key:string)=>string){
 const wonder=wonders.find(w=>w.id===n.wonderId);if(wonder)return mapLabel(wonder.name,lang);
 return n.sourcePlace&&n.name?`${t(`o_place_${n.placeType}`)} · ${mapLabel(n.name,lang)}`:t(`c_node_${n.kind}`);
}
