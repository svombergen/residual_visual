#!/usr/bin/env python3
"""
dataload.py - Merge raw data sources into 01_IssuanceProductionRaw.csv

Each source is aggregated to (country, energy_source, year) then outer-merged
into a single dataset with one row per unique combination.

Sources:
  Barnebies  -> issuance_irec
  TIGRS      -> issuance_tigrs
  Ecogox     -> issuance_ecogox
  Australia  -> issuance_lgc
  AIB Issue  -> issuance_go, issuance_go_expire, issuance_go_cancel
  EMBERS     -> generation
  Oman       -> generation
  AIB ProdRM -> residualmix_gco2kwh

Usage:
  python dataload.py
"""

import sys
from pathlib import Path
from functools import reduce

import pandas as pd
import pycountry

# ── Paths ────────────────────────────────────────────────────────────────────

BASE = Path(__file__).resolve().parent
INPUT = BASE / "input"
RAW = INPUT / "RAW"
OUTPUT = BASE / "01_IssuanceProductionRaw.csv"

MERGE_KEYS = ["country", "energy_source", "year"]
MWH_TO_TWH = 1_000_000


# ── Country code lookup ──────────────────────────────────────────────────────

# Direct name -> ISO3 overrides for names pycountry can't resolve
_ISO3_OVERRIDES = {
    "Brunei": "BRN",
    "Congo, DRC": "COD",
    "Dominican Rep": "DOM",
    "Lao PDR": "LAO",
    "N Cyprus": "CYP",
    "UAE": "ARE",
    "Russian Fed": "RUS",
    "Kosovo": "XKX",
    "Korea (the Republic of)": "KOR",
    "Bosnia Herzegovina": "BIH",
    "Taiwan": "TWN",
    "North Korea": "PRK",
    "Belgium (Brussels)": "BEL",
    "Belgium (Flanders)": "BEL",
    "Belgium (Wallonia)": "BEL",
    "British Virgin Islands": "VGB",
    "US Virgin Islands": "VIR",
    "Falkland Islands": "FLK",
    "Faroe Islands": "FRO",
    "Cayman Islands": "CYM",
    "Turks and Caicos Islands": "TCA",
}

_iso3_cache = {}

def to_iso3(name):
    """Resolve a country name or 2-letter code to ISO 3166-1 alpha-3."""
    if not name or not isinstance(name, str):
        return ""
    key = name.strip()
    if key in _iso3_cache:
        return _iso3_cache[key]

    # Check direct overrides first
    result = _ISO3_OVERRIDES.get(key, "")

    # Already an alpha-3?
    if not result and len(key) == 3 and key.isalpha():
        c = pycountry.countries.get(alpha_3=key.upper())
        if c:
            result = c.alpha_3
    # Try alpha-2
    if not result and len(key) == 2 and key.isalpha():
        c = pycountry.countries.get(alpha_2=key.upper())
        if c:
            result = c.alpha_3
    # Try name lookup
    if not result:
        try:
            c = pycountry.countries.lookup(key)
            result = c.alpha_3
        except LookupError:
            pass

    _iso3_cache[key] = result
    return result


# ── Mappings ─────────────────────────────────────────────────────────────────

# Source-specific technology maps (fallbacks when Mappings.xlsx doesn't cover)

TIGRS_TECH = {
    "solar photovoltaics": "Solar",
    "solar serving on-site load": "Solar",
    "wind": "Wind",
    "geothermal energy": "Other (R)",
    "hydroelectric water (dam/impoundment)": "Hydro",
    "hydroelectric water - dam/impoundment": "Hydro",
    "hydroelectric run-of-river": "Hydro",
    "hydroelectric - run-of-river": "Hydro",
    "biomass combustion - agricultural waste": "Bio",
    "biomass combustion - agricultural products": "Bio",
    "biogas - agricultural methane": "Bio",
    "biogas - wastewater methane": "Bio",
}

AIB_TECH = {
    "renewable - biomass": "Bio",
    "renewable - hydro & marine": "Hydro",
    "renewable - solar": "Solar",
    "renewable - wind": "Wind",
    "renewable - geothermal": "Other (R)",
    "renewable - unspecified & other": "Other (R)",
    "renewable": "Other (R)",
    "nuclear": "Nuclear",
    "nuclear - radioactive fuel": "Nuclear",
    "fossil - hard coal": "Coal",
    "fossil - lignite": "Coal",
    "fossil - brown coal": "Coal",
    "fossil - peat": "Coal",
    "fossil - gas": "Gas",
    "fossil - natural gas": "Gas",
    "fossil - oil": "Oil",
    "fossil - unspecified & other": "Other (F)",
    "fossil": "Other (F)",
    "unknown - unknown": "Other (F)",
}

EMBERS_TECH = {
    "coal": "Coal",
    "gas": "Gas",
    "oil": "Oil",
    "nuclear": "Nuclear",
    "hydro": "Hydro",
    "solar": "Solar",
    "wind": "Wind",
    "bioenergy": "Bio",
    "other fossil": "Other (F)",
    "other renewables": "Other (R)",
    "other renewables excluding bioenergy": "Other (R)",
}

OMAN_TECH = {
    "diesel": "Oil",
    "gas": "Gas",
    "solar energy": "Solar",
    "wind energy": "Wind",
    "others": "Other (F)",
}

ECOGOX_TECH = {
    "filo de agua": "Hydro",
    "embalse": "Hydro",
    "solar": "Solar",
    "eolica": "Wind",
    "biomasa": "Bio",
    "biogas": "Bio",
}


