"""Shapefiles locais derivados da geometria simplificada do painel OBJ1.
Não são as malhas originais integrais do IBGE. GeoJSON de exibição é lido
novamente dos shapefiles, garantindo equivalência com os arquivos locais.
"""
import json
from pathlib import Path
import shapefile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'shapefiles';OUT.mkdir(parents=True,exist_ok=True)
# Coordenadas geográficas, origem IBGE; SIRGAS 2000 (EPSG:4674).
PRJ='GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4674"]]'
for name,key,count in [('municipios_geo','codarea',5570),('rgi_geo','code',133)]:
    source=ROOT/'public'/'data'/f'{name}.json'
    geo=json.loads(source.read_text()); assert len(geo['features'])==count
    base=OUT/name
    with shapefile.Writer(str(base),shapeType=shapefile.POLYGON,encoding='utf-8') as w:
        w.field('code','C',10);w.field('name','C',150)
        for f in geo['features']:
            w.shape(f['geometry']);w.record(str(f['properties'][key]),f['properties'].get('name',''))
    base.with_suffix('.prj').write_text(PRJ);base.with_suffix('.cpg').write_text('UTF-8')
    with shapefile.Reader(str(base),encoding='utf-8') as r:
        out={'type':'FeatureCollection','features':[{'type':'Feature','properties':{key:sr.record['code'],'name':sr.record['name']},'geometry':sr.shape.__geo_interface__} for sr in r.iterShapeRecords()]}
    assert len(out['features'])==count
    source.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print('Shapefiles locais e GeoJSON: 5570 municípios / 133 regiões intermediárias.')
