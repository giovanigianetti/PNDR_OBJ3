import fs from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import ts from 'typescript';
async function load(path){const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const m=await load('../lib/migration.ts'), map=await load('../lib/map-classes.ts');
const read=n=>JSON.parse(fs.readFileSync(new URL('../public/data/'+n,import.meta.url)));
const ind=read('migration_indicators.json');const demo=read('dashboard_obj3.json').municipalities;
const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(.001,Math.abs(b)*1e-8),`${a} != ${b}`);
for(const year of [2010,2022]){
 const profiles=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(`../public/data/migration_profile_${year}.json.gz`,import.meta.url))));
 const base=m.municipalMigration(ind,null,year,m.emptyMigrationFilters);
 const viaProfiles=m.municipalMigration(ind,profiles,year,{...m.emptyMigrationFilters,role:'0'});
 const emig=m.municipalMigration(ind,profiles,year,{...m.emptyMigrationFilters,role:'1'});
 for(const [code,v]of base){close(v.immigrants,viaProfiles.get(code).immigrants);close(v.emigrants,emig.get(code).emigrants);if(v.pop===null)assert.equal(v.tx_saldo,null);else close(v.tx_saldo,1000*v.balance/v.pop);}
 const total=m.sumMigration([...base.values()]);assert.equal(total.balance,0);assert.equal(total.eficacia,0);assert.equal(total.coverage,year===2010?5565:5570);
 if(year===2022){assert.equal(total.pop,null);assert.equal(total.tx_volume,null);assert.equal(base.get('1504752').eficacia,-100);assert.equal(base.get('1504752').tx_emigracao,null);}
 else {assert.ok(total.tx_volume>0);assert.equal(base.has('1504752'),false);}
 const codes=new Set(demo.filter(r=>r.ufCode==='51').map(r=>r.code));
 const selected=m.selectProfiles(profiles,codes,m.emptyMigrationFilters);
 const state=m.sumMigration([...codes].map(c=>base.get(c)));
 for(const dim of ['type','region']){const parts=m.balanceParts(selected,dim);close(parts.reduce((s,p)=>s+p.balance,0),state.balance);close(parts.reduce((s,p)=>s+(p.share||0),0),100);}
 const national=m.balanceParts(profiles.rows,'type');assert.ok(national.every(p=>p.share===null));
 const filtered=m.selectProfiles(profiles,codes,{role:'1',type:'0',region:'0'});assert.ok(filtered.every(r=>r[1]===1&&r[2]===0&&r[3]===0));
 const combos=m.groupProfiles(selected,'combination');close(combos.reduce((s,[,r])=>s+m.summarizeProfile(r)[0],0),state.volume);
}
// Income and occupation-sector weights are not replaced by the migrant count.
const synthetic=[[1,0,0,0,100,100,20,50,30,20,20,20,20,20,60,30,20,50,10,20],[2,0,0,0,300,300,40,70,40,10,30,20,20,20,80,50,10,40,30,10]];
const summary=m.summarizeProfile(synthetic);close(summary[1],250);close(summary[2],35);close(summary[11],1100/30);
assert.equal(m.deriveMigration(100,0,0).eficacia,null);
assert.equal(m.sumMigration([null,undefined]),null);
for(const [values,mode,count]of [[Array.from({length:100},(_,i)=>i+1),'Decis',10],[Array.from({length:101},(_,i)=>i-50),'5 classes negativas',10]]){if(!Array.isArray(values))continue;const c=map.buildMapClasses(values,true);if(mode!=='unused'){assert.ok(c.mode.includes(mode));assert.equal(c.classes.length,count);}close(c.classes.reduce((s,r)=>s+r.count,0)+c.zeros,values.length);}
const sparse=map.buildMapClasses([-2,-1,0,...Array.from({length:100},(_,i)=>i+1)],true);assert.equal(sparse.classes.length,10);assert.ok(sparse.mode.startsWith('1 classe negativa'));assert.equal(map.mapClassColor(null,sparse),'#d7dee3');assert.equal(map.mapClassColor(0,sparse),'#fafafa');
console.log('PASS: municipal/profile reconciliation, weighted ratios, missing denominators, filters, signed shares, means and map classes.');
