// main.js
// Globals from index.html / data.js:
// - window.DATA
// - window.maplibregl

// Shared application state (map-only)
window.state = {
  filters: {
    year: "",
    methodologies: [], // mapped to energy_source
    regions: [],
    country: []
  }
};

// Globals for MultiSelect filter widgets
window.filterControls = {
  year: null,
  methodology: null,
  region: null,
  country: null
};

// -------------------------
// DYNAMIC FILTER OPTIONS
// -------------------------

let suppressFilterChange = false;
// schedule render once per tick (collapses 60+ changes into 1)
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    extractFilters();
    render();
    updateRowsCountLabel();
  });
}

function buildFiltersFromData() {
  const yearEl = document.getElementById("filter-year");
  const methEl = document.getElementById("filter-methodology");
  const countryEl = document.getElementById("filter-country");

  if (!window.DATA || !Array.isArray(window.DATA)) return;

  const yearSet = new Set();
  const sourceSet = new Set();
  const countryMap = new Map(); // code -> name

  for (const row of window.DATA) {
    if (row.year != null) yearSet.add(row.year);
    if (row.energy_source) sourceSet.add(row.energy_source);
    if (row.country_code && row.country) {
      const code = String(row.country_code).toUpperCase();
      if (!countryMap.has(code)) countryMap.set(code, row.country);
    }
  }

  // Years (single-select)
  if (yearEl && yearEl.tagName === "SELECT") {
    yearEl.innerHTML = "";
    Array.from(yearSet)
      .sort((a, b) => b - a)
      .forEach((year) => {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        yearEl.appendChild(opt);
      });
  }

  // Methodologies / energy sources (multi-select)
  if (methEl && methEl.tagName === "SELECT") {
    methEl.innerHTML = "";
    Array.from(sourceSet)
      .sort()
      .forEach((source) => {
        const opt = document.createElement("option");
        opt.value = source;
        opt.textContent = source;
        methEl.appendChild(opt);
      });
  }

  // Countries (single-select)
  if (countryEl && countryEl.tagName === "SELECT") {
    countryEl.innerHTML = "";
    Array.from(countryMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([code, name]) => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = name;
        countryEl.appendChild(opt);
      });
  }
}

function initFilterMultiSelects() {
  const onAnyFilterChange = () => {
    if (suppressFilterChange) return;
    scheduleRender();
  };

  // ... keep others, but point onChange to onAnyFilterChange

  const yearSelect = document.getElementById("filter-year");
  if (yearSelect) {
    window.filterControls.year = new MultiSelect(yearSelect, {
      max: 1,
      listAll: false,
      search: false,
      onChange: onAnyFilterChange
    });
  }

  const methSelect = document.getElementById("filter-methodology");
  if (methSelect) {
    window.filterControls.methodology = new MultiSelect(methSelect, {
      search: true,
      selectAll: true,
      onChange: onAnyFilterChange
    });
  }

  const regionSelect = document.getElementById("filter-region");
  if (regionSelect) {
    window.filterControls.region = new MultiSelect(regionSelect, {
      search: false,
      selectAll: true,
      onChange: onAnyFilterChange
    });
  }

  const countrySelect = document.getElementById("filter-country");
  if (countrySelect) {
    window.filterControls.country = new MultiSelect(countrySelect, {
      listAll: false,
      search: true,
      selectAll: true,
      // normal changes
      onChange: () => onAnyFilterChange(),

      // bulk operations: suppress until the library finishes toggling options
      onSelectAll: () => {
        suppressFilterChange = true;
        // allow internal loop to complete; then do ONE update
        setTimeout(() => {
          suppressFilterChange = false;
          scheduleRender();
        }, 0);
      },

      onUnselectAll: () => {
        suppressFilterChange = true;
        setTimeout(() => {
          suppressFilterChange = false;
          scheduleRender();
        }, 0);
      }
    });
  }
}

// -------------------------
// FILTER HANDLING
// -------------------------
function extractFilters() {
  const fc = window.filterControls;

  // Single year: take first selected value if any
  state.filters.year =
    fc.year && fc.year.selectedValues.length
      ? String(fc.year.selectedValues[0])
      : "";

  // Multi: methodologies
  state.filters.methodologies = fc.methodology
    ? fc.methodology.selectedValues.slice()
    : [];

  // Multi: regions
  state.filters.regions = fc.region ? fc.region.selectedValues.slice() : [];

  // Countries (multi-select)
  state.filters.countries = fc.country ? fc.country.selectedValues.slice() : [];

  // If all countries selected, treat it as "no filter"
  if (window.filterControls.country) {
    const total = window.filterControls.country.options?.length;
    if (total && state.filters.countries.length === total) {
      state.filters.countries = [];
    }
  }
}

