#!/usr/bin/env python3
"""Prepara os dados estáticos do dashboard PNDR Objetivo 3.

O script preserva os valores fracionários de 2010, usa as bases Stata como
fonte demográfica e usa a planilha PNDR apenas para atributos territoriais.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PUBLIC = ROOT / "public" / "data"
REPORTS = ROOT / "reports"

AGE_VARS = [f"v010{i}" for i in range(31, 42)]
AGE_LABELS = [
    "0 a 4 anos",
    "5 a 9 anos",
    "10 a 14 anos",
    "15 a 19 anos",
    "20 a 24 anos",
    "25 a 29 anos",
    "30 a 39 anos",
    "40 a 49 anos",
    "50 a 59 anos",
    "60 a 69 anos",
    "70 anos ou mais",
]
REGION_NAMES = {
    1: "Norte",
    2: "Nordeste",
    3: "Sudeste",
    4: "Sul",
    5: "Centro-Oeste",
}


def code_string(series: pd.Series, width: int | None = None) -> pd.Series:
    values = series.astype("string").str.replace(r"\.0$", "", regex=True)
    return values.str.zfill(width) if width else values


def finite(value):
    if pd.isna(value) or not np.isfinite(float(value)):
        return None
    return float(value)


def rounded(value, digits=6):
    value = finite(value)
    return None if value is None else round(value, digits)


def metric_block(row: pd.Series, suffix: str) -> dict:
    pop = float(row[f"v01006_{suffix}"])
    ages = [float(row[f"{v}_{suffix}"]) for v in AGE_VARS]
    children = sum(ages[0:3])
    older60 = sum(ages[9:11])
    return {
        "pop": rounded(pop),
        "ages": [rounded(v) for v in ages],
        "children": rounded(children),
        "older60": rounded(older60),
        "olderShare": rounded(100 * older60 / pop) if pop else None,
        "aging60": rounded(100 * older60 / children) if children else None,
    }


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    d10 = pd.read_stata(RAW / "censo_municipios_2010_malha2022.dta", convert_categoricals=False)
    d22 = pd.read_stata(RAW / "censo_municipios_2022_malha2022.dta", convert_categoricals=False)
    territorial = pd.read_excel(RAW / "tipologia_pndr3.xlsx")

    # A planilha-fonte contém alguns separadores territoriais lidos como "¿".
    # Normalizamos apenas os rótulos textuais, sem alterar chaves ou métricas.
    for column in ["Município", "Região Geográfica Imediata", "Regiões de Capitais", "Tipologia PNDR III Nacional FINAL"]:
        if column in territorial.columns:
            territorial[column] = (
                territorial[column]
                .astype("string")
                .str.replace("¿", "–", regex=False)
                .str.replace(r"\s+", " ", regex=True)
                .str.strip()
            )

    for frame in (d10, d22):
        frame["cd_mun2022"] = code_string(frame["cd_mun2022"], 7)
    territorial["Código Município"] = code_string(territorial["Código Município"], 7)
    territorial["Código UF"] = code_string(territorial["Código UF"], 2)
    territorial["Código Região Geográfica Imediata"] = code_string(
        territorial["Código Região Geográfica Imediata"]
    )
    territorial["ID Tipologia"] = code_string(territorial["ID Tipologia"])

    assert len(d10) == d10["cd_mun2022"].nunique() == 5570
    assert len(d22) == d22["cd_mun2022"].nunique() == 5570
    assert len(territorial) == territorial["Código Município"].nunique() == 5570

    demographic = d10.merge(
        d22,
        on="cd_mun2022",
        how="outer",
        suffixes=("_2010", "_2022"),
        validate="one_to_one",
        indicator=True,
    )
    merge_demography = demographic["_merge"].value_counts().to_dict()
    demographic = demographic.drop(columns="_merge")

    merged = territorial.merge(
        demographic,
        left_on="Código Município",
        right_on="cd_mun2022",
        how="outer",
        validate="one_to_one",
        indicator=True,
    )
    merge_territorial = merged["_merge"].value_counts().to_dict()
    assert merge_territorial.get("both", 0) == 5570
    merged = merged.drop(columns="_merge")

    rate_col = "Taxa de variação do PIB per capita (2009-2021)"
    typ_col = "Tipologia PNDR III Nacional FINAL"
    id_summary = (
        merged.groupby("ID Tipologia", dropna=False)
        .agg(
            rate=(rate_col, "first"),
            n_rates=(rate_col, "nunique"),
            typology=(typ_col, "first"),
            n_typologies=(typ_col, "nunique"),
            municipalities=("Código Município", "size"),
        )
        .reset_index()
    )
    assert (id_summary["n_rates"] <= 1).all()
    assert (id_summary["n_typologies"] <= 1).all()

    q25 = float(id_summary["rate"].quantile(0.25))
    q75 = float(id_summary["rate"].quantile(0.75))
    id_summary["dynamism"] = np.select(
        [id_summary["rate"] <= q25, id_summary["rate"] >= q75],
        ["Baixo Dinamismo", "Alto Dinamismo"],
        default="Médio Dinamismo",
    )
    merged = merged.merge(
        id_summary[["ID Tipologia", "dynamism"]],
        on="ID Tipologia",
        how="left",
        validate="many_to_one",
    )

    reference_dyn = merged[typ_col].str.extract(r"e (Alto|Médio|Baixo) Dinamismo", expand=False)
    reference_dyn = reference_dyn.fillna("") + " Dinamismo"
    is_comparable = merged[typ_col].str.startswith(("Média Renda", "Baixa Renda"), na=False)
    merged["referenceDynamism"] = np.where(is_comparable, reference_dyn, "")
    merged["dynamismMatch"] = np.where(
        is_comparable, merged["dynamism"] == merged["referenceDynamism"], pd.NA
    )

    mismatches = merged[is_comparable & (merged["dynamism"] != merged["referenceDynamism"])][
        [
            "Código Município",
            "Município",
            "ID Tipologia",
            "Região Geográfica Imediata",
            typ_col,
            rate_col,
            "referenceDynamism",
            "dynamism",
        ]
    ].copy()
    mismatches.to_csv(REPORTS / "divergencias_dinamismo.csv", index=False, encoding="utf-8-sig")

    records = []
    for _, row in merged.sort_values("Código Município").iterrows():
        m2010 = metric_block(row, "2010")
        m2022 = metric_block(row, "2022")

        pop_change = m2022["pop"] - m2010["pop"]
        pop_change_pct = 100 * (m2022["pop"] / m2010["pop"] - 1) if m2010["pop"] else None
        aging_change = m2022["aging60"] - m2010["aging60"] if m2010["aging60"] is not None and m2022["aging60"] is not None else None
        aging_change_pct = 100 * (m2022["aging60"] / m2010["aging60"] - 1) if m2010["aging60"] not in (None, 0) and m2022["aging60"] is not None else None
        older_share_pp = m2022["olderShare"] - m2010["olderShare"] if m2010["olderShare"] is not None and m2022["olderShare"] is not None else None

        region_code = int(row["Região"]) if pd.notna(row["Região"]) else None
        records.append(
            {
                "code": row["Código Município"],
                "name": row["Município"],
                "ufCode": row["Código UF"],
                "uf": row["UF"],
                "regionCode": region_code,
                "region": REGION_NAMES.get(region_code, "Sem informação"),
                "rgiCode": row["Código Região Geográfica Imediata"],
                "rgi": row["Região Geográfica Imediata"],
                "capitalRegion": None if pd.isna(row["Regiões de Capitais"]) else row["Regiões de Capitais"],
                "typologyId": row["ID Tipologia"],
                "typology": row[typ_col],
                "dynamism": row["dynamism"],
                "gdpPcChange": rounded(row[rate_col]),
                "y2010": m2010,
                "y2022": m2022,
                "change": {
                    "pop": rounded(pop_change),
                    "popPct": rounded(pop_change_pct),
                    "aging60": rounded(aging_change),
                    "aging60Pct": rounded(aging_change_pct),
                    "olderSharePp": rounded(older_share_pp),
                },
                "quality": {
                    "suppression2010": int(row.get("flag_supressao_2010", 0)),
                    "suppression2022": int(row.get("flag_supressao_2022", 0)),
                    "suppressedCells2010": int(row.get("n_celulas_suprimidas_2010", 0)),
                    "suppressedCells2022": int(row.get("n_celulas_suprimidas_2022", 0)),
                    "inconsistent2010": int(row.get("flag_inconsistencia_2010", 0)),
                    "inconsistent2022": int(row.get("flag_inconsistencia_2022", 0)),
                    "ratedSectors2010": int(row.get("n_setores_rateados", 0)),
                    "ratedPopulationPct2010": rounded(row.get("pct_pop2010_rateada", 0)),
                },
            }
        )

    totals = {}
    for year, frame in ((2010, d10), (2022, d22)):
        totals[str(year)] = {v: rounded(frame[v].sum()) for v in ["v01006", *AGE_VARS]}

    comparable_ids = id_summary[
        id_summary["typology"].str.startswith(("Média Renda", "Baixa Renda"), na=False)
    ].copy()
    comparable_ids["reference"] = (
        comparable_ids["typology"].str.extract(r"e (Alto|Médio|Baixo) Dinamismo", expand=False)
        + " Dinamismo"
    )
    id_matches = int((comparable_ids["dynamism"] == comparable_ids["reference"]).sum())
    municipality_matches = int((merged.loc[is_comparable, "dynamismMatch"] == True).sum())

    validation = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "rows": {"census2010": len(d10), "census2022": len(d22), "territorial": len(territorial)},
        "uniqueMunicipalities": {
            "census2010": int(d10["cd_mun2022"].nunique()),
            "census2022": int(d22["cd_mun2022"].nunique()),
            "territorial": int(territorial["Código Município"].nunique()),
        },
        "merges": {"demography": merge_demography, "territorial": merge_territorial},
        "totals": totals,
        "suppression": {
            "municipalities2010": int(d10["flag_supressao"].sum()),
            "municipalities2022": int(d22["flag_supressao"].sum()),
            "inconsistent2010": int(d10["flag_inconsistencia"].sum()),
            "inconsistent2022": int(d22["flag_inconsistencia"].sum()),
        },
        "dynamism": {
            "uniqueTypologyIds": int(len(id_summary)),
            "q25": q25,
            "q75": q75,
            "counts": id_summary["dynamism"].value_counts().to_dict(),
            "comparableIds": int(len(comparable_ids)),
            "matchingIds": id_matches,
            "comparableMunicipalities": int(is_comparable.sum()),
            "matchingMunicipalities": municipality_matches,
            "mismatches": mismatches.to_dict(orient="records"),
        },
        "limitations": [
            "As bases anexas não separam 60–64 de 65–69 anos; o índice oficial 65+/0–14 não pode ser calculado.",
            "O painel apresenta, de forma explícita, o índice alternativo 60+/0–14.",
            "Os totais afetados por supressão correspondem à soma observada, não à recuperação de valores sigilosos.",
        ],
    }

    dashboard = {
        "meta": {
            "title": "PNDR OBJETIVO 3",
            "subtitle": "Estimular ganhos de produtividade e aumento da competitividade regional, sobretudo em regiões que apresentem declínio populacional e elevadas taxas de emigração",
            "municipalities": len(records),
            "ageLabels": AGE_LABELS,
            "agingIndex": "Alternativo: população de 60 anos ou mais por 100 pessoas de 0 a 14 anos",
            "q25Dynamism": rounded(q25),
            "q75Dynamism": rounded(q75),
        },
        "municipalities": records,
    }

    with (PUBLIC / "dashboard_obj3.json").open("w", encoding="utf-8") as stream:
        json.dump(dashboard, stream, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    with (PUBLIC / "validation.json").open("w", encoding="utf-8") as stream:
        json.dump(validation, stream, ensure_ascii=False, indent=2, allow_nan=False, default=str)

    report = f"""# Relatório de validação — PNDR Objetivo 3