def load_xlsx_mappings():
    """Load Mappings.xlsx for technology + country name standardisation."""
    path = INPUT / "Mappings.xlsx"
    if not path.exists():
        print(f"  WARN: {path} not found - using built-in mappings only")
        return {}, {}

    df_tech = pd.read_excel(path, sheet_name="Technologies")
    tech_map = {}
    for _, r in df_tech.iterrows():
        src = str(r.get("Tech_Source", "")).strip()
        dash = str(r.get("Tech_Dash", "")).strip()
        if src and dash:
            tech_map[src.lower()] = dash

    df_ctry = pd.read_excel(path, sheet_name="Countries")
    country_map = {}
    for _, r in df_ctry.iterrows():
        src = str(r.get("Country_Source", "")).strip()
        dash = str(r.get("Country_Dash", "")).strip()
        if src and dash:
            country_map[src.lower()] = dash

    return tech_map, country_map


def map_tech(raw, source_map, xlsx_map):
    """Try source-specific map, then Mappings.xlsx, then return as-is."""
    if not raw:
        return raw
    key = str(raw).strip().lower()
    return source_map.get(key) or xlsx_map.get(key) or str(raw).strip()


# Hardcoded country name overrides (raw source names -> dashboard names)
COUNTRY_NAME_OVERRIDES = {
    # pycountry / EMBERS variants
    "taiwan, province of china": "Taiwan",
    "taiwan": "Taiwan",
    "türkiye": "Türkiye",
    "turkey": "Türkiye",
    # "(the)" suffixed names
    "bahamas (the)": "Bahamas",
    "cayman islands (the)": "Cayman Islands",
    "central african republic (the)": "Central African Republic",
    "comoros (the)": "Comoros",
    "congo (the)": "Congo",
    "cook islands (the)": "Cook Islands",
    "falkland islands (the) [malvinas]": "Falkland Islands",
    "faroe islands (the)": "Faroe Islands",
    "gambia (the)": "Gambia",
    "niger (the)": "Niger",
    "sudan (the)": "Sudan",
    "turks and caicos islands (the)": "Turks and Caicos Islands",
    # Long-form official names
    "iran (islamic republic of)": "Iran",
    "korea (the democratic people's republic of)": "North Korea",
    "korea (the republic of)": "Korea (the Republic of)",
    "russian federation (the)": "Russian Fed",
    "syrian arab republic (the)": "Syria",
    "tanzania, the united republic of": "Tanzania",
    "venezuela (bolivarian republic of)": "Venezuela",
    "virgin islands (british)": "British Virgin Islands",
    "virgin islands (u.s.)": "US Virgin Islands",
    # Other variants
    "bosnia and herzegovina": "Bosnia Herzegovina",
    "bosnia herzegovina": "Bosnia Herzegovina",
    "brunei": "Brunei",
    "cote d'ivoire": "Côte d'Ivoire",
    "reunion": "Réunion",
    "russian fed": "Russian Fed",
    "kosovo": "Kosovo",
    # Belgium sub-regions (keep separate, map to BEL)
    "belgium (brussels)": "Belgium (Brussels)",
    "belgium (flanders)": "Belgium (Flanders)",
    "belgium (wallonia)": "Belgium (Wallonia)",
    # Test rows — drop these
    "irectestrow1": "_TEST_",
    "irectestrow4": "_TEST_",
    "irectestrow7": "_TEST_",
    "tigrstestdata1": "_TEST_",
    "tigrstestdata5": "_TEST_",
}


def map_country(raw, xlsx_map):
    if not raw:
        return raw
    key = str(raw).strip().lower()
    # Check hardcoded overrides first
    if key in COUNTRY_NAME_OVERRIDES:
        return COUNTRY_NAME_OVERRIDES[key]
    return xlsx_map.get(key, str(raw).strip())


# ── Source loaders ───────────────────────────────────────────────────────────
# Each returns a DataFrame with columns: country, energy_source, year, + value cols
# Already aggregated to (country, energy_source, year).

def load_barnebies(tech_map, country_map):
    """I-REC issuance from Barnebies Excel."""
    path = INPUT / "Barnebies Data 08.10.25.xlsx"
    if not path.exists():
        print("  SKIP  Barnebies - file not found")
        return pd.DataFrame()

    df = pd.read_excel(path, sheet_name="Issuance")
    df = df.rename(columns={
        "Issue Country": "country",
        "Technology Final": "energy_source",
        "Year of Vintage": "year",
        "Volume Issued": "issuance_irec",
    })
    df["country"] = df["country"].apply(lambda c: map_country(c, country_map))
    df["energy_source"] = df["energy_source"].apply(lambda t: map_tech(t, {}, tech_map))
    df["issuance_irec"] = pd.to_numeric(df["issuance_irec"], errors="coerce").fillna(0) / MWH_TO_TWH
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df = df.dropna(subset=["country", "year"])
    df["year"] = df["year"].astype(int)

    agg = df.groupby(MERGE_KEYS, as_index=False)["issuance_irec"].sum()
    print(f"  OK    Barnebies (I-REC): {len(agg):,} rows")
    return agg


def load_tigrs(tech_map, country_map):
    """TIGRS certificate data from yearly CSVs."""
    tigrs_dir = RAW / "TIGRS"
    if not tigrs_dir.exists():
        print("  SKIP  TIGRS - dir not found")
        return pd.DataFrame()

    frames = []
    for csv_path in sorted(tigrs_dir.glob("TIGRS *.csv")):
        frames.append(pd.read_csv(csv_path))
    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    df["country"] = df["Country"].apply(lambda c: map_country(c, country_map))
    df["energy_source"] = df["Fuel Type Description"].apply(lambda t: map_tech(t, TIGRS_TECH, tech_map))
    df["issuance_tigrs"] = pd.to_numeric(
        df["Number of TIGRs"].astype(str).str.replace(",", ""), errors="coerce"
    ).fillna(0) / MWH_TO_TWH
    df["year"] = pd.to_numeric(df["Year"], errors="coerce")
    df = df.dropna(subset=["country", "year"])
    df["year"] = df["year"].astype(int)

    agg = df.groupby(MERGE_KEYS, as_index=False)["issuance_tigrs"].sum()
    print(f"  OK    TIGRS: {len(agg):,} rows")
    return agg


