type Point={x:number;y:number};

export function createMapTapGesture(tolerance=8){
 const pointers=new Map<number,Point>();
 let blocked=false;
 let eligible=false;
 return {
  start(id:number,point:Point){
   if(!pointers.size){blocked=false;eligible=false;}
   pointers.set(id,point);
   if(pointers.size>1)blocked=true;
  },
  move(id:number,point:Point){
   const first=pointers.get(id);
   if(first&&Math.hypot(point.x-first.x,point.y-first.y)>tolerance)blocked=true;
  },
  end(id:number,inside:boolean){
   if(!pointers.delete(id))return;
   if(!inside)blocked=true;
   eligible=!pointers.size&&!blocked;
  },
  consume(){
   const accepted=eligible;
   eligible=false;
   return accepted;
  },
 };
}