## Integração das bases

- Censo 2010: **{len(d10):,}** municípios únicos.
- Censo 2022: **{len(d22):,}** municípios únicos.
- Tipologia territorial: **{len(territorial):,}** municípios únicos.
- Correspondências completas nas três fontes: **{merge_territorial.get('both', 0):,}**.

## Dinamismo

- IDs Tipologia únicos: **{len(id_summary):,}**.
- Percentil 25: **{q25:.9f}**.
- Percentil 75: **{q75:.9f}**.
- Baixo / Médio / Alto: **{id_summary['dynamism'].value_counts().get('Baixo Dinamismo', 0)} / {id_summary['dynamism'].value_counts().get('Médio Dinamismo', 0)} / {id_summary['dynamism'].value_counts().get('Alto Dinamismo', 0)}**.
- Correspondência nos IDs de Média ou Baixa Renda: **{id_matches}/{len(comparable_ids)}**.
- Correspondência municipal: **{municipality_matches}/{int(is_comparable.sum())}**.
- Divergências: **{len(mismatches)}**. Consulte `divergencias_dinamismo.csv`.

## Qualidade e limitação etária

- Municípios com alguma supressão em 2010: **{int(d10['flag_supressao'].sum()):,}**.
- Municípios com alguma supressão em 2022: **{int(d22['flag_supressao'].sum()):,}**.
- As faixas disponíveis agrupam 60–69 anos. Logo, o índice oficial do IBGE (65+/0–14) não é identificável exatamente. O dashboard mostra o índice alternativo 60+/0–14 com rotulagem explícita.
"""
    (REPORTS / "RELATORIO_VALIDACAO.md").write_text(report, encoding="utf-8")

    print(json.dumps({"records": len(records), "q25": q25, "q75": q75, "mismatches": len(mismatches)}))


if __name__ == "__main__":
    main()