def load_ecogox(tech_map, country_map):
    """Ecogox GO data (Colombia) - monthly aggregated to yearly."""
    path = RAW / "Ecogox" / "Ecogox data.xlsx"
    if not path.exists():
        print("  SKIP  Ecogox - file not found")
        return pd.DataFrame()

    df = pd.read_excel(path, sheet_name="Sheet1")
    df["country"] = "Colombia"
    df["energy_source"] = df["type"].apply(lambda t: map_tech(t, ECOGOX_TECH, tech_map))
    df["issuance_ecogox"] = pd.to_numeric(df["total_GOs"], errors="coerce").fillna(0) / (MWH_TO_TWH * 1_000)  # kWh → TWh
    df = df.rename(columns={"year": "year"})

    agg = df.groupby(MERGE_KEYS, as_index=False)["issuance_ecogox"].sum()
    print(f"  OK    Ecogox: {len(agg):,} rows")
    return agg


def load_australia(tech_map, country_map):
    """Australian LGC issuance (already in TWh)."""
    path = RAW / "Australia" / "australia_raw_260218.csv"
    if not path.exists():
        print("  SKIP  Australia - file not found")
        return pd.DataFrame()

    df = pd.read_csv(path)
    df["country"] = df["Country"].apply(lambda c: map_country(c, country_map))
    df["energy_source"] = df["Technology"].apply(lambda t: map_tech(t, {}, tech_map))
    df["issuance_lgc"] = pd.to_numeric(df["Issuance_EXT"], errors="coerce").fillna(0)
    df = df.rename(columns={"Year": "year"})
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df = df.dropna(subset=["country", "year"])
    df["year"] = df["year"].astype(int)

    agg = df.groupby(MERGE_KEYS, as_index=False)["issuance_lgc"].sum()
    print(f"  OK    Australia: {len(agg):,} rows")
    return agg


def _parse_aib_domain(domain):
    """'NO - Norway' -> 'Norway'."""
    if not isinstance(domain, str):
        return ""
    parts = domain.split(" - ", 1)
    return parts[1].strip() if len(parts) == 2 else domain.strip()


