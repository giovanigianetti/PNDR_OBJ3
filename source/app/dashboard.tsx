"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { geoMercator, geoPath } from "d3-geo";
import {
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  Eraser,
  FileCheck2,
  Info,
  Map as MapIcon,
  Search,
  SlidersHorizontal,
  Table2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type YearMetrics = {
  pop: number;
  ages: number[];
  children: number;
  older60: number;
  olderShare: number | null;
  aging60: number | null;
};

type ChangeMetrics = {
  pop: number;
  popPct: number | null;
  aging60: number | null;
  aging60Pct: number | null;
  olderSharePp: number | null;
};

type Quality = {
  suppression2010: number;
  suppression2022: number;
  suppressedCells2010: number;
  suppressedCells2022: number;
  inconsistent2010: number;
  inconsistent2022: number;
  ratedSectors2010: number;
  ratedPopulationPct2010: number | null;
};

type Municipality = {
  code: string;
  name: string;
  ufCode: string;
  uf: string;
  regionCode: number;
  region: string;
  rgiCode: string;
  rgi: string;
  capitalRegion: string | null;
  typologyId: string;
  typology: string;
  dynamism: string;
  gdpPcChange: number;
  y2010: YearMetrics;
  y2022: YearMetrics;
  change: ChangeMetrics;
  quality: Quality;
};

type Territory = Municipality & { municipalityCount: number };

type DashboardData = {
  meta: {
    title: string;
    subtitle: string;
    municipalities: number;
    ageLabels: string[];
    agingIndex: string;
    q25Dynamism: number;
    q75Dynamism: number;
  };
  municipalities: Municipality[];
};

type Validation = {
  uniqueMunicipalities: Record<string, number>;
  suppression: Record<string, number>;
  dynamism: {
    uniqueTypologyIds: number;
    q25: number;
    q75: number;
    counts: Record<string, number>;
    comparableIds: number;
    matchingIds: number;
    comparableMunicipalities: number;
    matchingMunicipalities: number;
    mismatches: Record<string, unknown>[];
  };
  limitations: string[];
};

type GeoFeature = {
  type: "Feature";
  properties: Record<string, string>;
  geometry: GeoJSON.Geometry;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

type MetricKey =
  | "popAbsolute"
  | "aging2010"
  | "olderShare2010"
  | "pop2022"
  | "popPct"
  | "aging2022"
  | "agingPct"
  | "olderShare2022"
  | "olderSharePp";

const metricLabels: Record<MetricKey, string> = {
  popAbsolute: "Variação da população (pessoas)",
  aging2010: "Índice de envelhecimento 2010 (60+/0–14)",
  olderShare2010: "População com 60 anos ou mais em 2010 (%)",
  pop2022: "População em 2022",
  popPct: "Variação da população (%)",
  aging2022: "Índice de envelhecimento 2022 (60+/0–14)",
  agingPct: "Variação do índice de envelhecimento (%)",
  olderShare2022: "População com 60 anos ou mais (%)",
  olderSharePp: "Variação da participação de idosos (p.p.)",
};

const dynamismColors: Record<string, string> = {
  "Alto Dinamismo": "#16826f",
  "Médio Dinamismo": "#d29a35",
  "Baixo Dinamismo": "#a74c63",
  "Múltiplas classes": "#6b7f90",
};

const compactNumber = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const integerNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalNumber = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmt(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sem dado";
  return `${decimalNumber.format(value)}${suffix}`;
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sem dado";
  return `${value > 0 ? "+" : ""}${decimalNumber.format(value)}%`;
}

function uniqueLabel(values: string[], fallback: string) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length === 1 ? unique[0] : fallback;
}

function yearFromAges(ages: number[], pop: number): YearMetrics {
  const children = ages.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const older60 = ages.slice(9, 11).reduce((sum, value) => sum + value, 0);
  return {
    pop,
    ages,
    children,
    older60,
    olderShare: pop ? (100 * older60) / pop : null,
    aging60: children ? (100 * older60) / children : null,
  };
}

function deriveChange(y2010: YearMetrics, y2022: YearMetrics): ChangeMetrics {
  return {
    pop: y2022.pop - y2010.pop,
    popPct: y2010.pop ? 100 * (y2022.pop / y2010.pop - 1) : null,
    aging60:
      y2010.aging60 !== null && y2022.aging60 !== null
        ? y2022.aging60 - y2010.aging60
        : null,
    aging60Pct:
      y2010.aging60 && y2022.aging60 !== null
        ? 100 * (y2022.aging60 / y2010.aging60 - 1)
        : null,
    olderSharePp:
      y2010.olderShare !== null && y2022.olderShare !== null
        ? y2022.olderShare - y2010.olderShare
        : null,
  };
}

function aggregateMunicipalities(
  rows: Municipality[],
  identity: Partial<Municipality> & Pick<Municipality, "code" | "name">,
): Territory {
  const ages2010 = Array(11).fill(0);
  const ages2022 = Array(11).fill(0);
  let pop2010 = 0;
  let pop2022 = 0;
  for (const row of rows) {
    pop2010 += row.y2010.pop;
    pop2022 += row.y2022.pop;
    row.y2010.ages.forEach((value, index) => (ages2010[index] += value));
    row.y2022.ages.forEach((value, index) => (ages2022[index] += value));
  }
  const y2010 = yearFromAges(ages2010, pop2010);
  const y2022 = yearFromAges(ages2022, pop2022);
  const first = rows[0];
  return {
    ...first,
    ...identity,
    code: identity.code,
    name: identity.name,
    typology: uniqueLabel(rows.map((row) => row.typology), "Múltiplas tipologias"),
    typologyId: uniqueLabel(rows.map((row) => row.typologyId), "Múltiplos IDs"),
    dynamism: uniqueLabel(rows.map((row) => row.dynamism), "Múltiplas classes"),
    gdpPcChange:
      rows.reduce((sum, row) => sum + row.gdpPcChange, 0) / Math.max(rows.length, 1),
    y2010,
    y2022,
    change: deriveChange(y2010, y2022),
    municipalityCount: rows.length,
    quality: {
      suppression2010: rows.some((row) => row.quality.suppression2010) ? 1 : 0,
      suppression2022: rows.some((row) => row.quality.suppression2022) ? 1 : 0,
      suppressedCells2010: rows.reduce((sum, row) => sum + row.quality.suppressedCells2010, 0),
      suppressedCells2022: rows.reduce((sum, row) => sum + row.quality.suppressedCells2022, 0),
      inconsistent2010: rows.some((row) => row.quality.inconsistent2010) ? 1 : 0,
      inconsistent2022: rows.some((row) => row.quality.inconsistent2022) ? 1 : 0,
      ratedSectors2010: rows.reduce((sum, row) => sum + row.quality.ratedSectors2010, 0),
      ratedPopulationPct2010: null,
    },
  };
}

function getMetric(row: Territory | Municipality, metric: MetricKey) {
  switch (metric) {
    case "popAbsolute": return row.change.pop;
    case "aging2010": return row.y2010.aging60;
    case "olderShare2010": return row.y2010.olderShare;
    case "pop2022":
      return row.y2022.pop;
    case "popPct":
      return row.change.popPct;
    case "aging2022":
      return row.y2022.aging60;
    case "agingPct":
      return row.change.aging60Pct;
    case "olderShare2022":
      return row.y2022.olderShare;
    case "olderSharePp":
      return row.change.olderSharePp;
  }
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
}

function blend(a: string, b: string, t: number) {
  const aa = hexToRgb(a);
  const bb = hexToRgb(b);
  const parts = aa.map((value, index) => Math.round(value + (bb[index] - value) * t));
  return `rgb(${parts.join(",")})`;
}

function colorFor(value: number | null, metric: MetricKey, min: number, max: number) {
  if (value === null || !Number.isFinite(value)) return "#d7dee3";
  const diverging = ["popAbsolute", "popPct", "agingPct", "olderSharePp"].includes(metric);
  if (diverging) {
    if (value < 0) return blend("#f3edf0", "#9d4258", Math.min(1, value / Math.min(min, -0.0001)));
    return blend("#f2f3ef", "#087c68", Math.min(1, value / Math.max(max, 0.0001)));
  }
  const t = (value - min) / Math.max(max - min, 0.0001);
  return blend("#e6f1ef", "#075d55", Math.max(0, Math.min(1, t)));
}

function Kpi({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <Card className={`kpi-card kpi-${tone}`}>
      <CardContent className="p-0">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MapPanel({
  level,
  municipalityFeatures,
  rgiFeatures,
  territories,
  metric,
  selectedCode,
  onSelect,
}: {
  level: "municipality" | "rgi";
  municipalityFeatures: GeoFeature[];
  rgiFeatures: GeoFeature[];
  territories: Territory[];
  metric: MetricKey;
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<{ row: Territory; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!holder.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);

  const height = width < 560 ? 430 : 540;
  const rows = useMemo(() => new Map(territories.map((row) => [row.code, row])), [territories]);
  const features = level === "municipality" ? municipalityFeatures : rgiFeatures;
  const collection = useMemo(
    () => ({ type: "FeatureCollection", features }) as GeoJSON.FeatureCollection,
    [features],
  );
  const path = useMemo(() => {
    if (!features.length) return null;
    const projection = geoMercator().fitExtent(
      [
        [10, 10],
        [width - 10, height - 10],
      ],
      collection,
    );
    return geoPath(projection);
  }, [collection, features.length, height, width]);
  const values = territories.map((row) => getMetric(row, metric)).filter((value): value is number => value !== null && Number.isFinite(value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  return (
    <div className="map-wrap" ref={holder}>
      <svg className="territorial-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Mapa de ${metricLabels[metric]}`}>
        <rect width={width} height={height} fill="#eaf0f1" />
        {path &&
          features.map((shape, index) => {
            const code = level === "municipality" ? String(shape.properties.codarea) : String(shape.properties.code);
            const row = rows.get(code);
            const value = row ? getMetric(row, metric) : null;
            const d = path(shape as GeoJSON.Feature) ?? undefined;
            return (
              <path
                key={`${code}-${index}`}
                d={d}
                fill={row ? colorFor(value, metric, min, max) : "#cfd8dd"}
                fillOpacity={row ? 1 : 0.25}
                stroke={selectedCode === code ? "#0c263b" : "#ffffff"}
                strokeWidth={selectedCode === code ? 1.8 : level === "municipality" ? 0.16 : 0.55}
                className={row ? "map-shape" : "map-shape muted-shape"}
                onMouseMove={(event) => {
                  if (!row || !holder.current) return;
                  const rect = holder.current.getBoundingClientRect();
                  setHover({ row, x: event.clientX - rect.left, y: event.clientY - rect.top });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => row && onSelect(code)}
              />
            );
          })}
      </svg>
      {hover && (
        <div className="map-tooltip" style={{ left: Math.min(hover.x + 12, width - 245), top: hover.y + 10 }}>
          <strong>{hover.row.name}</strong>
          <span>{level === "municipality" ? `${hover.row.uf} · ${hover.row.rgi}` : `${hover.row.municipalityCount} municípios`}</span>
          <b>{metricLabels[metric]}: {["pop2022", "popAbsolute"].includes(metric) ? integerNumber.format(getMetric(hover.row, metric) ?? 0) : fmt(getMetric(hover.row, metric), metric === "olderSharePp" ? " p.p." : ["aging2022", "aging2010"].includes(metric) ? " por 100" : "%")}</b>
          <small>{hover.row.dynamism}</small>
        </div>
      )}
      <div className="map-legend">
        <span>{metric === "pop2022" ? compactNumber.format(min) : fmt(min)}</span>
        <i style={{background: `linear-gradient(to right, ${Array.from({length:21},(_,i) => `${colorFor(min+(max-min)*i/20, metric, min, max)} ${i*5}%`).join(", ")})`}} />
        <span>{metric === "pop2022" ? compactNumber.format(max) : fmt(max)}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [municipalityFeatures, setMunicipalityFeatures] = useState<GeoFeature[]>([]);
  const [rgiFeatures, setRgiFeatures] = useState<GeoFeature[]>([]);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<"municipality" | "rgi">("municipality");
  const [regionFilter, setRegionFilter] = useState("");
  const [ufFilter, setUfFilter] = useState("");
  const [rgiFilter, setRgiFilter] = useState("");
  const [municipalityFilter, setMunicipalityFilter] = useState("");
  const [typologyFilter, setTypologyFilter] = useState("");
  const [dynamismFilter, setDynamismFilter] = useState("");
  const [mapMetric, setMapMetric] = useState<MetricKey>("popPct");
  const [selectedCode, setSelectedCode] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [aggregateLevel, setAggregateLevel] = useState<"uf" | "region" | "brasil">("uf");

  useEffect(() => {
    Promise.all([
      fetch("./data/dashboard_obj3.json").then((response) => response.ok ? response.json() : Promise.reject(new Error(`Arquivo indisponível: ${response.url} (HTTP ${response.status})`))),
      fetch("./data/validation.json").then((response) => response.ok ? response.json() : Promise.reject(new Error(`Arquivo indisponível: ${response.url} (HTTP ${response.status})`))),
      fetch("./data/municipios_geo.json").then((response) => response.ok ? response.json() : Promise.reject(new Error(`Arquivo indisponível: ${response.url} (HTTP ${response.status})`))),
      fetch("./data/rgi_geo.json").then((response) => response.ok ? response.json() : Promise.reject(new Error(`Arquivo indisponível: ${response.url} (HTTP ${response.status})`))),
    ])
      .then(([dashboard, checks, topology, rgi]) => {
        setData(dashboard);
        setValidation(checks);
        const converted = topology as FeatureCollection;
        setMunicipalityFeatures(converted.features);
        setRgiFeatures((rgi as FeatureCollection).features);
      })
      .catch((reason) => setError(String(reason)));
  }, []);

  const geoFiltered = useMemo(() => {
    if (!data) return [];
    return data.municipalities.filter(
      (row) =>
        (!regionFilter || row.region === regionFilter) &&
        (!ufFilter || row.uf === ufFilter),
    );
  }, [data, regionFilter, ufFilter]);

  const filteredMunicipalities = useMemo(
    () =>
      geoFiltered.filter(
        (row) =>
          (!rgiFilter || row.rgiCode === rgiFilter) &&
          (!municipalityFilter || row.code === municipalityFilter) &&
          (!typologyFilter || row.typology === typologyFilter) &&
          (!dynamismFilter || row.dynamism === dynamismFilter),
      ),
    [dynamismFilter, geoFiltered, municipalityFilter, rgiFilter, typologyFilter],
  );

  const territories = useMemo<Territory[]>(() => {
    if (level === "municipality") {
      return filteredMunicipalities.map((row) => ({ ...row, municipalityCount: 1 }));
    }
    const groups = new Map<string, Municipality[]>();
    for (const row of filteredMunicipalities) {
      groups.set(row.rgiCode, [...(groups.get(row.rgiCode) ?? []), row]);
    }
    return [...groups.entries()].map(([code, rows]) =>
      aggregateMunicipalities(rows, {
        code,
        name: rows[0].rgi,
        rgiCode: code,
        rgi: rows[0].rgi,
        uf: uniqueLabel(rows.map((row) => row.uf), "Mais de uma UF"),
        region: uniqueLabel(rows.map((row) => row.region), "Mais de uma macrorregião"),
      }),
    );
  }, [filteredMunicipalities, level]);

  const currentSummary = useMemo(() => {
    if (!filteredMunicipalities.length) return null;
    const selected = territories.find((row) => row.code === selectedCode);
    return selected ?? aggregateMunicipalities(filteredMunicipalities, {
      code: "filter",
      name: "Recorte atual",
      rgiCode: "",
      rgi: "",
      ufCode: "",
      uf: uniqueLabel(filteredMunicipalities.map((row) => row.uf), "Mais de uma UF"),
      region: uniqueLabel(filteredMunicipalities.map((row) => row.region), "Mais de uma macrorregião"),
    });
  }, [filteredMunicipalities, selectedCode, territories]);

  const regionOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.municipalities.map((row) => row.region))].sort().map((value) => ({ value, label: value }));
  }, [data]);
  const ufOptions = useMemo(
    () => [...new Set((data?.municipalities ?? []).filter((row) => !regionFilter || row.region === regionFilter).map((row) => row.uf))].sort().map((value) => ({ value, label: value })),
    [data, regionFilter],
  );
  const rgiOptions = useMemo(
    () => [...new Map(geoFiltered.map((row) => [row.rgiCode, row.rgi])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    [geoFiltered],
  );
  const municipalityOptions = useMemo(
    () => geoFiltered.filter((row) => !rgiFilter || row.rgiCode === rgiFilter).sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({ value: row.code, label: `${row.name} (${row.uf})` })),
    [geoFiltered, rgiFilter],
  );
  const typologyOptions = useMemo(
    () => [...new Set((data?.municipalities ?? []).map((row) => row.typology))].sort().map((value) => ({ value, label: value })),
    [data],
  );

  const scatterGroups = useMemo(() => {
    const toPoint = (row: Territory) => ({
      x: row.change.popPct ?? 0,
      y: row.change.aging60Pct ?? 0,
      z: Math.max(18, Math.sqrt(row.y2022.pop)),
      name: row.name,
      uf: row.uf,
      dynamism: row.dynamism,
    });
    return Object.keys(dynamismColors).map((name) => ({
      name,
      data: territories.filter((row) => row.dynamism === name && row.change.popPct !== null && row.change.aging60Pct !== null).map(toPoint),
    }));
  }, [territories]);

  const aggregateTerritories = useMemo(() => {
    if (!filteredMunicipalities.length) return [];
    if (aggregateLevel === "brasil") {
      return [aggregateMunicipalities(filteredMunicipalities, { code: "BR", name: "Brasil" })];
    }
    const groups = new Map<string, Municipality[]>();
    for (const row of filteredMunicipalities) {
      const key = aggregateLevel === "uf" ? row.ufCode : String(row.regionCode);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()]
      .map(([code, rows]) =>
        aggregateMunicipalities(rows, {
          code,
          name: aggregateLevel === "uf" ? rows[0].uf : rows[0].region,
        }),
      )
      .sort((a, b) => b.y2022.pop - a.y2022.pop);
  }, [aggregateLevel, filteredMunicipalities]);

  const ageChart = useMemo(() => {
    const target = currentSummary;
    if (!target || !data) return [];
    return data.meta.ageLabels.map((label, index) => ({
      faixa: label,
      "2010": target.y2010.ages[index],
      "2022": target.y2022.ages[index],
    }));
  }, [currentSummary, data]);

  const tableRows = useMemo(() => {
    const search = tableSearch.toLocaleLowerCase("pt-BR");
    return territories.filter((row) =>
      [row.name, row.uf, row.rgi, row.typology, row.dynamism, row.code].join(" ").toLocaleLowerCase("pt-BR").includes(search),
    );
  }, [tableSearch, territories]);

  function resetFilters() {
    setRegionFilter("");
    setUfFilter("");
    setRgiFilter("");
    setMunicipalityFilter("");
    setTypologyFilter("");
    setDynamismFilter("");
    setSelectedCode("");
  }

  function downloadCsv() {
    const header = ["codigo", "territorio", "uf", "rgi", "tipologia", "dinamismo", "pop_2010", "pop_2022", "variacao_pop_absoluta", "idosos_2010_pct", "variacao_pop_pct", "indice_60_2010", "indice_60_2022", "variacao_indice_pct", "idosos_2022_pct", "diferenca_idosos_pp"];
    const lines = tableRows.map((row) => [
      row.code,
      row.name,
      row.uf,
      row.rgi,
      row.typology,
      row.dynamism,
      row.y2010.pop,
      row.y2022.pop,
      row.change.pop,
      row.y2010.olderShare,
      row.change.popPct,
      row.y2010.aging60,
      row.y2022.aging60,
      row.change.aging60Pct,
      row.y2022.olderShare,
      row.change.olderSharePp,
    ]);
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [header, ...lines].map((line) => line.map(escape).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `PNDR_OBJ3_${level}_${tableRows.length}_territorios.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  if (error) {
    return <main className="state-screen"><AlertTriangle /><h1>Não foi possível carregar o painel</h1><p>{error}</p></main>;
  }
  if (!data || !validation) {
    return <main className="state-screen"><div className="spinner" /><h1>Preparando indicadores territoriais</h1><p>Carregando os 5.570 municípios e as geometrias.</p></main>;
  }

  return (
    <main className="dashboard-page">
      <header className="hero">
        <div>
          <p className="eyebrow">POLÍTICA NACIONAL DE DESENVOLVIMENTO REGIONAL</p>
          <h1>{data.meta.title}</h1>
          <p className="hero-subtitle">{data.meta.subtitle}</p>
        </div>
        <div className="hero-status">
          <span><i /> Bases integradas</span>
          <strong>{integerNumber.format(data.meta.municipalities)}</strong>
          <small>municípios compatibilizados na malha de 2022</small>
        </div>
      </header>

      <section className="dashboard-shell">
        <aside className="filters">
          <div className="filter-title">
            <div><SlidersHorizontal /><span>RECORTE TERRITORIAL</span><h2>Filtros</h2></div>
            <Button variant="ghost" size="sm" onClick={resetFilters}><Eraser /> Limpar</Button>
          </div>
          <label className="filter-field">
            <span>Nível de análise</span>
            <select value={level} onChange={(event) => { setLevel(event.target.value as "municipality" | "rgi"); setMunicipalityFilter(""); setSelectedCode(""); }}>
              <option value="municipality">Município</option>
              <option value="rgi">Região Geográfica Intermediária</option>
            </select>
          </label>
          <FilterSelect label="Macrorregião" value={regionFilter} onChange={(value) => { setRegionFilter(value); setUfFilter(""); setRgiFilter(""); setMunicipalityFilter(""); }} options={regionOptions} />
          <FilterSelect label="Unidade da Federação" value={ufFilter} onChange={(value) => { setUfFilter(value); setRgiFilter(""); setMunicipalityFilter(""); }} options={ufOptions} />
          <FilterSelect label="Região Geográfica Intermediária" value={rgiFilter} onChange={(value) => { setRgiFilter(value); setMunicipalityFilter(""); }} options={rgiOptions} />
          {level === "municipality" && <FilterSelect label="Município" value={municipalityFilter} onChange={setMunicipalityFilter} options={municipalityOptions} />}
          <div className="filter-rule" />
          <FilterSelect label="Tipologia PNDR III" value={typologyFilter} onChange={setTypologyFilter} options={typologyOptions} />
          <FilterSelect label="Classe isolada de dinamismo" value={dynamismFilter} onChange={setDynamismFilter} options={Object.keys(dynamismColors).filter((v) => v !== "Múltiplas classes").map((value) => ({ value, label: value }))} />
          <div className="filter-summary">
            <span>RECORTE ATIVO</span>
            <strong>{integerNumber.format(territories.length)} {level === "municipality" ? "municípios" : "RGI"}</strong>
            <small>{integerNumber.format(filteredMunicipalities.length)} municípios na agregação</small>
          </div>
          <div className="method-alert"><AlertTriangle /><p>Somas observadas: há supressões em 1.667 municípios (2010) e 4.846 (2022). Faixas etárias podem não somar o total. As omissões não foram estimadas.</p></div>
          <div className="method-alert"><Info /><p>O índice disponível é a medida alternativa <b>60+/0–14</b>. A faixa 65+ não é identificável nos arquivos anexos.</p></div>
        </aside>

        <Tabs defaultValue="panorama" className="workspace">
          <TabsList variant="line" className="main-tabs">
            <TabsTrigger value="panorama"><Users /> Panorama</TabsTrigger>
            <TabsTrigger value="mapas"><MapIcon /> Mapas</TabsTrigger>
            <TabsTrigger value="dispersao"><BarChart3 /> Dispersão</TabsTrigger>
            <TabsTrigger value="agregados"><Database /> Agregados</TabsTrigger>
            <TabsTrigger value="tabela"><Table2 /> Tabela</TabsTrigger>
            <TabsTrigger value="metodologia"><FileCheck2 /> Metodologia</TabsTrigger>
          </TabsList>

          <div className="content">
            <TabsContent value="panorama">
              <div className="section-head"><div><p className="eyebrow dark">SÍNTESE DO RECORTE</p><h2>{currentSummary?.name ?? "Sem territórios"}</h2><p>Comparação dos Censos Demográficos de 2010 e 2022 em limites municipais compatíveis.</p></div>{currentSummary && <span className="territory-badge">{currentSummary.dynamism}</span>}</div>
              {currentSummary ? (
                <>
                  <div className="kpi-grid">
                    <Kpi label="População · 2010" value={compactNumber.format(currentSummary.y2010.pop)} note={integerNumber.format(currentSummary.y2010.pop)} />
                    <Kpi label="População · 2022" value={compactNumber.format(currentSummary.y2022.pop)} note={integerNumber.format(currentSummary.y2022.pop)} />
                    <Kpi label="Variação populacional" value={pct(currentSummary.change.popPct)} note={`${currentSummary.change.pop >= 0 ? "+" : ""}${integerNumber.format(currentSummary.change.pop)} pessoas`} tone={(currentSummary.change.popPct ?? 0) < 0 ? "negative" : "positive"} />
                    <Kpi label="Municípios no recorte" value={integerNumber.format(currentSummary.municipalityCount)} note={currentSummary.typology} />
                    <Kpi label="Índice 60+/0–14 · 2010" value={fmt(currentSummary.y2010.aging60)} note="pessoas 60+ por 100 de 0–14" />
                    <Kpi label="Índice 60+/0–14 · 2022" value={fmt(currentSummary.y2022.aging60)} note={`Variação: ${pct(currentSummary.change.aging60Pct)}`} tone="warning" />
                    <Kpi label="Idosos · 2010" value={fmt(currentSummary.y2010.olderShare, "%")} note="população com 60 anos ou mais" />
                    <Kpi label="Idosos · 2022" value={fmt(currentSummary.y2022.olderShare, "%")} note="população com 60 anos ou mais" />
                    <Kpi label="Mudança na participação" value={fmt(currentSummary.change.olderSharePp, " p.p.")} note="diferença entre 2022 e 2010" tone="warning" />
                  </div>
                  <div className="analysis-grid">
                    <Card className="panel span-two"><CardContent className="p-0"><div className="panel-head"><div><h3>Estrutura etária</h3><p>População por faixa etária nos dois censos</p></div></div><div className="chart-height"><ResponsiveContainer width="100%" height="100%"><BarChart data={ageChart} margin={{ top: 12, right: 10, left: 5, bottom: 46 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="faixa" interval={0} angle={-35} textAnchor="end" height={70} tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value) => compactNumber.format(value)} tick={{ fontSize: 11 }} /><ChartTooltip formatter={(value) => integerNumber.format(Number(value))} /><Legend /><Bar dataKey="2010" fill="#9cafb7" radius={[3, 3, 0, 0]} /><Bar dataKey="2022" fill="#147d68" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
                    <Card className="panel profile-card"><CardContent className="p-0"><p className="eyebrow">PERFIL TERRITORIAL</p><h3>{currentSummary.typology}</h3><dl><div><dt>Dinamismo isolado</dt><dd>{currentSummary.dynamism}</dd></div><div><dt>RGI</dt><dd>{currentSummary.rgi || "Recorte agregado"}</dd></div><div><dt>Supressão</dt><dd>{currentSummary.quality.suppression2010 || currentSummary.quality.suppression2022 ? "Há células suprimidas" : "Sem ocorrência registrada"}</dd></div></dl></CardContent></Card>
                  </div>
                </>
              ) : <div className="empty-state">Nenhum território atende ao conjunto de filtros.</div>}
            </TabsContent>

            <TabsContent value="mapas">
              <div className="section-head"><div><p className="eyebrow dark">LEITURA ESPACIAL</p><h2>Mapas territoriais</h2><p>Selecione um território no mapa para levá-lo ao resumo do painel.</p></div><label className="metric-select"><span>Indicador</span><select value={mapMetric} onChange={(event) => setMapMetric(event.target.value as MetricKey)}>{Object.entries(metricLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
              <Card className="map-card"><CardContent className="p-0"><MapPanel level={level} municipalityFeatures={municipalityFeatures} rgiFeatures={rgiFeatures} territories={territories} metric={mapMetric} selectedCode={selectedCode} onSelect={setSelectedCode} /><div className="map-footer"><span><b>{integerNumber.format(territories.length)}</b> territórios exibidos</span><span><b>{metricLabels[mapMetric]}</b></span><span>Valores ausentes em cinza</span></div></CardContent></Card>
            </TabsContent>

            <TabsContent value="dispersao">
              <div className="section-head"><div><p className="eyebrow dark">DINÂMICA E ENVELHECIMENTO</p><h2>Dispersão territorial</h2><p>Cada ponto representa {level === "municipality" ? "um município" : "uma Região Geográfica Intermediária"}. O tamanho acompanha a população de 2022.</p></div></div>
              <Card className="panel"><CardContent className="p-0"><div className="scatter-legend">{Object.entries(dynamismColors).map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div><div className="scatter-height"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 15, right: 20, bottom: 30, left: 15 }}><CartesianGrid strokeDasharray="4 4" /><XAxis type="number" dataKey="x" name="Variação populacional" unit="%" tick={{ fontSize: 11 }} label={{ value: "Variação da população 2010–2022 (%)", position: "insideBottom", offset: -18 }} /><YAxis type="number" dataKey="y" name="Variação do índice" unit="%" tick={{ fontSize: 11 }} label={{ value: "Variação do índice 60+/0–14 (%)", angle: -90, position: "insideLeft" }} /><ZAxis type="number" dataKey="z" range={[22, 210]} /><ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => active && payload?.[0] ? <div className="chart-tooltip"><strong>{payload[0].payload.name}</strong><span>{payload[0].payload.uf} · {payload[0].payload.dynamism}</span><b>População: {fmt(payload[0].payload.x, "%")}</b><b>Envelhecimento: {fmt(payload[0].payload.y, "%")}</b></div> : null} />{scatterGroups.map((group) => <Scatter key={group.name} name={group.name} data={group.data} fill={dynamismColors[group.name]} fillOpacity={0.64} />)}</ScatterChart></ResponsiveContainer></div></CardContent></Card>
              <div className="rank-grid"><Card className="panel"><CardContent className="p-0"><h3>Maiores retrações populacionais</h3>{[...territories].sort((a, b) => (a.change.popPct ?? 0) - (b.change.popPct ?? 0)).slice(0, 8).map((row, index) => <div className="rank-row" key={row.code}><b>{index + 1}</b><span><strong>{row.name}</strong><small>{row.uf} · {row.dynamism}</small></span><em>{pct(row.change.popPct)}</em></div>)}</CardContent></Card><Card className="panel"><CardContent className="p-0"><h3>Maior avanço do índice 60+/0–14</h3>{[...territories].sort((a, b) => (b.change.aging60Pct ?? 0) - (a.change.aging60Pct ?? 0)).slice(0, 8).map((row, index) => <div className="rank-row" key={row.code}><b>{index + 1}</b><span><strong>{row.name}</strong><small>{row.uf} · {row.dynamism}</small></span><em>{pct(row.change.aging60Pct)}</em></div>)}</CardContent></Card></div>
            </TabsContent>

            <TabsContent value="agregados">
              <div className="section-head"><div><p className="eyebrow dark">ESCALAS DE AGREGAÇÃO</p><h2>Estados, macrorregiões e Brasil</h2><p>Numeradores e denominadores são somados antes do cálculo dos indicadores.</p></div><label className="metric-select"><span>Agregação</span><select value={aggregateLevel} onChange={(event) => setAggregateLevel(event.target.value as "uf" | "region" | "brasil")}><option value="uf">Unidades da Federação</option><option value="region">Macrorregiões</option><option value="brasil">Brasil</option></select></label></div>
              <div className="aggregate-grid">{aggregateTerritories.map((row) => <Card className="aggregate-card" key={row.code}><CardContent className="p-0"><span>{row.name}</span><strong>{compactNumber.format(row.y2022.pop)}</strong><small>População em 2022</small><div><b className={(row.change.popPct ?? 0) < 0 ? "negative" : "positive"}>{pct(row.change.popPct)}</b><em>população</em></div><div><b>{fmt(row.y2022.aging60)}</b><em>índice 60+/0–14</em></div><div><b>{fmt(row.y2022.olderShare, "%")}</b><em>pessoas 60+</em></div></CardContent></Card>)}</div>
              <Card className="panel"><CardContent className="p-0"><h3>Comparação completa por faixa etária</h3><p>Abra um território para comparar os censos. Percentuais e índices são recalculados a partir das somas do recorte.</p>{aggregateTerritories.map((row) => <details key={row.code}><summary>{row.name} · 2010: {integerNumber.format(row.y2010.pop)} · 2022: {integerNumber.format(row.y2022.pop)}</summary><p>Variação populacional: {integerNumber.format(row.change.pop)} pessoas ({pct(row.change.popPct)}). Índice 60+/0–14: {fmt(row.y2010.aging60)} → {fmt(row.y2022.aging60)}; variação {pct(row.change.aging60Pct)}.</p><div className="table-wrap"><table><thead><tr><th>Faixa etária</th><th>2010</th><th>% 2010</th><th>2022</th><th>% 2022</th><th>Variação absoluta</th><th>Variação %</th></tr></thead><tbody>{data.meta.ageLabels.map((label,i) => <tr key={label}><td>{label}</td><td>{integerNumber.format(row.y2010.ages[i])}</td><td>{fmt(row.y2010.pop ? 100*row.y2010.ages[i]/row.y2010.pop : null,"%")}</td><td>{integerNumber.format(row.y2022.ages[i])}</td><td>{fmt(row.y2022.pop ? 100*row.y2022.ages[i]/row.y2022.pop : null,"%")}</td><td>{integerNumber.format(row.y2022.ages[i]-row.y2010.ages[i])}</td><td>{pct(row.y2010.ages[i] ? 100*(row.y2022.ages[i]/row.y2010.ages[i]-1) : null)}</td></tr>)}</tbody></table></div></details>)}</CardContent></Card>
              <Card className="panel"><CardContent className="p-0"><h3>Variação populacional por território agregado</h3><div className="aggregate-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={aggregateTerritories.slice(0, 27).map((row) => ({ name: row.name, variacao: row.change.popPct }))} layout="vertical" margin={{ left: 40, right: 28 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" unit="%" /><YAxis dataKey="name" type="category" width={105} tick={{ fontSize: 11 }} /><ChartTooltip formatter={(value) => fmt(Number(value), "%")} /><Bar dataKey="variacao" fill="#147d68" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
            </TabsContent>

            <TabsContent value="tabela">
              <div className="section-head"><div><p className="eyebrow dark">BASE ANALÍTICA</p><h2>Tabela e download</h2><p>Resultados calculados para o recorte e o nível territorial selecionados.</p></div><Button onClick={downloadCsv}><Download /> Baixar CSV</Button></div>
              <div className="table-tools"><label><Search /><input type="search" value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Buscar território, tipologia ou código" /></label><span>{integerNumber.format(tableRows.length)} registros</span></div>
              <div className="table-wrap"><table><thead><tr><th>Território</th><th>UF</th><th>Tipologia</th><th>Dinamismo</th><th>Pop. 2010</th><th>Pop. 2022</th><th>Var. população</th><th>Índice 2022</th><th>Var. índice</th><th>Idosos 2022</th><th>Qualidade</th></tr></thead><tbody>{tableRows.slice(0, 500).map((row) => <tr key={row.code} onClick={() => setSelectedCode(row.code)}><td><strong>{row.name}</strong><small>{row.code} · {row.rgi}</small></td><td>{row.uf}</td><td>{row.typology}</td><td><span className="dynamism-pill" style={{ borderColor: dynamismColors[row.dynamism], color: dynamismColors[row.dynamism] }}>{row.dynamism}</span></td><td>{integerNumber.format(row.y2010.pop)}</td><td>{integerNumber.format(row.y2022.pop)}</td><td className={(row.change.popPct ?? 0) < 0 ? "negative" : "positive"}>{pct(row.change.popPct)}</td><td>{fmt(row.y2022.aging60)}</td><td>{pct(row.change.aging60Pct)}</td><td>{fmt(row.y2022.olderShare, "%")}</td><td>{row.quality.suppression2010 || row.quality.suppression2022 ? <span className="quality-warn">Atenção</span> : <span className="quality-ok">Regular</span>}</td></tr>)}</tbody></table></div>{tableRows.length > 500 && <p className="table-note">A visualização mostra os primeiros 500 registros. O download inclui todos os {integerNumber.format(tableRows.length)} territórios.</p>}
            </TabsContent>

            <TabsContent value="metodologia">
              <div className="section-head"><div><p className="eyebrow dark">TRANSPARÊNCIA METODOLÓGICA</p><h2>Metodologia e dados</h2><p>Definições, compatibilização territorial, classificação e controles de qualidade.</p></div></div>
              <div className="method-grid"><Card className="method-step"><CardContent className="p-0"><b>01</b><h3>Malha comum</h3><p>Os resultados de 2010 foram reexpressos nos limites municipais de 2022; os de 2022 foram somados diretamente por município.</p></CardContent></Card><Card className="method-step"><CardContent className="p-0"><b>02</b><h3>Agregação</h3><p>RGI, estados, macrorregiões e Brasil são obtidos pela soma dos componentes, antes do cálculo de percentuais e índices.</p></CardContent></Card><Card className="method-step"><CardContent className="p-0"><b>03</b><h3>Dinamismo</h3><p>Os quartis são calculados sobre {validation.dynamism.uniqueTypologyIds} IDs Tipologia únicos e propagados aos municípios.</p></CardContent></Card><Card className="method-step"><CardContent className="p-0"><b>04</b><h3>Auditoria</h3><p>Supressões, inconsistências e setores rateados permanecem identificados, com até seis casas decimais nos arquivos de intercâmbio.</p></CardContent></Card></div>
              <div className="formula-grid"><Card className="formula-card"><CardContent className="p-0"><span>Variação populacional</span><code>100 × (População 2022 / População 2010 − 1)</code><p>Variação relativa entre os dois censos.</p></CardContent></Card><Card className="formula-card warning"><CardContent className="p-0"><span>Índice disponível</span><code>100 × (População 60+ / População 0–14)</code><p>Medida alternativa, porque a faixa 60–69 não permite isolar a população de 65 anos ou mais.</p></CardContent></Card><Card className="formula-card"><CardContent className="p-0"><span>Participação de idosos</span><code>100 × (População 60+ / População total)</code><p>A diferença temporal é expressa em pontos percentuais.</p></CardContent></Card></div>
              <Card className="panel prose"><CardContent className="p-0"><h3>Compatibilização 2010 → 2022</h3><p>O histórico de formação dos setores conecta cada setor de 2022 aos seus antecedentes de 2010. Pares duplicados foram removidos. Quando um setor de 2010 alcança apenas um município de 2022, seus moradores são integralmente atribuídos a ele. Nos casos em que alcança mais de um município, os valores são rateados segundo a população de 2022 dos setores descendentes; se essa massa é zero ou ausente, utiliza-se a proporção da contagem de setores descendentes.</p><p>Valores fracionários resultantes do rateio são preservados. Células suprimidas contribuem com zero somente na soma observada, sem tentativa de recuperar conteúdo protegido.</p><h3>Classificação isolada de dinamismo</h3><p>Os pontos de corte são {decimalNumber.format(validation.dynamism.q25)} e {decimalNumber.format(validation.dynamism.q75)}. A classificação resultou em {validation.dynamism.counts["Baixo Dinamismo"]} IDs de Baixo, {validation.dynamism.counts["Médio Dinamismo"]} de Médio e {validation.dynamism.counts["Alto Dinamismo"]} de Alto Dinamismo. Entre os territórios comparáveis, houve correspondência em {validation.dynamism.matchingIds}/{validation.dynamism.comparableIds} IDs e {validation.dynamism.matchingMunicipalities}/{validation.dynamism.comparableMunicipalities} municípios. A divergência em Paracuru (CE) está no limite inclusivo do percentil 25. Empates nos cortes permanecem na mesma classe; por isso, os grupos extremos aproximam 25% dos IDs. Os filtros PNDR e dinamismo selecionam municípios antes da agregação: uma RGI filtrada pode representar apenas parte de seus municípios.</p></CardContent></Card>
              <div className="qa-grid"><span><b>{validation.uniqueMunicipalities.census2010}</b>municípios em 2010</span><span><b>{validation.uniqueMunicipalities.census2022}</b>municípios em 2022</span><span><b>{validation.dynamism.uniqueTypologyIds}</b>IDs Tipologia</span><span><b>{validation.dynamism.mismatches.length}</b>divergência de dinamismo</span></div>
            </TabsContent>
          </div>
        </Tabs>
      </section>
      <footer><span>PNDR III · Objetivo 3</span><span>Fontes: Censos Demográficos 2010 e 2022; Tipologia PNDR III</span></footer>
    </main>
  );
}
