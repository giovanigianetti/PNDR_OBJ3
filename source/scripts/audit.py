import json, math
from pathlib import Path
import pandas as pd
R=Path(__file__).resolve().parents[1]
a=json.loads((R/'public/data/dashboard_obj3.json').read_text())['municipalities']
assert len(a)==len({x['code'] for x in a})==5570
assert len({x['rgiCode'] for x in a})==133
out={'municipalities':5570,'intermediate_regions':133,'years':{}}
for y in [2010,2022]:
 d=pd.read_stata(R/f'data/raw/censo_municipios_{y}_malha2022.dta',convert_categoricals=False);d.index=d.cd_mun2022.astype(int).astype(str)
 err=0
 for x in a:
  v=x[f'y{y}']; raw=d.loc[x['code']]
  for k,n in [('pop','v01006')]: assert abs(v[k]-raw[n])<1e-5
  for i,age in enumerate(v['ages']): assert abs(age-raw[f'v010{31+i}'])<1e-5
  assert all(math.isfinite(t) and t>=0 for t in [v['pop'],*v['ages']])
  assert abs(v['children']-sum(v['ages'][:3]))<1e-5
  assert abs(v['older60']-sum(v['ages'][9:]))<1e-5
  if v['pop']: assert abs(v['olderShare']-100*v['older60']/v['pop'])<1e-5
  if v['children']: assert abs(v['aging60']-100*v['older60']/v['children'])<1e-4
  if abs(sum(v['ages'])-v['pop'])>0.01:err+=1
 total=sum(x[f'y{y}']['pop'] for x in a)
 assert abs(total-d.v01006.sum())<0.01
 for group in ['rgiCode','ufCode','regionCode']:
  totals={}
  for x in a:totals[x[group]]=totals.get(x[group],0)+x[f'y{y}']['pop']
  assert abs(sum(totals.values())-total)<0.01
 out['years'][y]={'population_observed':total,'age_sum_differs_from_total_municipalities':err,'suppressed_cells':int(d.n_celulas_suprimidas.sum()),'municipalities_suppressed':int(d.flag_supressao.sum())}
for x in a:
 u,v=x['y2010'],x['y2022'];c=x['change']
 assert abs(c['pop']-(v['pop']-u['pop']))<1e-5
 if u['pop']:assert abs(c['popPct']-100*(v['pop']/u['pop']-1))<1e-5
for file,key,n in [('municipios_geo','codarea',5570),('rgi_geo','code',133)]:
 g=json.loads((R/f'public/data/{file}.json').read_text())['features']; assert len(g)==n
 codes={f['properties'][key] for f in g}; expected={x['code' if key=='codarea' else 'rgiCode'] for x in a}; assert codes==expected
out['status']='PASS';(R/'reports/AUDITORIA_GERAL.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
