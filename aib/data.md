# Data Pipeline — dataload.py

Merges 9 raw sources into two CSVs: **01_detail.csv** (per country/energy_source/year) and **01_aggregated.csv** (per country/year). All energy values in **TWh**.

Year range: **2020–2024**.

---

## Standardisation

**Energy sources** — each source has raw names mapped to a canonical set via source-specific dicts (TIGRS_TECH, AIB_TECH, EMBER_TECH, OMAN_TECH, ECOGOX_TECH) then `Mappings.xlsx` Technologies sheet as fallback. Standard values: `Bio, Coal, Gas, Hydro, Nuclear, Oil, Other (F), Other (R), Solar, Wind`.

**Country names** — COUNTRY_NAME_OVERRIDES hardcoded map → `Mappings.xlsx` Countries sheet. ISO 3166-1 alpha-3 codes via pycountry.

**Class** — `ENERGY_CLASS` dict: RES = {Bio, Hydro, Solar, Wind, Other (R)}, Fossil = {Coal, Gas, Oil, Other (F)}, Nuclear = {Nuclear}.

---

## 01_detail.csv — Lineage

### Dimensions

| Source file.Sheet | Source column | Transform | Output column |
|---|---|---|---|
| Barnebies Data 08.10.25.xlsx.Issuance | Issue Country | map_country() | `country` |
| RAW/TIGRS/TIGRS *.csv | Country | map_country() | `country` |
| RAW/Ecogox/Ecogox data.xlsx.Sheet1 | — | hardcoded "Colombia" | `country` |
| RAW/Australia/australia_raw_260218.csv | Country | map_country() | `country` |
| RAW/AIB/Issue/AIB_EECS*.csv | domain_name | split "XX - Name", map_country() | `country` |
| EMBER yearly_full_release_long_format.csv | Area | map_country() | `country` |
| RAW/Oman/Oman_20250924.xlsx.Electricity production | — | hardcoded "Oman" | `country` |
| RAW/AIB/ProdRM/*.xlsx.Production Mix | col 0 (ISO2) | _iso2_to_country() | `country` |
| `country` | — | pycountry alpha_3 lookup | `country_code` |
| Barnebies Data 08.10.25.xlsx.Issuance | Year of Vintage | to int | `year` |
| RAW/TIGRS/TIGRS *.csv | Year | to int | `year` |
| RAW/AIB/Issue/AIB_EECS*.csv | year | to int | `year` |
| EMBER yearly_full_release_long_format.csv | Year | to int | `year` |
| RAW/Oman/Oman_20250924.xlsx.Electricity production | column headers | numeric → int | `year` |
| RAW/AIB/ProdRM/*.xlsx | filename | first 4 digits | `year` |
| Barnebies Data 08.10.25.xlsx.Issuance | Technology Final | map_tech(Mappings.xlsx) | `energy_source` |
| RAW/TIGRS/TIGRS *.csv | Fuel Type Description | map_tech(TIGRS_TECH, Mappings.xlsx) | `energy_source` |
| RAW/Ecogox/Ecogox data.xlsx.Sheet1 | type | map_tech(ECOGOX_TECH, Mappings.xlsx) | `energy_source` |
| RAW/Australia/australia_raw_260218.csv | Technology | map_tech(Mappings.xlsx) | `energy_source` |
| RAW/AIB/Issue/AIB_EECS*.csv | energy_source_level2 | AIB_TECH dict | `energy_source` |
| EMBER yearly_full_release_long_format.csv | Variable | EMBER_TECH dict | `energy_source` |
| RAW/Oman/Oman_20250924.xlsx.Electricity production | row label | OMAN_TECH dict | `energy_source` |
| RAW/AIB/ProdRM/*.xlsx.Production Mix | column headers | PRODMIX_TECH dict | `energy_source` |
| `energy_source` | — | ENERGY_CLASS dict | `class` |

### Values

| Source file.Sheet | Source column | Transform | Output column |
|---|---|---|---|
| Barnebies Data 08.10.25.xlsx.Issuance | Volume Issued | ÷ 1,000,000 (MWh → TWh) | `issuance_irec` |
| RAW/TIGRS/TIGRS *.csv | Number of TIGRs | strip commas, ÷ 1,000,000 | `issuance_tigrs` |
| RAW/Ecogox/Ecogox data.xlsx.Sheet1 | total_GOs | ÷ 1,000,000,000 (kWh → TWh) | `issuance_ecogox` |
| RAW/Australia/australia_raw_260218.csv | Issuance_EXT | already TWh | `issuance_lgc` |
| RAW/AIB/Issue/AIB_EECS*.csv | production_date_issue − production_date_expire | ÷ 1,000,000, clip ≥ 0 | `issuance_go` |
| RAW/AIB/Issue/AIB_EECS*.csv | production_date_expire | ÷ 1,000,000 | `issuance_go_expire` |
| RAW/AIB/Issue/AIB_EECS*.csv | production_date_cancel | ÷ 1,000,000 | `issuance_go_cancel` |
| `issuance_tigrs + issuance_ecogox + issuance_lgc + issuance_go` | sum(min_count=1) | — | `issuance_ext` |
| `issuance_irec + issuance_ext` | sum(min_count=1) | — | `issuance_total` |
| `issuance_go` if >0; else `issuance_total` | — | conditional | `certified_mix` |
| EMBER yearly_full_release_long_format.csv | Value [Electricity generation, TWh] | group sum | `total_generation` |
| RAW/Oman/Oman_20250924.xlsx.Electricity production | cell values [row = "Total production"] | already TWh, group sum | `total_generation` ¹ |
| RAW/AIB/ProdRM/*.xlsx.Production Mix | Volume × source_share | replaces EMBER for AIB-covered country/years | `total_generation` ¹ |
| `total_generation − certified_mix` | clip ≥ 0 | — | `residual_mix` |
| RAW/AIB/ProdRM/*.xlsx.Residual Mixes | untracked_frac × supplier_vol × source_frac | overrides formula value where present | `residual_mix` ¹ |
| EMBER yearly_full_release_long_format.csv | Value [Power sector emissions, mtCO2] | × 1,000 (mtCO2 → ktCO2) | `total_co2` |
| `generation_gco2kwh × aib_generation` | — | overrides EMBER for AIB-covered rows | `total_co2` ¹ |
| `total_co2 ÷ total_generation` | — | — | `emission_factor` |
| RAW/AIB/ProdRM/*.xlsx.Production Mix | CO2 intensity column (gCO2/kWh) | country/year-level value | `generation_gco2kwh` |
| `emission_factor` | — | fallback where no AIB value | `generation_gco2kwh` ¹ |
| `issuance_go>0`→"AIB", `issuance_tigrs>0`→"XPANSIV", `issuance_ecogox>0`→"Ecogox", `issuance_lgc>0`→"Clean Energy Regulator Australia", `issuance_irec>0`→"I-REC", `generation>0`→"EMBER" | boolean flags, comma-joined | — | `sources` |
| `issuance_irec` | >0 → "I-REC"; else "GO" | — | `methodology` |
| Priority: `issuance_go`→"AIB", `issuance_tigrs`→"TIGRS", `issuance_ecogox`→"Ecogox", `issuance_lgc`→"LGC", `issuance_irec` & class=RES→"I-REC(E)", `issuance_irec`→"I-TRACK(E)" | np.select | — | `issuance` |

¹ Supplement or override of the primary source above it.

---

## 01_aggregated.csv — Lineage

Grouped by (country, country_code, year) from detail rows. AIB ProdRM country/year metrics joined separately.

| Input | Transform | Output column |
|---|---|---|
| detail.`country` | passthrough | `country` |
| detail.`country_code` | passthrough | `country_code` |
| detail.`year` | passthrough | `year` |
| detail.`total_generation` | sum | `total_generation` |
| detail.`total_co2` | sum; override: `generation_gco2kwh × total_generation` if AIB-covered | `total_co2` |
| detail.`certified_mix` | sum | `total_certified` |
| `total_certified ÷ total_generation × 100` | — | `perc_tracked_total` |
| `100 − perc_tracked_total` | — | `perc_residual` |
| `sum(certified_mix where class=RES) ÷ sum(total_generation where class=RES) × 100` | — | `perc_tracked_renewables` |
| `sum(total_generation where class=RES) ÷ total_generation × 100` | — | `perc_green` |
| detail.`generation_gco2kwh` | first non-null per country/year | `generation_gco2kwh` |
| RAW/AIB/ProdRM/*.xlsx.Residual Mixes | CO2 intensity column (gCO2/kWh), joined on country/year | `residualmix_gco2kwh` |
| RAW/AIB/ProdRM/*.xlsx.Residual Mixes | untracked fraction × 100 | `untracked_pct` |
| RAW/AIB/ProdRM/*.xlsx.Total Supplier Mix | Volume column (TWh) | `supplier_mix_twh` |
| detail.`issuance_irec` | "I-REC" if any row >0 for country/year; else "GO" | `methodology` |
