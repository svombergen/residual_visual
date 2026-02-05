#!/usr/bin/env python3
# csv_to_exampledata_json.py

import csv
import json
import re
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

import pycountry

DROP_COLS = {"Key", "Generation", "Untracked Electricity", "Emissions_Generation"}

# CSV header -> desired JSON field name
RENAME_MAP = {
    "Country": "country",
    "Year": "year",
    "Technology": "energy_source",
    "Issuance Total": "certified_mix",
    "Residual Mix": "residual_mix",
    "Emission Factors": "emission_factor",
    # Abbreviation handled separately (ISO2 -> ISO3)
    # Class is kept; will become "class" via snake_case
}

def to_snake_case(name: str) -> str:
    s = name.strip()
    s = s.replace("%", "pct")
    s = re.sub(r"[^\w\s-]", "", s)          # remove punctuation except word chars/space/-
    s = re.sub(r"[\s-]+", "_", s)           # spaces/dashes -> _
    s = re.sub(r"_+", "_", s).strip("_")    # collapse/trim underscores
    return s.lower()

def to_iso3(country_name: str, iso2: str) -> str:
    """Try ISO2 first, then fallback to country name. Returns ISO3 or empty string."""
    country = None

    if iso2:
        try:
            country = pycountry.countries.get(alpha_2=iso2.upper())
        except Exception:
            country = None

    if not country and country_name:
        try:
            country = pycountry.countries.lookup(country_name)
        except LookupError:
            country = None

    return country.alpha_3 if country else ""

# plain numbers with optional dot/comma decimals, no thousands separators
_num_re = re.compile(r"^[+-]?(?:\d+([.,]\d+)?|[.,]\d+)$")

def parse_decimal(s: str) -> Decimal | None:
    """
    Parse a number from string (accepts dot or comma decimals).
    Returns Decimal or None if blank/not numeric.
    Leaves percentages like '61.1%' as None (not used for calculations here).
    """
    if s is None:
        return None
    v = str(s).strip()
    if v == "" or v.endswith("%"):
        return None
    if not _num_re.match(v):
        return None
    v = v.replace(",", ".")
    try:
        return Decimal(v)
    except InvalidOperation:
        return None