// -------------------------
// FILTERED DATA (shared)
// -------------------------
window.getFilteredData = function getFilteredData() {
  const f = state.filters;

  return window.DATA.filter((row) => {
    if (f.year && row.year.toString() !== f.year) return false;
    if (f.countries.length && !f.countries.includes(String(row.country_code).toUpperCase())) {
      return false;
    }

    if (f.methodologies.length && !f.methodologies.includes(row.energy_source)) {
      return false;
    }

    // regions currently unused
    return true;
  });
};

// -------------------------
// Download functions
// -------------------------
function normalizeCode(v) {
  return String(v || "").toUpperCase().trim();
}

function parseNumLoose(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/\./g, "").replace(",", "."); // handles "1.234,56" and "12,34"
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getSelectedFilters() {
  const f = window.state?.filters || {};
  return {
    year: f.year ? Number(f.year) : null,
    methodologies: Array.isArray(f.methodologies) ? f.methodologies.map(String) : [],
    // if you renamed it to countries (multi-select), support both:
    countries: Array.isArray(f.countries) ? f.countries.map(normalizeCode)
             : (f.country ? [normalizeCode(f.country)] : []),
    regions: Array.isArray(f.regions) ? f.regions.map(String) : []
  };
}

// Apply current filters to detail rows
function getFilteredDetailRows() {
  const { year, methodologies, countries, regions } = getSelectedFilters();
  const rows = window.DATA_DETAIL || [];

  return rows.filter((r) => {
    // year
    if (year != null && Number(r.year) !== year) return false;

    // country_code (multi)
    if (countries.length) {
      const code = normalizeCode(r.country_code);
      if (!countries.includes(code)) return false;
    }

    // methodology / energy_source
    // NOTE: your UI label says "Energy Source", but the filter name is methodologies.
    // In your data, it is "energy_source". We match against that.
    if (methodologies.length) {
      const es = String(r.energy_source || "");
      if (!methodologies.includes(es)) return false;
    }

    // region (only if you actually have r.region in detail rows)
    if (regions.length && r.region != null && r.region !== "") {
      if (!regions.includes(String(r.region))) return false;
    }

    return true;
  });
}

// Optional: turn number-like strings into real numbers in Excel columns
const EXCEL_NUMBER_COLUMNS = new Set([
  "certified_mix",
  "issuance_ext",
  "issuance_irec",
  "residual_mix",
  "total_generation",
  "total_co2",
  "emission_factor",
  "perc_tracked_total",
  "perc_tracked_renewables",
  "perc_green"
]);

function toExcelRow(r) {
  const out = { ...r };
  for (const k of Object.keys(out)) {
    if (EXCEL_NUMBER_COLUMNS.has(k)) {
      const n = parseNumLoose(out[k]);
      if (n != null) out[k] = n; // keep blanks as blank
    }
  }
  return out;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFilteredDetailsToXlsx() {
  if (!window.XLSX) {
    alert("XLSX library not loaded. Add the SheetJS script tag.");
    return;
  }

  const filtered = getFilteredDetailRows().map(toExcelRow);

  // Workbook
  const wb = XLSX.utils.book_new();

  // Details sheet
  const wsDetails = XLSX.utils.json_to_sheet(filtered);
  XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

  // Optional: Aggregated sheet that matches current filters too (year + countries)
  const { year, countries } = getSelectedFilters();
  const agg = (window.DATA || []).filter((r) => {
    if (year != null && Number(r.year) !== year) return false;
    if (countries.length && !countries.includes(normalizeCode(r.country_code))) return false;
    return true;
  });
  if (agg.length) {
    const wsAgg = XLSX.utils.json_to_sheet(agg.map(toExcelRow));
    XLSX.utils.book_append_sheet(wb, wsAgg, "Aggregated");
  }

  const yyyy = new Date().toISOString().slice(0, 10);
  const { year: y } = getSelectedFilters();
  const filename = `export_${yyyy}${y ? `_year-${y}` : ""}.xlsx`;

  const arrayBuf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  downloadBlob(blob, filename);
}

function updateRowsCountLabel() {
  const el = document.getElementById("rows-count-label");
  if (!el) return;

  const n = getFilteredDetailRows().length;
  el.textContent = `${n} rows`;
}

// Wire the button
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("button_export");
  if (btn) btn.addEventListener("click", exportFilteredDetailsToXlsx);
});

// -------------------------
// RENDER (map only)
// -------------------------
function render() {
  if (window.renderMapView) {
    window.renderMapView();
  }
}

// Expose for other scripts if needed
window.render = render;

// -------------------------
// INIT
// -------------------------
window.addEventListener("load", () => {
  buildFiltersFromData();
  initFilterMultiSelects();
  extractFilters();
  render();
});
