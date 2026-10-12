from pathlib import Path
import json
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/data'
data=json.loads((OUT/'dashboard_obj3.json').read_text());rows=data['municipalities'];codes={r['code'] for r in rows}
assert len(rows)==len(codes)==5570;assert len({r['rgiCode'] for r in rows})==508
report={'status':'PASS','municipalities':len(rows),'immediateRegions':508,'years':{}}
for y in [2010,2022]:
 df=pd.read_stata(ROOT/f'data/raw/censo_municipios_{y}_malha2022.dta',convert_categoricals=False).set_index('cd_mun2022')
 assert set(df.index)==codes
 for r in rows:
  a=r[f'y{y}'];src=df.loc[r['code']];assert abs(a['pop']-src.v01006)<1e-5
  for i,v in enumerate(a['ages']):assert abs(v-src[f'v010{31+i}'])<1e-5
  assert abs(sum(a['ages'][:3])-a['children'])<1e-4
  assert abs(sum(a['ages'][9:])-a['older60'])<1e-4
  for key,num,den in [('aging60',a['older60'],a['children']),('olderShare',a['older60'],a['pop'])]:
   if den:assert abs(a[key]-100*num/den)<1e-4
 report['years'][y]={'population':sum(r[f'y{y}']['pop'] for r in rows)}
geo=pd.read_excel(ROOT/'data/raw/tipologia_pndr3.xlsx').set_index('Código Município')
for r in rows:
 g=geo.loc[int(r['code'])];assert str(int(g['Código Região Geográfica Imediata']))==r['rgiCode'];assert g['Região Geográfica Imediata'].replace('¿','–')==r['rgi']
for name,key,expected in [('municipios_geo','codarea',codes),('rgi_geo','code',{r['rgiCode'] for r in rows})]:
 features=json.loads((OUT/f'{name}.json').read_text())['features'];assert len(features)==len(expected);assert {str(f['properties'][key]) for f in features}==expected
assert {k:len({r['typologyId'] for r in rows if r['dynamism']==k}) for k in ['Baixo Dinamismo','Médio Dinamismo','Alto Dinamismo']}=={'Baixo Dinamismo':228,'Médio Dinamismo':456,'Alto Dinamismo':229}
(ROOT/'reports/AUDITORIA_GERAL.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
