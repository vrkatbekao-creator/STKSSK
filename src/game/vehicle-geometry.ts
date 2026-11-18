/** Route clipping to official game district outlines and 600 m sector grid. */
import type {VehicleGraphColumns} from './vehicle-graph-format.ts';
import type {VehicleLegPlan} from './vehicle-leg-planner.ts';
import type {CoverageFragment} from './campaign-motorcade.ts';
import {vehicleEdgeQuarterMetres} from './vehicle-routing.ts';

import {outreachPolicy} from './campaign-outreach.ts';

type Point=readonly [number,number];
export type CoverageDistrict={id:string;rings:readonly (readonly (readonly number[])[])[]};
const cross=(ax:number,ay:number,bx:number,by:number)=>ax*by-ay*bx;

/** TWD97 TM2 / EPSG:3826; local origin agrees with the existing city map. */
export const VEHICLE_ORIGIN=[180000,2505000] as const;
export function projectVehiclePoint(lon:number,lat:number):[number,number]{
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<119.5||lon>123||lat<21.5||lat>27)throw new RangeError('Outside vehicle projection');
 const a=6378137,f=1/298.257222101,k=.9999,e2=2*f-f*f,ep2=e2/(1-e2),phi=lat*Math.PI/180,lam=(lon-121)*Math.PI/180;
 const s=Math.sin(phi),c=Math.cos(phi),t=Math.tan(phi),N=a/Math.sqrt(1-e2*s*s),T=t*t,C=ep2*c*c,A=c*lam;
 const e4=e2*e2,e6=e4*e2,M=a*((1-e2/4-3*e4/64-5*e6/256)*phi-(3*e2/8+3*e4/32+45*e6/1024)*Math.sin(2*phi)+
  (15*e4/256+45*e6/1024)*Math.sin(4*phi)-(35*e6/3072)*Math.sin(6*phi));
 const east=250000+k*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120);
 const north=k*(M+N*t*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720));
 return [east-VEHICLE_ORIGIN[0],VEHICLE_ORIGIN[1]-north];
}

function onSegment(p:Point,a:readonly number[],b:readonly number[]){
 const dx=b[0]-a[0],dy=b[1]-a[1],px=p[0]-a[0],py=p[1]-a[1];
 if(dx===0&&dy===0)return Math.hypot(px,py)<=1e-7;
 return Math.abs(cross(dx,dy,px,py))<=1e-7*Math.max(1,Math.hypot(dx,dy))&&px*dx+py*dy>=-1e-7&&px*dx+py*dy<=dx*dx+dy*dy+1e-7;
}
function inside(point:Point,rings:CoverageDistrict['rings']){
 let inside=false;for(const ring of rings){for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if(onSegment(point,a,b))return true;
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }}return inside;
}
export function vehiclePointDistrict(point:Point,districts:readonly CoverageDistrict[]):string|null{
 return districts.filter(d=>inside(point,d.rings)).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id??null;
}

/** Canonical orientation is used for both directions so repeated intervals match. */
export function clipVehicleSegment(a:Point,b:Point,length:number,key:string,districts:readonly CoverageDistrict[]):CoverageFragment[]{
 if(!Number.isSafeInteger(length)||length<1||!key||![...a,...b].every(Number.isFinite))throw new RangeError('Invalid coverage segment');
 const dx=b[0]-a[0],dy=b[1]-a[1],norm=dx*dx+dy*dy;if(!norm)return [];
 const cuts=[0,1],add=(t:number)=>{if(t>1e-10&&t<1-1e-10)cuts.push(t);};
 const sector=outreachPolicy.sectorMetres;
 for(const [origin,delta] of [[a[0],dx],[a[1],dy]])if(delta!==0){
  const lo=Math.min(origin,origin+delta),hi=Math.max(origin,origin+delta);
  for(let line=(Math.floor(lo/sector)+1)*sector;line<hi;line+=sector)add((line-origin)/delta);
 }
 for(const district of districts)for(const ring of district.rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const p=ring[j],q=ring[i],sx=q[0]-p[0],sy=q[1]-p[1],den=cross(dx,dy,sx,sy),px=p[0]-a[0],py=p[1]-a[1];
  if(Math.abs(den)>1e-10){const t=cross(px,py,sx,sy)/den,u=cross(px,py,dx,dy)/den;if(t>=0&&t<=1&&u>=0&&u<=1)add(t);}
  else if(Math.abs(cross(px,py,dx,dy))<1e-7*Math.max(1,Math.sqrt(norm))){add((px*dx+py*dy)/norm);add(((q[0]-a[0])*dx+(q[1]-a[1])*dy)/norm);}
 }
 cuts.sort((x,y)=>x-y);const distinct=cuts.filter((t,i)=>i===0||t-cuts[i-1]>1e-10),result:CoverageFragment[]=[];
 for(let i=1;i<distinct.length;i++){
  const lo=distinct[i-1],hi=distinct[i],mid=(lo+hi)/2,p:Point=[a[0]+dx*mid,a[1]+dy*mid];
  const district=vehiclePointDistrict(p,districts);if(!district)continue;
  const start=Math.round(lo*length),end=Math.round(hi*length);if(end<=start)continue;
  result.push({segment:key,sector:`${district}:${Math.floor(p[0]/sector)},${Math.floor(p[1]/sector)}`,district,start,end,segmentLength:length});
 }
 return result;
}

/** Verify ordered edges before deriving fragments; never credit travel outside Taipei. */
export function vehicleRouteFragments(graph:VehicleGraphColumns,plan:VehicleLegPlan,districts:readonly CoverageDistrict[]):CoverageFragment[]{
 if(plan.nodeIndices.length!==plan.edgeIndices.length+1)throw new RangeError('Invalid vehicle route');
 const cache=new Map<number,[number,number]>(),point=(i:number)=>{let p=cache.get(i);if(!p){p=projectVehiclePoint(graph.longitudes[i],graph.latitudes[i]);cache.set(i,p);}return p;};
 const fragments:CoverageFragment[]=[];
 for(let i=0;i<plan.edgeIndices.length;i++){
  const from=plan.nodeIndices[i],to=plan.nodeIndices[i+1],edge=plan.edgeIndices[i];
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=graph.ids.length||to>=graph.ids.length||
   !Number.isInteger(edge)||edge<graph.offsets[from]||edge>=graph.offsets[from+1]||graph.targets[edge]!==to)throw new RangeError('Invalid vehicle route edge');
  const forward=graph.ids[from]<graph.ids[to],first=forward?from:to,last=forward?to:from;
  const id=`${graph.ways[edge]}:${graph.ids[first]}:${graph.ids[last]}`;
  const parts=clipVehicleSegment(point(first),point(last),vehicleEdgeQuarterMetres(graph.metres[edge]),id,districts);
  fragments.push(...(forward?parts:parts.reverse()));
 }
 return fragments;
}
