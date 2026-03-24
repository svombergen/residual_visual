# Data Pipeline — dataload.py

## Overview

`dataload.py` merges 8 raw data sources into two outputs:

- **01_detail.csv** — one row per (country, energy_source, year)
- **01_aggregated.csv** — one row per (country, year), computed from detail rows

Year range: **2020–2024**. All energy values in **TWh**.

---

## Input Sources

### Issuance (certificate tracking systems)

| Source | File | Column(s) produced | Unit conversion |
|--------|------|--------------------|-----------------|
| **Barnebies (I-REC)** | `input/Barnebies Data 08.10.25.xlsx` sheet "Issuance" | `issuance_irec` | MWh / 1,000,000 → TWh |
| **TIGRS (XPANSIV)** | `input/RAW/TIGRS/TIGRS *.csv` (yearly files) | `issuance_tigrs` | MWh / 1,000,000 → TWh |
| **Ecogox** | `input/RAW/Ecogox/Ecogox data.xlsx` sheet "Sheet1" | `issuance_ecogox` | MWh / 1,000,000 → TWh |
| **Australia LGC** | `input/RAW/Australia/australia_raw_260218.csv` | `issuance_lgc` | Already TWh |
| **AIB GO Issue** | `input/RAW/AIB/Issue/*.csv` (monthly files) | `issuance_go`, `issuance_go_expire`, `issuance_go_cancel` | MWh / 1,000,000 → TWh |

### Generation & Emissions

| Source | File | Column(s) produced | Unit |
|--------|------|--------------------|------|
| **EMBERS** | `input/EMBERS yearly_full_release_long_format.csv` | `generation` (→ `total_generation`) | TWh |
| **EMBERS** | same file | `total_co2` | mtCO2 × 1000 (so that total_co2/generation = gCO2/kWh) |
| **Oman** | `input/RAW/Oman/Oman_20250924.xlsx` sheet "Electricity production" | `generation` | TWh |

### Country-level (aggregated only)

| Source | File | Column produced | Level |
|--------|------|-----------------|-------|
| **AIB ProdRM** | `input/RAW/AIB/ProdRM/*.xlsx` | `residualmix_gco2kwh` | Country/year (not per energy_source) |

---

## Standardisation

### Energy source mapping

Each source has raw technology/fuel names mapped to a standard set:

`Bio`, `Coal`, `Gas`, `Hydro`, `Nuclear`, `Oil`, `Other (F)`, `Other (R)`, `Solar`, `Wind`

Mapping priority: source-specific hardcoded map → `input/Mappings.xlsx` "Technologies" sheet → as-is.

Source-specific maps: `AIB_TECH`, `TIGRS_TECH`, `EMBERS_TECH`, `OMAN_TECH`, `ECOGOX_TECH`.

### Country name mapping

Priority: hardcoded overrides (Taiwan, Türkiye) → `input/Mappings.xlsx` "Countries" sheet → as-is.

ISO 3166-1 alpha-3 codes added via `pycountry`. ~41 countries unresolved (regional variants like "Belgium (Brussels)").

### Energy source classification

| Class | Energy sources |
|-------|---------------|
| RES | Bio, Hydro, Solar, Wind, Other (R) |
| Fossil | Coal, Gas, Oil, Other (F) |
| Nuclear | Nuclear |

---

## Merge

All detail-level sources are outer-merged on `(country, energy_source, year)` using `functools.reduce`.

When two sources produce the same column name (e.g. EMBERS and Oman both produce `generation`), pandas creates `_x`/`_y` suffixes — these are summed and collapsed back to a single column.

AIB ProdRM (`residualmix_gco2kwh`) is **not** part of this merge — it's joined separately at the aggregated level on `(country, year)`.

---

## Derived Columns (detail level)

