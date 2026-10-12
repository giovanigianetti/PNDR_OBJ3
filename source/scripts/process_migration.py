"""Extract supplied Stata exports; do not impute absent municipalities or denominators."""
import gzip, json, math, hashlib
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data'
REPORT = ROOT / 'reports'
BASE = json.loads((OUT/'dashboard_obj3.json').read_text())
CODES = {m['code']: m for m in BASE['municipalities']}
FIELDS = ['migrantes','renda_media','idade_media','pct_mulheres','pct_branca','pct_5a14','pct_15a24','pct_25a39','pct_40a59','pct_60mais','pct_ocupados','pct_primario','pct_industria','pct_servicos','pessoas_com_renda','ocupados_com_setor']
def sheet(w, name):
    it=w[name].iter_rows(values_only=True); headers=next(it)
    return [dict(zip(headers,r)) for r in it]
def clean(x):
    return round(float(x),8) if isinstance(x,(int,float)) and math.isfinite(x) else None
def close(a,b):
    assert abs(a-b)<max(1e-5,abs(b)*1e-9),(a,b)
reports={}; indicators={'years':{}, 'types':[], 'regions':[]}
for year in [2010,2022]:
    path=ROOT/'data/raw'/f'Migracao_perfil_municipal_{year}_1.xlsx'
    w=openpyxl.load_workbook(path,read_only=True,data_only=True)
    ind=sheet(w,'Indicadores_municipais'); profiles=sheet(w,'Perfil_dos_migrantes')
    types=sorted({p['tipo'] for p in profiles}); regions=sorted({p['regiao_contraparte'] for p in profiles})
    assert all(p['tipo']==p['tipo_migracao'] for p in profiles), 'tipo e tipo_migracao diferem'
    if indicators['types']: assert types==indicators['types'] and regions==indicators['regions']
    indicators['types']=types;indicators['regions']=regions
    by={str(int(r['mun'])):r for r in ind};assert len(by)==len(ind)
    assert set(by)<=set(CODES)
    sums={c:[0.,0.] for c in by}; seen=set(); rows=[]; rgi_differences=[]
    for p in profiles:
        c=str(int(p['mun'])); assert c in by
        k=(c,p['papel'],p['tipo'],p['regiao_contraparte']);assert k not in seen;seen.add(k)
        role=0 if p['papel']=='Imigrante' else 1
        assert p['papel'] in ['Imigrante','Emigrante'] and p['migrantes']>0
        sums[c][role]+=p['migrantes']
        rows.append([int(c),role,types.index(p['tipo']),regions.index(p['regiao_contraparte'])]+[clean(p[f]) for f in FIELDS])
    for c,r in by.items():
        close(sums[c][0],r['imigrantes']);close(sums[c][1],r['emigrantes'])
        close(r['saldo'],r['imigrantes']-r['emigrantes']);close(r['volume'],r['imigrantes']+r['emigrantes'])
        for key,amount in [('tx_imigracao','imigrantes'),('tx_emigracao','emigrantes'),('tx_saldo','saldo'),('tx_volume','volume')]:
            if r['pop_5mais']:close(r[key],1000*r[amount]/r['pop_5mais'])
            else:assert r[key] is None
        if r['volume']:close(r['eficacia'],r['saldo']/r['volume'])
        if str(int(r['rgi']))!=CODES[c]['rgiCode']:rgi_differences.append({'code':c,'name':CODES[c]['name'],'migrationRgi':str(int(r['rgi'])),'pndrRgi':CODES[c]['rgiCode']})
    close(sum(r['imigrantes'] for r in ind),sum(r['emigrantes'] for r in ind))
    # Minimal columnar data: denominator + counts; ratios are derived at every geography.
    indicators['years'][str(year)]={c:[clean(r['pop_5mais']),clean(r['imigrantes']),clean(r['emigrantes'])] for c,r in by.items()}
    payload={'columns':['mun','papel','tipo','regiao_contraparte']+FIELDS,'rows':rows}
    raw=json.dumps(payload,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
    (OUT/f'migration_profile_{year}.json.gz').write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
    reports[str(year)]={'municipalities':len(by),'profileRows':len(rows),'sourceRgiCount':len({r['rgi'] for r in ind}),'absentMunicipalities':[{'code':c,'name':CODES[c]['name']} for c in sorted(set(CODES)-set(by))], 'missingDenominator':[c for c,r in by.items() if r['pop_5mais'] is None], 'rgiDifferences':rgi_differences, 'population5Plus':sum(r['pop_5mais'] or 0 for r in ind),'immigrants':sum(r['imigrantes'] for r in ind),'emigrants':sum(r['emigrantes'] for r in ind),'balance':sum(r['saldo'] for r in ind),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    print(year,reports[str(year)],flush=True)
(OUT/'migration_indicators.json').write_text(json.dumps(indicators,ensure_ascii=False,separators=(',',':'),allow_nan=False))
REPORT.mkdir(exist_ok=True)
(REPORT/'AUDITORIA_MIGRACAO.json').write_text(json.dumps({'status':'PASS','years':reports},ensure_ascii=False,indent=2))
