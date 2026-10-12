"""Rebuild browser GeoJSON from the local shapefiles. No remote geometry requests."""
from pathlib import Path
import json,shapefile
ROOT=Path(__file__).resolve().parents[1]
for name in ['municipios_geo','rgi_geo']:
 reader=shapefile.Reader(str(ROOT/'data/shapefiles'/name),encoding='utf-8')
 features=[]
 for rec in reader.iterShapeRecords():
  features.append({'type':'Feature','properties':rec.record.as_dict(),'geometry':rec.shape.__geo_interface__})
 (ROOT/'public/data'/f'{name}.json').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')))
 print(name,len(features))
