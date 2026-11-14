import simplifiedNames from './locales/map-zh-CN.json';
import {mapLanguage,supportedLanguage} from './languages.ts';

type SourceLabel = {'zh-TW':string;en:string};
const simplified:Readonly<Record<string,string>> = simplifiedNames;
const japanese:Readonly<Record<string,string>>={
 '北投區':'北投区','士林區':'士林区','內湖區':'内湖区','南港區':'南港区',
 '松山區':'松山区','信義區':'信義区','大安區':'大安区','中山區':'中山区',
 '大同區':'大同区','中正區':'中正区','萬華區':'万華区','文山區':'文山区',
 '北投溫泉博物館':'北投温泉博物館','國立故宮博物院':'国立故宮博物院',
 '碧山巖開漳聖王廟':'碧山巌開漳聖王廟','臺北流行音樂中心':'台北流行音楽センター',
 '饒河街觀光夜市':'饒河街観光夜市','台北101':'台北101','大安森林公園':'大安森林公園',
 '臺北市立美術館':'台北市立美術館','大稻埕碼頭_大稻埕碼頭貨櫃市集':'大稲埕埠頭',
 '國立中正紀念堂':'国立中正紀念堂','艋舺龍山寺':'艋舺龍山寺','臺北市立動物園':'台北市立動物園',
};

export function mapLabel(label:SourceLabel,language:string){
 const locale=supportedLanguage(language);
 if(locale==='zh-CN')return simplified[label['zh-TW']]??label['zh-TW'];
 if(locale==='ja'&&japanese[label['zh-TW']])return japanese[label['zh-TW']];
 return label[mapLanguage(language)]||label['zh-TW'];
}
