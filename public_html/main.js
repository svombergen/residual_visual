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
    country: ""
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
      .sort((a, b) => a - b)
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
    extractFilters();
    render();
  };

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
      max: 1,
      listAll: false,
      search: true,
      onChange: onAnyFilterChange
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

  // Single country: first selected value if any
  state.filters.country =
    fc.country && fc.country.selectedValues.length
      ? String(fc.country.selectedValues[0])
      : "";
}

// -------------------------
// FILTERED DATA (shared)
// -------------------------
window.getFilteredData = function getFilteredData() {
  const f = state.filters;

  return window.DATA.filter((row) => {
    if (f.year && row.year.toString() !== f.year) return false;
    if (f.country && row.country_code !== f.country) return false;

    if (f.methodologies.length && !f.methodologies.includes(row.energy_source)) {
      return false;
    }

    // regions currently unused
    return true;
  });
};

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