| Column | Formula |
|--------|---------|
| `issuance_ext` | `issuance_tigrs + issuance_ecogox + issuance_lgc + issuance_go` |
| `issuance_total` | `issuance_irec + issuance_ext` |
| `certified_mix` | GO countries: `(issuance_go - issuance_go_expire) / generation`. Others: `issuance_total` |
| `total_generation` | Renamed from `generation` |
| `residual_mix` | `total_generation - certified_mix` (clamped ≥ 0) |
| `total_co2` | EMBERS mtCO2 × 1000 |
| `emission_factor` | `total_co2 / total_generation` (gCO2/kWh) |
| `class` | Mapped from `energy_source` (RES / Fossil / Nuclear) |
| `method` | "Issuance" if any row for that country/year has issuance data, else "Production" |
| `first_source` | Name of the first issuance system with data for that row; falls back to "EMBERS" |

---

## Output: 01_detail.csv

One row per (country, year, energy_source). Empty rows (all values zero/NaN) are dropped.

| Column | Source |
|--------|--------|
| `country` | Standardised country name |
| `country_code` | ISO 3166-1 alpha-3 via pycountry |
| `year` | 2020–2024 |
| `energy_source` | Standardised (Bio, Coal, Gas, etc.) |
| `class` | RES / Fossil / Nuclear |
| `issuance_irec` | Barnebies |
| `issuance_tigrs` | TIGRS |
| `issuance_ecogox` | Ecogox |
| `issuance_lgc` | Australia LGC |
| `issuance_go` | AIB GO Issue |
| `issuance_go_expire` | AIB GO Issue |
| `issuance_go_cancel` | AIB GO Issue |
| `issuance_ext` | Derived: sum of non-IREC issuance |
| `issuance_total` | Derived: IREC + EXT |
| `certified_mix` | Derived |
| `total_generation` | EMBERS + Oman |
| `residual_mix` | Derived |
| `total_co2` | EMBERS |
| `emission_factor` | Derived |
| `method` | Derived |
| `first_source` | Derived |

---

## Output: 01_aggregated.csv

One row per (country, year). Computed by summing detail rows, plus AIB ProdRM joined separately.

| Column | How computed |
|--------|-------------|
| `country` | From detail |
| `country_code` | From detail |
| `year` | From detail |
| `total_generation` | `sum(total_generation)` across energy sources |
| `total_co2` | `sum(total_co2)` across energy sources |
| `total_certified` | `sum(certified_mix)` across energy sources |
| `perc_tracked_total` | `total_certified / total_generation × 100` |
| `perc_residual` | `100 - perc_tracked_total` |
| `perc_tracked_renewables` | `sum(certified_mix where class=RES) / sum(generation where class=RES) × 100` |
| `perc_green` | `sum(generation where class=RES) / total_generation × 100` |
| `residualmix_gco2kwh` | AIB ProdRM (country/year level, not derived from detail) |
| `methodology` | Distinct `first_source` values for that country/year (excluding "EMBERS") |

---

## Pipeline Diagram

```
input/Barnebies ──────► issuance_irec ──┐
input/RAW/TIGRS ──────► issuance_tigrs ─┤
input/RAW/Ecogox ─────► issuance_ecogox ┤
input/RAW/Australia ──► issuance_lgc ───┤
input/RAW/AIB/Issue ──► issuance_go ────┤   outer merge on
                        issuance_go_expire  (country, energy_source, year)
                        issuance_go_cancel──┤       │
input/EMBERS ─────────► generation ─────┤       ▼
                        total_co2 ──────┤   DETAIL ROWS
input/RAW/Oman ───────► generation ─────┘       │
                                                │ derive: issuance_ext,
                                                │ issuance_total, certified_mix,
                                                │ residual_mix, emission_factor,
                                                │ class, method, first_source
                                                │
                                                ├──► 01_detail.csv
                                                │
                                                │ group by (country, year)
                                                │ sum generation, co2, certified
                                                │ compute percentages
                                                ▼
input/RAW/AIB/ProdRM ► residualmix_gco2kwh ──► 01_aggregated.csv
  (joined on country/year)
```