def load_aib_issue(tech_map, country_map):
    """AIB European GO issuance - monthly CSVs aggregated yearly."""
    aib_dir = RAW / "AIB" / "Issue"
    if not aib_dir.exists():
        print("  SKIP  AIB Issue - dir not found")
        return pd.DataFrame()

    # Only load files matching the official AIB naming pattern; ignore debug exports
    frames = [pd.read_csv(p) for p in sorted(aib_dir.glob("AIB_EECS*.csv"))]
    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    df["country"] = df["domain_name"].apply(
        lambda d: map_country(_parse_aib_domain(d), country_map)
    )
    df["energy_source"] = df["energy_source_level2"].apply(
        lambda t: AIB_TECH.get(str(t).strip().lower(), str(t).strip()) if pd.notna(t) else ""
    )

    for col in ("production_date_issue", "production_date_expire", "production_date_cancel"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df = df.rename(columns={"year": "year"})
    df = df.dropna(subset=["country", "year"])

    agg = (
        df.groupby(MERGE_KEYS, as_index=False)
        .agg(
            _issue_raw=("production_date_issue", "sum"),
            issuance_go_expire=("production_date_expire", "sum"),
            issuance_go_cancel=("production_date_cancel", "sum"),
        )
    )
    for col in ("_issue_raw", "issuance_go_expire", "issuance_go_cancel"):
        agg[col] = agg[col] / MWH_TO_TWH
    # Net GO issuance: issued production minus expired production, floored at 0.
    # Expire can exceed issue in a given year when prior-year GOs expire; those
    # simply reduce to zero rather than going negative.
    agg["issuance_go"] = (agg["_issue_raw"] - agg["issuance_go_expire"]).clip(lower=0)
    agg.drop(columns=["_issue_raw"], inplace=True)

    print(f"  OK    AIB Issue: {len(agg):,} rows")
    return agg


def load_embers(tech_map, country_map):
    """EMBERS global generation + CO2 emissions per fuel type."""
    path = INPUT / "EMBERS yearly_full_release_long_format.csv"
    if not path.exists():
        print("  SKIP  EMBERS - file not found")
        return pd.DataFrame(), pd.DataFrame()

    df = pd.read_csv(path, low_memory=False)
    country_mask = df["Area type"] == "Country or economy"

    # --- Generation (TWh) ---
    gen_mask = country_mask & (df["Category"] == "Electricity generation") & (df["Subcategory"] == "Fuel") & (df["Unit"] == "TWh")
    gen = df.loc[gen_mask].copy()
    gen["country"] = gen["Area"].apply(lambda a: map_country(a, country_map))
    gen["energy_source"] = gen["Variable"].apply(
        lambda v: EMBERS_TECH.get(str(v).strip().lower(), str(v).strip()) if pd.notna(v) else ""
    )
    gen["generation"] = pd.to_numeric(gen["Value"], errors="coerce")
    gen = gen.rename(columns={"Year": "year"})
    gen = gen.dropna(subset=["country", "year", "generation"])
    gen["year"] = gen["year"].astype(int)
    agg_gen = gen.groupby(MERGE_KEYS, as_index=False)["generation"].sum()

    # --- CO2 emissions per fuel (mtCO2) ---
    co2_mask = country_mask & (df["Category"] == "Power sector emissions") & (df["Subcategory"] == "Fuel") & (df["Unit"] == "mtCO2")
    co2 = df.loc[co2_mask].copy()

    EMBERS_CO2_TECH = {
        "coal": "Coal", "gas": "Gas", "hydro": "Hydro", "solar": "Solar",
        "wind": "Wind", "bioenergy": "Bio", "nuclear": "Nuclear",
        "other fossil": "Other (F)", "other renewables": "Other (R)",
    }
    co2["country"] = co2["Area"].apply(lambda a: map_country(a, country_map))
    co2["energy_source"] = co2["Variable"].apply(
        lambda v: EMBERS_CO2_TECH.get(str(v).strip().lower(), str(v).strip()) if pd.notna(v) else ""
    )
    co2["total_co2"] = pd.to_numeric(co2["Value"], errors="coerce")
    co2 = co2.rename(columns={"Year": "year"})
    co2 = co2.dropna(subset=["country", "year", "total_co2"])
    co2["year"] = co2["year"].astype(int)
    agg_co2 = co2.groupby(MERGE_KEYS, as_index=False)["total_co2"].sum()

    print(f"  OK    EMBERS generation: {len(agg_gen):,} rows, CO2: {len(agg_co2):,} rows")
    return agg_gen, agg_co2


def load_oman():
    """Oman generation by fuel type (wide -> long)."""
    path = RAW / "Oman" / "Oman_20250924.xlsx"
    if not path.exists():
        print("  SKIP  Oman - file not found")
        return pd.DataFrame()

    df = pd.read_excel(path, sheet_name="Electricity production")

    prod_col = df.columns[1]
    mask = df[prod_col].astype(str).str.strip() == "Total production"
    df = df.loc[mask]

    year_cols = [c for c in df.columns[2:] if isinstance(c, (int, float))]

    records = []
    for _, r in df.iterrows():
        source = str(r.iloc[0]).strip()
        if source.lower() == "total":
            continue
        tech = OMAN_TECH.get(source.lower(), source)

        for yc in year_cols:
            val = pd.to_numeric(r[yc], errors="coerce")
            if pd.isna(val):
                continue
            records.append({"country": "Oman", "energy_source": tech, "year": int(yc), "generation": val})

    agg = pd.DataFrame(records)
    if not agg.empty:
        agg = agg.groupby(MERGE_KEYS, as_index=False)["generation"].sum()
    print(f"  OK    Oman: {len(agg):,} rows")
    return agg


PRODMIX_TECH = {
    "re unspecified": "Other (R)",
    "re biomass":     "Bio",
    "re solar":       "Solar",
    "re geothermal":  "Other (R)",
    "re wind":        "Wind",
    "re hydro":       "Hydro",
    "nuclear":        "Nuclear",
    "fo unspecified": "Other (F)",
    "fo hard coal":   "Coal",
    "fo lignite":     "Coal",
    "fo oil":         "Oil",
    "fo gas":         "Gas",
}


def load_aib_production_mix(country_map):
    """AIB Production Mix - per country/energy_source/year generation in TWh.

    Each ProdRM xlsx has a 'Production Mix' sheet with:
      col 0  : country ISO2 code
      col 1  : Volume [TWh]  (total generation)
      cols 2+: energy-source shares (0-1 fractions); TWh = volume * share
    """
    rm_dir = RAW / "AIB" / "ProdRM"
    if not rm_dir.exists():
        return pd.DataFrame()

    records = []
    for xlsx in sorted(rm_dir.glob("*.xlsx")):
        digits = "".join(c for c in xlsx.name if c.isdigit())
        if len(digits) < 4:
            continue
        year = int(digits[:4])

        try:
            xl = pd.ExcelFile(xlsx)
            pm_sheet = next(
                (n for n in xl.sheet_names if "production mix" in n.lower()), None
            )
            if not pm_sheet:
                continue
            df = pd.read_excel(xlsx, sheet_name=pm_sheet, header=None)
        except Exception as e:
            print(f"  WARN  Could not read production mix from {xlsx.name}: {e}")
            continue

        # Row 0 = headers, rows 1+ = country data
        headers = [str(h).strip().lower().rstrip() for h in df.iloc[0]]

        vol_idx = next(
            (i for i, h in enumerate(headers) if "volume" in h and "twh" in h.replace(" ", "").lower()),
            None,
        )
        if vol_idx is None:
            print(f"  WARN  No Volume column in production mix sheet of {xlsx.name}")
            continue

        co2_idx = next(
            (i for i, h in enumerate(headers) if "co2" in h and "kwh" in h),
            None,
        )

        # col index -> standard energy_source
        src_cols = {i: PRODMIX_TECH[h] for i, h in enumerate(headers) if h in PRODMIX_TECH}

        for _, row in df.iloc[1:].iterrows():
            iso2 = str(row.iloc[0]).strip()
            if not iso2 or iso2.lower() in ("none", "nan", ""):
                continue

            c_obj = pycountry.countries.get(alpha_2=iso2)
            raw_name = c_obj.name if c_obj else iso2
            country = map_country(raw_name, country_map)

            volume = pd.to_numeric(row.iloc[vol_idx], errors="coerce")
            if pd.isna(volume) or volume <= 0:
                continue

            co2_intensity = pd.to_numeric(row.iloc[co2_idx], errors="coerce") if co2_idx is not None else None

            for col_idx, src in src_cols.items():
                pct = pd.to_numeric(row.iloc[col_idx], errors="coerce")
                if pd.isna(pct) or pct <= 0:
                    continue
                records.append({
                    "country": country,
                    "energy_source": src,
                    "year": year,
                    "aib_generation": volume * pct,
                    "generation_gco2kwh": co2_intensity,
                })

    if not records:
        print("  SKIP  AIB ProdRM generation - no data found")
        return pd.DataFrame()

    # Group: sum generation per source, take first CO2 intensity (same for all sources in a country/year)
    agg = (
        pd.DataFrame(records)
        .groupby(MERGE_KEYS, as_index=False)
        .agg(aib_generation=("aib_generation", "sum"),
             generation_gco2kwh=("generation_gco2kwh", "first"))
    )
    print(f"  OK    AIB ProdRM generation: {len(agg):,} rows")
    return agg


def load_aib_residual_mix(country_map):
    """AIB Residual Mix - country/year-level CO2 intensity from 'Residual Mixes' sheet."""
    rm_dir = RAW / "AIB" / "ProdRM"
    if not rm_dir.exists():
        print("  SKIP  AIB ProdRM - dir not found")
        return pd.DataFrame()

    records = []
    for xlsx in sorted(rm_dir.glob("*.xlsx")):
        digits = "".join(c for c in xlsx.name if c.isdigit())
        if len(digits) < 4:
            continue
        year = int(digits[:4])

        try:
            xl = pd.ExcelFile(xlsx)
            rm_sheet = next(
                (n for n in xl.sheet_names if "residual mix" in n.lower() and "comparison" not in n.lower()),
                None,
            )
            if not rm_sheet:
                print(f"  WARN  No Residual Mixes sheet in {xlsx.name}")
                continue
            df = pd.read_excel(xlsx, sheet_name=rm_sheet, header=0)
        except Exception as e:
            print(f"  WARN  Could not read {xlsx.name}: {e}")
            continue

        co2_col = next((c for c in df.columns if "CO2" in str(c)), None)

        for _, r in df.iterrows():
            iso2 = str(r.iloc[0]).strip()
            if not iso2 or iso2.lower() in ("none", "nan", ""):
                continue

            c_obj = pycountry.countries.get(alpha_2=iso2)
            raw_name = c_obj.name if c_obj else iso2
            country = map_country(raw_name, country_map)

            co2 = pd.to_numeric(r.get(co2_col), errors="coerce") if co2_col else None

            records.append({
                "country": country,
                "year": year,
                "residualmix_gco2kwh": co2,
            })

    agg = pd.DataFrame(records)
    if not agg.empty:
        agg = agg.groupby(["country", "year"], as_index=False)["residualmix_gco2kwh"].first()
    print(f"  OK    AIB ProdRM: {len(agg):,} rows (country/year level)")
    return agg


# ── Merge ────────────────────────────────────────────────────────────────────

def merge_sources(frames):
    """Outer-merge a list of DataFrames on (country, energy_source, year).

    When two sources contribute the same value column (e.g. both EMBERS and
    Oman supply 'generation'), the duplicates are summed and collapsed back
    to a single column.
    """
    non_empty = [f for f in frames if f is not None and not f.empty]
    if not non_empty:
        return pd.DataFrame()

    merged = reduce(
        lambda left, right: pd.merge(left, right, on=MERGE_KEYS, how="outer"),
        non_empty,
    )

    # Collapse duplicate value columns created by merge (e.g. generation_x, generation_y)
    seen = {}
    for col in list(merged.columns):
        if col in MERGE_KEYS:
            continue
        base = col.rsplit("_", 1)[0] if col.endswith(("_x", "_y")) else col
        if base not in seen:
            seen[base] = []
        seen[base].append(col)

    for base, cols in seen.items():
        if len(cols) > 1:
            merged[base] = merged[cols].sum(axis=1, min_count=1)
            merged.drop(columns=[c for c in cols if c != base], inplace=True)

    return merged


# ── Energy source classification ─────────────────────────────────────────────

ENERGY_CLASS = {
    "Bio": "RES", "Hydro": "RES", "Solar": "RES", "Wind": "RES", "Other (R)": "RES",
    "Coal": "Fossil", "Gas": "Fossil", "Oil": "Fossil", "Other (F)": "Fossil",
    "Nuclear": "Nuclear",
}

# ── Source attribution ───────────────────────────────────────────────────────

SOURCE_NAMES = {
    "issuance_irec": "International Tracking Standard Foundation",
    "issuance_tigrs": "XPANSIV",
    "issuance_ecogox": "Ecogox",
    "issuance_lgc": "Clean Energy Regulator Australia",
    "issuance_go": "AIB",
}

ISSUANCE_COLS = ["issuance_irec", "issuance_tigrs", "issuance_ecogox", "issuance_lgc", "issuance_go"]

RAW_VALUE_COLS = [
    "issuance_irec", "issuance_tigrs", "issuance_ecogox", "issuance_lgc",
    "issuance_go", "issuance_go_expire", "issuance_go_cancel",
    "aib_generation", "generation_gco2kwh", "generation", "total_co2",
]

# Detail-level output (per country/year/energy_source)
DETAIL_COLS = [
    "country", "country_code", "year", "energy_source", "class",
    "issuance_irec", "issuance_tigrs", "issuance_ecogox", "issuance_lgc",
    "issuance_go", "issuance_go_expire", "issuance_go_cancel",
    "issuance_ext", "issuance_total", "certified_mix",
    "total_generation", "residual_mix", "total_co2", "emission_factor",
    "sources", "methodology", "issuance",
]

# Aggregated output (per country/year) — computed from detail rows
AGG_COLS = [
    "country", "country_code", "year",
    "total_generation", "total_co2", "total_certified",
    "perc_tracked_total", "perc_residual", "perc_tracked_renewables", "perc_green",
    "generation_gco2kwh", "residualmix_gco2kwh", "methodology",
]

OUTPUT_DETAIL = BASE / "01_detail.csv"
OUTPUT_AGG = BASE / "01_aggregated.csv"


def main():
    print("Loading mappings...")
    tech_map, country_map = load_xlsx_mappings()
    print(f"  Tech: {len(tech_map)}, Countries: {len(country_map)}\n")

    print("Loading & aggregating sources...")
    embers_gen, embers_co2 = load_embers(tech_map, country_map)
    aib_rm = load_aib_residual_mix(country_map)  # country/year level, separate from detail merge

    # Detail-level sources (per country/energy_source/year)
    detail_frames = [
        load_barnebies(tech_map, country_map),
        load_tigrs(tech_map, country_map),
        load_ecogox(tech_map, country_map),
        load_australia(tech_map, country_map),
        load_aib_issue(tech_map, country_map),
        load_aib_production_mix(country_map),
        embers_gen,
        embers_co2,
        load_oman(),
    ]

    print("\nMerging on (country, energy_source, year)...")
    df = merge_sources(detail_frames)

    if df.empty:
        print("No data loaded.")
        sys.exit(1)

    # Drop test rows
    df = df[df["country"] != "_TEST_"]

    # Ensure raw value columns exist and are numeric (keep NaN as blank)
    for col in RAW_VALUE_COLS:
        if col not in df.columns:
            df[col] = pd.NA
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Filter to target year range
    df = df[(df["year"] >= 2020) & (df["year"] <= 2024)]

    # Drop rows with unmapped / non-standard energy sources
    STANDARD_SOURCES = {"Wind", "Solar", "Hydro", "Bio", "Coal", "Gas", "Oil", "Nuclear", "Other (R)", "Other (F)"}
    bad = df[~df["energy_source"].isin(STANDARD_SOURCES)]["energy_source"].dropna().unique()
    if len(bad):
        print(f"  WARN  Dropping {len(df[~df['energy_source'].isin(STANDARD_SOURCES)])} rows with unmapped energy sources: {sorted(bad)}")
    df = df[df["energy_source"].isin(STANDARD_SOURCES)]

    # ── Derived columns ──────────────────────────────────────────────────────

    # issuance_ext = all non-IREC issuance summed
    ext_cols = ["issuance_tigrs", "issuance_ecogox", "issuance_lgc", "issuance_go"]
    df["issuance_ext"] = df[ext_cols].sum(axis=1, min_count=1)

    # issuance_total = issuance_irec + issuance_ext
    df["issuance_total"] = df[["issuance_irec", "issuance_ext"]].sum(axis=1, min_count=1)

    # certified_mix (TWh) = tracked generation per energy source
    # GO countries: issuance_go is already net (issue - expire), use directly
    # Others:       issuance_total
    has_go = df["issuance_go"].notna() & (df["issuance_go"] > 0)
    df["certified_mix"] = pd.NA
    df.loc[has_go, "certified_mix"] = df.loc[has_go, "issuance_go"]
    df.loc[~has_go, "certified_mix"] = df.loc[~has_go, "issuance_total"]

    # For country/years covered by the AIB production mix, use AIB generation exclusively.
    # EMBERS is not used as a fallback for sources AIB reports at zero — if AIB has no
    # entry for a source (e.g. Bio in Norway), generation stays null for that row.
    if "aib_generation" in df.columns:
        covered = (
            df.loc[df["aib_generation"].notna() & (df["aib_generation"] > 0), ["country", "year"]]
            .drop_duplicates()
            .assign(_aib_covered=True)
        )
        df = df.merge(covered, on=["country", "year"], how="left")
        is_covered = df["_aib_covered"].fillna(False)
        df.loc[is_covered, "generation"] = df.loc[is_covered, "aib_generation"]
        df.drop(columns=["_aib_covered"], inplace=True)

    # Rename generation -> total_generation
    df["total_generation"] = df["generation"]

    # residual_mix = total_generation - certified_mix
    df["residual_mix"] = df["total_generation"] - df["certified_mix"].fillna(0)
    df.loc[df["residual_mix"] < 0, "residual_mix"] = 0

    # total_co2: EMBERS mtCO2 -> scaled so emission_factor = total_co2 / gen gives gCO2/kWh
    df["total_co2"] = df["total_co2"] * 1000

    # For AIB production-mix sources: override total_co2 using the AIB CO2 intensity.
    # generation_gco2kwh (gCO2/kWh) × aib_generation (TWh) = ktCO2, same unit as EMBERS-derived total_co2.
    if "generation_gco2kwh" in df.columns and "aib_generation" in df.columns:
        has_aib = df["aib_generation"].notna() & (df["aib_generation"] > 0)
        df.loc[has_aib, "total_co2"] = df.loc[has_aib, "generation_gco2kwh"] * df.loc[has_aib, "aib_generation"]

    # emission_factor = total_co2 / total_generation (gCO2/kWh)
    df["emission_factor"] = df["total_co2"] / df["total_generation"].replace(0, pd.NA)

    # class (RES/Fossil/Nuclear)
    df["class"] = df["energy_source"].map(ENERGY_CLASS).fillna("")

    # issuance: which issuance system covers this row
    # I-REC (Barnebies): Nuclear/Fossil -> "I-TRACK(E)", RES -> "I-REC(E)"
    RES_CLASSES = {"RES"}
    def get_issuance(row):
        if pd.notna(row.get("issuance_go")) and row["issuance_go"] > 0:
            return "AIB"
        if pd.notna(row.get("issuance_tigrs")) and row["issuance_tigrs"] > 0:
            return "TIGRS"
        if pd.notna(row.get("issuance_ecogox")) and row["issuance_ecogox"] > 0:
            return "Ecogox"
        if pd.notna(row.get("issuance_lgc")) and row["issuance_lgc"] > 0:
            return "LGC"
        if pd.notna(row.get("issuance_irec")) and row["issuance_irec"] > 0:
            cls = row.get("class", "")
            return "I-REC(E)" if cls in RES_CLASSES else "I-TRACK(E)"
        return ""
    df["issuance"] = df.apply(get_issuance, axis=1)

    # methodology: I-REC if row has Barnebies (issuance_irec) data, else GO
    def get_methodology(row):
        v = row.get("issuance_irec")
        if pd.notna(v) and v > 0:
            return "I-REC"
        return "GO"
    df["methodology"] = df.apply(get_methodology, axis=1)

    # sources: comma-separated list of actual data sources contributing to this row
    def get_sources(row):
        s = []
        for col, name in SOURCE_NAMES.items():
            v = row.get(col)
            if pd.notna(v) and v > 0:
                if col == "issuance_irec":
                    s.append("I-REC")
                else:
                    s.append(name)
        if pd.notna(row.get("generation")) and row["generation"] > 0:
            s.append("EMBERS")
        return ", ".join(s) if s else ""
    df["sources"] = df.apply(get_sources, axis=1)

    # Drop rows where there's no meaningful data
    check_cols = ["issuance_total", "total_generation", "total_co2"]
    def row_has_data(row):
        return any(pd.notna(row.get(c)) and row.get(c) != 0 for c in check_cols if c in row.index)
    mask = df.apply(row_has_data, axis=1)
    dropped = len(df) - mask.sum()
    df = df.loc[mask]
    print(f"  Dropped {dropped:,} empty rows")

    # Add ISO3 country codes
    df["country_code"] = df["country"].apply(to_iso3)
    unresolved = df.loc[df["country_code"] == "", "country"].unique()
    if len(unresolved):
        print(f"  WARN  {len(unresolved)} countries without ISO3: {list(unresolved[:10])}")

    df["year"] = df["year"].astype(int)

    # ── Detail output ────────────────────────────────────────────────────────
    detail = df[[c for c in DETAIL_COLS if c in df.columns]].sort_values(
        ["country", "year", "energy_source"]
    ).reset_index(drop=True)
    detail.to_csv(OUTPUT_DETAIL, index=False)
    print(f"\nDetail  -> {OUTPUT_DETAIL.name}: {len(detail):,} rows, "
          f"{detail['country'].nunique()} countries, years {detail['year'].min()}-{detail['year'].max()}")

    # ── Aggregated output (computed from detail rows) ────────────────────────
    grp = df.groupby(["country", "country_code", "year"], as_index=False).agg(
        total_generation=("total_generation", "sum"),
        total_co2=("total_co2", "sum"),
        total_certified=("certified_mix", "sum"),
        total_renewable_gen=("total_generation", lambda x: x[df.loc[x.index, "class"] == "RES"].sum()),
        total_certified_renewable=("certified_mix", lambda x: x[df.loc[x.index, "class"] == "RES"].sum()),
    )

    grp["perc_tracked_total"] = (grp["total_certified"] / grp["total_generation"].replace(0, pd.NA)) * 100
    grp["perc_residual"] = 100 - grp["perc_tracked_total"].fillna(0)
    grp["perc_tracked_renewables"] = (grp["total_certified_renewable"] / grp["total_renewable_gen"].replace(0, pd.NA)) * 100
    grp["perc_green"] = (grp["total_renewable_gen"] / grp["total_generation"].replace(0, pd.NA)) * 100

    # Add generation_gco2kwh (AIB production mix CO2 intensity) to aggregated output.
    # Then override total_co2 = generation_gco2kwh × total_generation for covered country/years.
    if "generation_gco2kwh" in df.columns:
        gco2 = (
            df[df["generation_gco2kwh"].notna()]
            .groupby(["country", "country_code", "year"], as_index=False)["generation_gco2kwh"]
            .first()
        )
        grp = grp.merge(gco2, on=["country", "country_code", "year"], how="left")
        has_gco2 = grp["generation_gco2kwh"].notna()
        grp.loc[has_gco2, "total_co2"] = (
            grp.loc[has_gco2, "generation_gco2kwh"] * grp.loc[has_gco2, "total_generation"]
        )
    else:
        grp["generation_gco2kwh"] = pd.NA

    # Merge AIB residual mix CO2 intensity (country/year level)
    if not aib_rm.empty:
        grp = grp.merge(aib_rm, on=["country", "year"], how="left")
    else:
        grp["residualmix_gco2kwh"] = pd.NA

    # methodology: I-REC if country/year has Barnebies (issuance_irec) data, else GO
    has_irec = df.groupby(["country", "year"])["issuance_irec"].apply(
        lambda s: s.notna().any() and (s > 0).any()
    ).reset_index(name="_has_irec")
    has_irec["methodology"] = has_irec["_has_irec"].map({True: "I-REC", False: "GO"})
    grp = grp.merge(has_irec[["country", "year", "methodology"]], on=["country", "year"], how="left")

    grp = grp[[c for c in AGG_COLS if c in grp.columns]].sort_values(
        ["country", "year"]
    ).reset_index(drop=True)
    grp.to_csv(OUTPUT_AGG, index=False)
    print(f"Aggreg. -> {OUTPUT_AGG.name}: {len(grp):,} rows, "
          f"{grp['country'].nunique()} countries")


def _parse_eu(v):
    """Parse European comma-decimal string to float."""
    if v is None or v == "":
        return None
    s = str(v).strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return v


def _merge_and_diff(aib_df, ori_df, key_cols, compare_cols, round_2_cols,
                    round_0_cols, sort_cols, merged_path, mismatch_path, label):
    """Generic merge+diff for both aggregated and detail level."""
    aib_df = aib_df.copy()
    ori_df = ori_df.copy()
    aib_df["source"] = "aib"
    ori_df["source"] = "ori"

    # Align columns
    all_cols = list(dict.fromkeys(
        key_cols + ["source"]
        + [c for c in ori_df.columns if c != "source"]
        + [c for c in aib_df.columns if c != "source"]
    ))
    for col in all_cols:
        if col not in ori_df.columns:
            ori_df[col] = pd.NA
        if col not in aib_df.columns:
            aib_df[col] = pd.NA

    merged = pd.concat([ori_df[all_cols], aib_df[all_cols]], ignore_index=True)

    # Round to match precision
    for col in round_2_cols:
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").round(2)
    for col in round_0_cols:
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").round(0)

    merged = merged.sort_values(sort_cols + ["source"]).reset_index(drop=True)
    # Move sources, methodology and method to last positions
    tail_cols = [c for c in ("sources", "methodology", "issuance") if c in merged.columns]
    if tail_cols:
        rest = [c for c in merged.columns if c not in tail_cols]
        merged = merged[rest + tail_cols]
    merged.to_csv(merged_path, index=False)
    print(f"  {label} merged  -> {merged_path.name}: {len(merged):,} rows "
          f"(ori: {len(ori_df)}, aib: {len(aib_df)})")

    # --- Find mismatches ---
    valid = merged[merged["country_code"].notna() & (merged["country_code"] != "")]
    v_ori = valid[valid["source"] == "ori"]
    v_aib = valid[valid["source"] == "aib"]

    def make_key(row):
        return tuple(row[c] for c in key_cols)

    ori_keys = set(v_ori.apply(make_key, axis=1))
    aib_keys = set(v_aib.apply(make_key, axis=1))
    both_keys = ori_keys & aib_keys

    # Only compare columns that both sides actually have (non-empty)
    ori_has = set(v_ori.columns[v_ori.notna().any()])
    aib_has = set(v_aib.columns[v_aib.notna().any()])
    shared_compare = [c for c in compare_cols if c in ori_has and c in aib_has]

    diff_keys = set()
    for key in both_keys:
        mask_o = pd.Series(True, index=v_ori.index)
        mask_a = pd.Series(True, index=v_aib.index)
        for i, c in enumerate(key_cols):
            mask_o = mask_o & (v_ori[c] == key[i])
            mask_a = mask_a & (v_aib[c] == key[i])
        o = v_ori[mask_o].iloc[0]
        a = v_aib[mask_a].iloc[0]
        for col in shared_compare:
            ov, av = o.get(col), a.get(col)
            if pd.isna(ov) and pd.isna(av):
                continue
            if pd.isna(ov) or pd.isna(av) or ov != av:
                diff_keys.add(key)
                break

    mismatch = valid[valid.apply(
        lambda r: make_key(r) in diff_keys, axis=1
    )].sort_values(sort_cols + ["source"]).reset_index(drop=True)

    mismatch[compare_cols] = mismatch[compare_cols].fillna(0)
    # Move sources, methodology and issuance to last positions
    tail_cols = [c for c in ("sources", "methodology", "issuance") if c in mismatch.columns]
    if tail_cols:
        rest = [c for c in mismatch.columns if c not in tail_cols]
        mismatch = mismatch[rest + tail_cols]
    mismatch.to_csv(mismatch_path, index=False)
    print(f"  {label} mismatches -> {mismatch_path.name}: {len(diff_keys)} pairs, "
          f"{len(mismatch)} rows")
    print(f"  {label} matching: {len(both_keys) - len(diff_keys)} / {len(both_keys)}")


def verify():
    """Compare outputs against existing data.js / data_detail.js and produce
    merged + mismatch CSVs for both aggregated and detail level."""
    import json

    DATA_DIR = BASE.parent / "public_html" / "data"

    # ── Aggregated ────────────────────────────────────────────────────────
    datajs_path = DATA_DIR / "data.js"
    if OUTPUT_AGG.exists() and datajs_path.exists():
        print("Verify aggregated:")
        aib_agg = pd.read_csv(OUTPUT_AGG, encoding="utf-8")

        with open(datajs_path, "r", encoding="utf-8") as f:
            orig_data = json.loads(f.read().replace("window.DATA = ", ""))
        ori_agg = pd.DataFrame(orig_data)
        agg_numeric = [
            "total_generation", "total_co2",
        ]
        for col in agg_numeric:
            if col in ori_agg.columns:
                ori_agg[col] = ori_agg[col].apply(_parse_eu)

        _merge_and_diff(
            aib_df=aib_agg,
            ori_df=ori_agg,
            key_cols=["country_code", "year"],
            compare_cols=agg_numeric,
            round_2_cols=["total_generation", "total_certified", "perc_tracked_total",
                          "perc_residual", "perc_tracked_renewables", "perc_green",
                          "residualmix_gco2kwh"],
            round_0_cols=["total_co2"],
            sort_cols=["country", "year"],
            merged_path=BASE / "01_agg_merged.csv",
            mismatch_path=BASE / "01_agg_mismatches.csv",
            label="Agg",
        )
    else:
        print("Skipping aggregated verify (files missing)")

    # ── Detail ────────────────────────────────────────────────────────────
    detail_js_path = DATA_DIR / "data_detail.js"
    if OUTPUT_DETAIL.exists() and detail_js_path.exists():
        print("Verify detail:")
        aib_detail = pd.read_csv(OUTPUT_DETAIL, encoding="utf-8")

        with open(detail_js_path, "r", encoding="utf-8") as f:
            orig_detail = json.loads(f.read().replace("window.DATA_DETAIL = ", ""))
        ori_detail = pd.DataFrame(orig_detail)
        detail_numeric = [
            "certified_mix", "issuance_ext", "issuance_irec",
            "residual_mix", "total_generation", "total_co2",
        ]
        for col in detail_numeric:
            if col in ori_detail.columns:
                ori_detail[col] = ori_detail[col].apply(_parse_eu)

        _merge_and_diff(
            aib_df=aib_detail,
            ori_df=ori_detail,
            key_cols=["country_code", "year", "energy_source"],
            compare_cols=detail_numeric,
            round_2_cols=["certified_mix", "issuance_ext", "issuance_irec",
                          "residual_mix", "total_generation", "emission_factor"],
            round_0_cols=["total_co2"],
            sort_cols=["country", "year", "energy_source"],
            merged_path=BASE / "01_detail_merged.csv",
            mismatch_path=BASE / "01_detail_mismatches.csv",
            label="Detail",
        )
    else:
        print("Skipping detail verify (files missing)")


if __name__ == "__main__":
    main()
    print()
    verify()
