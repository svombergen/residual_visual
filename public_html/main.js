// main.js
// Globals from index.html / data.js:
// - window.DATA
// - window.maplibregl

// Shared application state (map-only)
window.state = {
  filters: {
    years: [],   // multi-select; map uses only the latest
    regions: [],
    country: []
  }
};

// Globals for MultiSelect filter widgets
window.filterControls = {
  year: null,
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
  const countryEl = document.getElementById("filter-country");

  if (!window.DATA || !Array.isArray(window.DATA)) return;

  const yearSet = new Set();
  const countryMap = new Map(); // code -> name

  for (const row of window.DATA) {
    if (row.year != null) yearSet.add(row.year);
    if (row.country_code && row.country) {
      const code = String(row.country_code).toUpperCase();
      if (!countryMap.has(code)) countryMap.set(code, row.country);
    }
  }

  // Years (multi-select)
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
      listAll: false,
      search: false,
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

  // Multi-year: collect all selected years
  state.filters.years = fc.year
    ? fc.year.selectedValues.map(String)
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

  // No years selected → nothing to show on the map
  if (!f.years || !f.years.length) return [];

  // Map shows only the latest selected year (no aggregation across years)
  const mapYear = String(Math.max(...f.years.map(Number)));

  return window.DATA.filter((row) => {
    if (row.year.toString() !== mapYear) return false;
    if (f.countries.length && !f.countries.includes(String(row.country_code).toUpperCase())) {
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
    years: Array.isArray(f.years) ? f.years.map(Number).filter(Number.isFinite) : [],
    countries: Array.isArray(f.countries) ? f.countries.map(normalizeCode)
             : (f.country ? [normalizeCode(f.country)] : []),
    regions: Array.isArray(f.regions) ? f.regions.map(String) : []
  };
}

// Apply current filters to detail rows
function getFilteredDetailRows() {
  const { years, countries, regions } = getSelectedFilters();
  const rows = window.DATA_DETAIL || [];

  return rows.filter((r) => {
    // years: no selection = no rows; otherwise row must be in the selected set
    if (!years.length || !years.includes(Number(r.year))) return false;

    // country_code (multi)
    if (countries.length) {
      const code = normalizeCode(r.country_code);
      if (!countries.includes(code)) return false;
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

  // Optional: Aggregated sheet that matches current filters too (years + countries)
  const { years, countries } = getSelectedFilters();
  const agg = (window.DATA || []).filter((r) => {
    if (years.length && !years.includes(Number(r.year))) return false;
    if (countries.length && !countries.includes(normalizeCode(r.country_code))) return false;
    return true;
  });
  if (agg.length) {
    const wsAgg = XLSX.utils.json_to_sheet(agg.map(toExcelRow));
    XLSX.utils.book_append_sheet(wb, wsAgg, "Aggregated");
  }

  const yyyy = new Date().toISOString().slice(0, 10);
  const yearsLabel = years.length ? `_year-${years.slice().sort().join(",")}` : "";
  const filename = `export_${yyyy}${yearsLabel}.xlsx`;

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
