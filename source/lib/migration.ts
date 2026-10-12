export const migrationNames = {tx_imigracao:'Taxa de imigração',tx_emigracao:'Taxa de emigração',negativeMunicipalities:'Municípios com emigração > imigração',eficacia:'Eficácia migratória'};
export type MigrationVariable = keyof typeof migrationNames;
export type MigrationKey = `${MigrationVariable}_${2010|2022}`;
export const migrationLabels = Object.fromEntries([2010,2022].flatMap(y=>Object.entries(migrationNames).map(([k,v])=>[`${k}_${y}`,`${v} · ${y} (${k==='eficacia'?'%':k==='negativeMunicipalities'?'municípios':'‰'})`]))) as Record<MigrationKey,string>;
export type MigrationMetrics = {pop:number|null; immigrants:number; emigrants:number; balance:number; volume:number; tx_imigracao:number|null;tx_emigracao:number|null;tx_saldo:number|null;tx_volume:number|null;eficacia:number|null;coverage:number;rateCoverage:number;ratePop:number;rateImmigrants:number;rateEmigrants:number;negativeMunicipalities:number};
export type MigrationIndicators = {years:Record<string,Record<string,(number|null)[]>>; types:string[];regions:string[]};
export type ProfileData = {columns:string[];rows:(number|null)[][]};
export type MigrationFilters = {role:string;type:string;region:string};
export const emptyMigrationFilters:MigrationFilters={role:'',type:'',region:''};
export const profileFields = ['migrantes','renda_media','idade_media','pct_mulheres','pct_branca','pct_5a14','pct_15a24','pct_25a39','pct_40a59','pct_60mais','pct_ocupados','pct_primario','pct_industria','pct_servicos','pessoas_com_renda','ocupados_com_setor'];
export const profileLabels = ['Migrantes','Renda média','Idade média','Mulheres','Pessoas brancas','5 a 14 anos','15 a 24 anos','25 a 39 anos','40 a 59 anos','60 anos ou mais','Ocupados','Setor primário','Indústria','Serviços'];
export function matchesProfile(r:(number|null)[], f:MigrationFilters) {return (!f.role||String(r[1])===f.role)&&(!f.type||String(r[2])===f.type)&&(!f.region||String(r[3])===f.region);}
export function deriveMigration(pop:number|null,i:number,e:number,coverage=1):MigrationMetrics {
 const balance=Math.abs(i-e)<1e-6?0:i-e,volume=i+e;
 return {pop,immigrants:i,emigrants:e,balance,volume,coverage,rateCoverage:pop!==null&&pop>0?coverage:0,ratePop:pop||0,rateImmigrants:pop!==null&&pop>0?i:0,rateEmigrants:pop!==null&&pop>0?e:0,negativeMunicipalities:balance<0?1:0,tx_imigracao:pop?1000*i/pop:null,tx_emigracao:pop?1000*e/pop:null,tx_saldo:pop?1000*balance/pop:null,tx_volume:pop?1000*volume/pop:null,eficacia:volume?100*balance/volume:null};
}
/** Rates use identical available-case support for numerator and denominator.
 * Totals and municipality counts retain all observed records. */
export function sumMigration(rows:(MigrationMetrics|null|undefined)[], efficacyMode:'mean'|'ratio'='mean'):MigrationMetrics|null {
 const valid=rows.filter((r):r is MigrationMetrics=>!!r);if(!valid.length)return null;
 const sum=(key:keyof MigrationMetrics)=>valid.reduce((s,r)=>s+(r[key]||0),0);
 const m=deriveMigration(sum('ratePop')||null,sum('immigrants'),sum('emigrants'),sum('coverage'));
 m.rateCoverage=sum('rateCoverage');m.ratePop=sum('ratePop');m.rateImmigrants=sum('rateImmigrants');m.rateEmigrants=sum('rateEmigrants');
 m.tx_imigracao=m.ratePop?1000*m.rateImmigrants/m.ratePop:null;
 m.tx_emigracao=m.ratePop?1000*m.rateEmigrants/m.ratePop:null;
 m.tx_saldo=m.ratePop?1000*(m.rateImmigrants-m.rateEmigrants)/m.ratePop:null;
 m.tx_volume=m.ratePop?1000*(m.rateImmigrants+m.rateEmigrants)/m.ratePop:null;
 m.negativeMunicipalities=sum('negativeMunicipalities');
 if(efficacyMode==='mean'){const rates=valid.map(r=>r.eficacia).filter((x):x is number=>x!==null);m.eficacia=rates.length?rates.reduce((s,x)=>s+x,0)/rates.length:null;}
 return m;
}
export function municipalMigration(ind:MigrationIndicators|null,profiles:ProfileData|null,year:number,f:MigrationFilters):Map<string,MigrationMetrics> {
 const out=new Map<string,MigrationMetrics>(); if(!ind)return out;
 const filtered=!!(f.role||f.type||f.region); if(filtered&&!profiles)return out;
 for(const [code,r] of Object.entries(ind.years[year]))out.set(code,deriveMigration(r[0],filtered?0:r[1]||0,filtered?0:r[2]||0));
 if(filtered&&profiles){
  const counts=new Map<string,[number,number]>();
  for(const r of profiles.rows){if(!matchesProfile(r,f))continue;const c=String(r[0]);const v=counts.get(c)||[0,0];v[r[1]===0?0:1]+=r[4]||0;counts.set(c,v);}
  for(const [c,r]of out){const v=counts.get(c)||[0,0];out.set(c,deriveMigration(r.pop,v[0],v[1]));}
 }
 return out;
}
export function selectProfiles(data:ProfileData|null,codes:Set<string>,f:MigrationFilters){return data?.rows.filter(r=>codes.has(String(r[0]))&&matchesProfile(r,f))||[];}
export function summarizeProfile(rows:(number|null)[][]){
 return profileFields.slice(0,14).map((_,i)=>{
  if(!i)return rows.reduce((s,r)=>s+(r[4]||0),0);
  // Exact available denominators: income respondents and classified workers.
  // Remaining means use migrant counts; missing-specific denominators are not exported.
  const wi=i===1?18:i>=11?19:4;let n=0,d=0;
  for(const r of rows){const v=r[4+i],w=r[wi];if(v!==null&&w!==null&&w>0){n+=v*w;d+=w;}}
  return d?n/d:null;
 });
}
export function groupProfiles(rows:(number|null)[][],dimension:'combination'|'type'|'region'){
 const groups=new Map<string,(number|null)[][]>();for(const r of rows){const key=dimension==='combination'?`${r[1]}|${r[2]}|${r[3]}`:String(r[dimension==='type'?2:3]);const list=groups.get(key)||[];list.push(r);groups.set(key,list);}return [...groups.entries()];
}
export function balanceParts(rows:(number|null)[][],dimension:'type'|'region'){
 const parts=groupProfiles(rows,dimension).map(([key,rs])=>{const i=rs.filter(r=>r[1]===0).reduce((s,r)=>s+(r[4]||0),0),e=rs.filter(r=>r[1]===1).reduce((s,r)=>s+(r[4]||0),0);return {key,immigrants:i,emigrants:e,balance:Math.abs(i-e)<1e-6?0:i-e};});
 const total=parts.reduce((s,r)=>s+r.balance,0),zero=Math.abs(total)<1e-6;
 return parts.map(r=>({...r,share:zero?null:100*r.balance/total})).sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance));
}
