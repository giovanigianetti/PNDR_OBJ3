export type MapClass = { lower:number; upper:number; color:string; count:number; label:string; values:number[] };
const red=['#67001f','#9f2548','#ce627d','#e8a4b2','#f5d9df'];
const green=['#eff8ed','#dcf0d5','#c4e5bb','#a4d6a0','#7fc381','#57ab67','#339050','#19753d','#075a2a','#00441b'];
const format=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumSignificantDigits:6}).format(n);
function quantile(a:number[],p:number){const i=(a.length-1)*p,l=Math.floor(i);return a[l]+(a[Math.ceil(i)]-a[l])*(i-l);}
function split(values:number[],n:number,negative:boolean):MapClass[]{
 if(!values.length)return [];
 const a=[...values].sort((x,y)=>x-y), cuts=Array.from({length:n-1},(_,i)=>quantile(a,(i+1)/n));
 // Limites repetidos são reunidos: valores iguais nunca recebem cores diferentes.
 const unique=[...new Set(cuts)].filter(v=>v<a[a.length-1]);
 const edges=[...unique,a[a.length-1]];let previous=-Infinity;
 return edges.map((upper,i)=>{const selected=a.filter(x=>x>previous&&x<=upper);const lower=i?previous:a[0];previous=upper;return {lower,upper,color:negative?red[Math.round(i*4/Math.max(edges.length-1,1))]:green[Math.round(i*9/Math.max(edges.length-1,1))],count:selected.length,label:`${i?'>' : '≥'} ${format(lower)} a ≤ ${format(upper)}`,values:selected};});
}
export function buildMapClasses(raw:number[],diverging:boolean){
 const values=raw.filter(Number.isFinite),negative=values.filter(x=>x<0),positive=values.filter(x=>x>0),zeros=values.filter(x=>x===0);
 if(!diverging||!negative.length)return {classes:split(values,10,false),separateZero:false,zeros:0,mode:'Decis (10 classes por percentis)'};
 const small=negative.length<20;
 return {classes:[...split(negative,positive.length?(small?1:5):10,true),...split(positive,small?9:5,false)],separateZero:true,zeros:zeros.length,mode:positive.length?(small?'1 classe negativa + 9 classes positivas':'5 classes negativas + 5 classes positivas'):'Decis dos valores negativos'};
}
export function mapClassColor(value:number|null,result:ReturnType<typeof buildMapClasses>){
 if(value===null||!Number.isFinite(value))return '#d7dee3';
 if(result.separateZero&&value===0)return '#fafafa';
 return result.classes.find(c=>value>=c.lower&&value<=c.upper)?.color??'#d7dee3';
}
