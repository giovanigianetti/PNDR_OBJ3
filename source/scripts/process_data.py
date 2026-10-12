"""Rebuild demographic municipal indicators from supplied DTA and PNDR Excel."""
from pathlib import Path
import json,re
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/data';RAW=ROOT/'data/raw'
old=json.loads((OUT/'dashboard_obj3.json').read_text());validation=json.loads((OUT/'validation.json').read_text())
geo=pd.read_excel(RAW/'tipologia_pndr3.xlsx');gdp='Taxa de variação do PIB per capita (2009-2021)';typ='Tipologia PNDR III Nacional FINAL'
ids=geo.drop_duplicates('ID Tipologia');assert len(ids)==913
q25,q75=ids[gdp].quantile([.25,.75]);dynamics={};mismatches=[]
for _,r in ids.iterrows():
 v=r[gdp];ref=re.search(r'(Alto|Médio|Baixo) Dinamismo',r[typ]);cl='Baixo Dinamismo' if v<=q25 else 'Alto Dinamismo' if v>=q75 else 'Médio Dinamismo'
 if v in [q25,q75] and ref:cl=ref.group()
 dynamics[int(r['ID Tipologia'])]=cl
 if ref and ref.group()!=cl:mismatches.append(int(r['ID Tipologia']))
assert not mismatches
bases={y:pd.read_stata(RAW/f'censo_municipios_{y}_malha2022.dta',convert_categoricals=False).set_index('cd_mun2022') for y in [2010,2022]}
def year(r):
 a=[float(r[f'v010{i}']) for i in range(31,42)];p=float(r.v01006);ch=sum(a[:3]);o=sum(a[9:]);return {'pop':p,'ages':a,'children':ch,'older60':o,'olderShare':100*o/p if p else None,'aging60':100*o/ch if ch else None}
def safe(v):
 if isinstance(v,dict):return {k:safe(x) for k,x in v.items()}
 if isinstance(v,list):return [safe(x) for x in v]
 if isinstance(v,str):return v.replace('¿','–')
 if isinstance(v,float):return round(v,6) if pd.notna(v) else None
 return v
rows=[]
for _,r in geo.iterrows():
 c=str(int(r['Código Município']));a,b=[safe(year(bases[y].loc[c])) for y in [2010,2022]];q0,q2=[bases[y].loc[c] for y in [2010,2022]]
 row={'code':c,'name':r['Município'],'ufCode':str(int(r['Código UF'])),'uf':r['UF'],'regionCode':int(r['Região']),'region':{1:'Norte',2:'Nordeste',3:'Sudeste',4:'Sul',5:'Centro-Oeste'}[int(r['Região'])],'immediateCode':str(int(r['Código Região Geográfica Imediata'])),'immediateName':r['Região Geográfica Imediata'],'rgiCode':str(int(r['Código Região Geográfica Imediata'])),'rgi':r['Região Geográfica Imediata'],'capitalRegion':None if pd.isna(r['Regiões de Capitais']) else r['Regiões de Capitais'],'typologyId':str(int(r['ID Tipologia'])),'typology':r[typ],'dynamism':dynamics[int(r['ID Tipologia'])],'gdpPcChange':float(r[gdp]),'y2010':a,'y2022':b,'change':{'pop':b['pop']-a['pop'],'popPct':100*(b['pop']/a['pop']-1) if a['pop'] else None,'aging60':b['aging60']-a['aging60'] if b['aging60'] is not None and a['aging60'] is not None else None,'aging60Pct':100*(b['aging60']/a['aging60']-1) if a['aging60'] and b['aging60'] is not None else None,'olderSharePp':b['olderShare']-a['olderShare'] if b['olderShare'] is not None and a['olderShare'] is not None else None},'quality':{'suppression2010':int(q0.flag_supressao),'suppression2022':int(q2.flag_supressao),'suppressedCells2010':int(q0.n_celulas_suprimidas),'suppressedCells2022':int(q2.n_celulas_suprimidas),'inconsistent2010':int(q0.flag_inconsistencia),'inconsistent2022':int(q2.flag_inconsistencia),'ratedSectors2010':int(q0.n_setores_rateados),'ratedPopulationPct2010':float(q0.pct_pop2010_rateada)}}
 rows.append(safe(row))
assert len(rows)==5570 and len({r['rgiCode'] for r in rows})==508
old['municipalities']=rows;old['meta'].update(q25Dynamism=round(q25,6),q75Dynamism=round(q75,6))
(OUT/'dashboard_obj3.json').write_text(json.dumps(old,ensure_ascii=False,separators=(',',':'),allow_nan=False))
print('Demografia: 5570 municípios; 508 RGI; dinamismo consistente.')