def dec_to_comma_str(x: Decimal, max_dp: int = 6) -> str:
    """
    Convert Decimal to string with comma decimal separator.
    - Max 6 decimals
    - Trim trailing zeros
    """
    q = Decimal(1).scaleb(-max_dp)  # 10^-6
    y = x.quantize(q, rounding=ROUND_HALF_UP)

    s = format(y, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s.replace(".", ",")

def percent_number_str(numerator: Decimal | None, denominator: Decimal | None) -> str:
    """
    Return percentage as numeric string with comma decimal separator,
    exactly 2 decimals (no % sign), or '' if cannot compute.
    """
    if numerator is None or denominator is None:
        return ""
    if denominator == 0:
        return ""

    pct = (numerator / denominator) * Decimal(100)

    # force exactly 2 decimals
    q = Decimal("0.01")
    pct = pct.quantize(q, rounding=ROUND_HALF_UP)

    s = format(pct, "f")  # fixed-point
    return s.replace(".", ",")

@dataclass
class AggBucket:
    country: str
    country_code: str  # ISO3
    year: int | str

    total_generation: Decimal = Decimal(0)
    total_co2: Decimal = Decimal(0)
    total_certified: Decimal = Decimal(0)

    # for RES-only % calculation
    res_total_generation: Decimal = Decimal(0)
    res_total_certified: Decimal = Decimal(0)

def main():
    if len(sys.argv) < 2:
        print("Usage: python csv_to_exampledata_json.py input.csv [exampledata.json] [aggregated.json]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    example_out_path = Path(sys.argv[2]) if len(sys.argv) >= 3 else input_path.with_name("exampledata.json")
    agg_out_path = Path(sys.argv[3]) if len(sys.argv) >= 4 else input_path.with_name("aggregated.json")

    rows_out: list[dict] = []
    buckets: dict[tuple[str, str, int | str], AggBucket] = {}

    drop_lower = {c.lower() for c in DROP_COLS}

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise RuntimeError("No header row found in CSV.")

        for row in reader:
            out: dict[str, str | int] = {}

            country_name = (row.get("Country") or "").strip()
            iso2 = (row.get("Abbreviation") or "").strip()
            iso3 = to_iso3(country_name, iso2)

            # Map all non-dropped columns (keep extras, snake_case)
            for col, raw in row.items():
                if col is None:
                    continue
                col_clean = col.strip()

                if col_clean.lower() in drop_lower:
                    continue

                # remove ISO2 column from output; we output ISO3 instead
                if col_clean == "Abbreviation":
                    continue

                key = RENAME_MAP.get(col_clean, to_snake_case(col_clean))
                out[key] = "" if raw is None else str(raw).strip()

            # Force canonical keys
            out["country"] = country_name
            out["country_code"] = iso3

            # Year as int if possible
            year_raw = (row.get("Year") or "").strip()
            try:
                year_val: int | str = int(year_raw) if year_raw else ""
            except ValueError:
                year_val = year_raw
            out["year"] = year_val

            # Pull numeric inputs for calculations
            certified_raw = (row.get("Issuance Total") or "").strip()
            residual_raw = (row.get("Residual Mix") or "").strip()
            ef_raw = (row.get("Emission Factors") or "").strip()

            certified = parse_decimal(certified_raw)
            residual = parse_decimal(residual_raw)
            ef = parse_decimal(ef_raw)

            # total_generation = certified + residual
            if certified is None and residual is None:
                total_generation = None
                out["total_generation"] = ""
            else:
                total_generation = (certified or Decimal(0)) + (residual or Decimal(0))
                out["total_generation"] = dec_to_comma_str(total_generation)

            # total_co2 = total_generation * emission_factor
            if total_generation is None or ef is None:
                total_co2 = None
                out["total_co2"] = ""
            else:
                total_co2 = total_generation * ef
                out["total_co2"] = dec_to_comma_str(total_co2)

            # Convert any numeric-looking strings (dot/comma) to comma-decimal with max 6 dp
            # (leave percentages untouched)
            for k, v in list(out.items()):
                if isinstance(v, str) and v and not v.endswith("%") and _num_re.match(v):
                    d = parse_decimal(v)
                    if d is not None:
                        out[k] = dec_to_comma_str(d)

            # Ensure required keys exist
            for required in (
                "country", "country_code", "year", "energy_source",
                "certified_mix", "residual_mix", "emission_factor",
                "total_generation", "total_co2",
                "class",  # will exist from CSV "Class" -> snake_case, but ensure
            ):
                out.setdefault(required, "")

            rows_out.append(out)

            # -------- Aggregation --------
            agg_key = (country_name, iso3, year_val)
            if agg_key not in buckets:
                buckets[agg_key] = AggBucket(country=country_name, country_code=iso3, year=year_val)
            b = buckets[agg_key]

            # For sums, treat missing as 0
            certified0 = certified if certified is not None else Decimal(0)
            tg0 = total_generation if total_generation is not None else Decimal(0)
            tc0 = total_co2 if total_co2 is not None else Decimal(0)

            b.total_certified += certified0
            b.total_generation += tg0
            b.total_co2 += tc0

            # RES-only sums for perc_tracked_renewables
            cls = (row.get("Class") or "").strip()
            if cls == "RES":
                b.res_total_certified += certified0
                b.res_total_generation += tg0

    # Write exampledata.json (one object per row)
    with example_out_path.open("w", encoding="utf-8") as f:
        json.dump(rows_out, f, ensure_ascii=False, indent=2)

    # Build aggregated.json
    aggregated_out: list[dict] = []
    # stable ordering
    for (country, iso3, year), b in sorted(buckets.items(), key=lambda x: (str(x[0][0]), str(x[0][2]))):
        total_generation = b.total_generation
        total_certified = b.total_certified
        total_co2 = b.total_co2

        aggregated_out.append({
            "country": b.country,
            "country_code": b.country_code,
            "year": b.year,
            "total_generation": dec_to_comma_str(total_generation) if total_generation != 0 else "0",
            "total_co2": dec_to_comma_str(total_co2) if total_co2 != 0 else "0",
            "total_certified": dec_to_comma_str(total_certified) if total_certified != 0 else "0",
            "perc_tracked_total": percent_number_str(total_certified, total_generation),
            "perc_tracked_renewables": percent_number_str(b.res_total_certified, b.res_total_generation),
        })

    with agg_out_path.open("w", encoding="utf-8") as f:
        json.dump(aggregated_out, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(rows_out)} rows to: {example_out_path}")
    print(f"Wrote {len(aggregated_out)} aggregated rows to: {agg_out_path}")

if __name__ == "__main__":
    main()
