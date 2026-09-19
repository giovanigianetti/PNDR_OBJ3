import {useEffect,useRef} from 'react';
export function useMapZoom(){
 const svg=useRef<SVGSVGElement>(null),group=useRef<SVGGElement>(null),dragged=useRef(false);
 const view=useRef({x:0,y:0,k:1});
 const render=()=>{const v=view.current;group.current?.setAttribute('transform',`translate(${v.x},${v.y}) scale(${v.k})`);};
 const scale=(factor:number,cx:number,cy:number)=>{const v=view.current,k=Math.max(.5,Math.min(64,v.k*factor)),ratio=k/v.k;view.current={x:cx-(cx-v.x)*ratio,y:cy-(cy-v.y)*ratio,k};render();};
 const zoom=(factor:number)=>{const box=svg.current?.viewBox.baseVal;if(box)scale(factor,box.width/2,box.height/2);};
 const reset=()=>{view.current={x:0,y:0,k:1};render();};
 useEffect(()=>{
  const el=svg.current;if(!el)return;
  const points=new Map<number,{x:number;y:number}>();let start={x:0,y:0};
  const position=(e:{clientX:number;clientY:number})=>{const r=el.getBoundingClientRect();return {x:(e.clientX-r.left)*el.viewBox.baseVal.width/r.width,y:(e.clientY-r.top)*el.viewBox.baseVal.height/r.height};};
  const wheel=(e:WheelEvent)=>{e.preventDefault();const p=position(e);scale(Math.exp(-e.deltaY*.002),p.x,p.y);};
  const down=(e:PointerEvent)=>{if(e.pointerType==='mouse'&&e.button!==0)return;const p=position(e);start=p;dragged.current=false;points.set(e.pointerId,p);};
  const move=(e:PointerEvent)=>{const old=points.get(e.pointerId);if(!old)return;const p=position(e),before=[...points.values()];points.set(e.pointerId,p);const after=[...points.values()];if(Math.hypot(p.x-start.x,p.y-start.y)>4)dragged.current=true;
   if(before.length===2){dragged.current=true;const dist=(a:typeof before)=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);const d=dist(before);if(d>0){const bx=(before[0].x+before[1].x)/2,by=(before[0].y+before[1].y)/2;scale(dist(after)/d,bx,by);view.current.x+=(after[0].x+after[1].x)/2-bx;view.current.y+=(after[0].y+after[1].y)/2-by;}}
   else {view.current.x+=p.x-old.x;view.current.y+=p.y-old.y;}if(dragged.current&&!el.hasPointerCapture(e.pointerId))el.setPointerCapture(e.pointerId);render();};
  const up=(e:PointerEvent)=>{points.delete(e.pointerId);};
  el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  return ()=>{el.removeEventListener('wheel',wheel);el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);};
 },[]);
 return {svg,group,dragged,zoom,reset};
}
