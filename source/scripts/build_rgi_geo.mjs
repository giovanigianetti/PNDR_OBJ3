import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { merge, feature } from "topojson-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const topology = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/municipios_ibge_topo.json"), "utf8"),
);
const dashboard = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/dashboard_obj3.json"), "utf8"),
);

const byMunicipality = new Map(
  dashboard.municipalities.map((row) => [row.code, row]),
);
const grouped = new Map();

for (const geometry of topology.objects.BRMU.geometries) {
  const municipality = byMunicipality.get(String(geometry.properties.codarea));
  if (!municipality?.rgiCode) continue;
  const entry = grouped.get(municipality.rgiCode) ?? {
    code: municipality.rgiCode,
    name: municipality.rgi,
    geometries: [],
  };
  entry.geometries.push(geometry);
  grouped.set(municipality.rgiCode, entry);
}

const features = [...grouped.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((entry) => ({
    type: "Feature",
    properties: { code: entry.code, name: entry.name },
    geometry: merge(topology, entry.geometries),
  }));

const output = { type: "FeatureCollection", features };
fs.writeFileSync(
  path.join(root, "public/data/rgi_geo.json"),
  JSON.stringify(output),
);

console.log(JSON.stringify({ rgiFeatures: features.length }));

fs.writeFileSync(path.join(root,"public/data/municipios_geo.json"), JSON.stringify(feature(topology, topology.objects.BRMU)));
