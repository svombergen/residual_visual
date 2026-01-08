// main.js
// Globals from index.html / data.js:
// - window.DATA
// - window.maplibregl

// Shared application state
window.state = {
  view: "map",
  countryCode: null, // ISO3, e.g. "ARG", "CHL", "NLD", "DEU"
  filters: {
    year: "",
    methodologies: [], // mapped to energy_source
    regions: [],
    country: ""
  }
};

const VIEWS = {
  map: document.getElementById("view-map"),
  list: document.getElementById("view-list"),
  country: document.getElementById("view-country")
};

const FILTERS_EL = document.getElementById("filters");

// -------------------------
// ROUTER
// -------------------------
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/");

  if (parts[0] === "country" && parts[1]) {
    return { view: "country", countryCode: parts[1].toUpperCase() };
  }
  if (parts[0] === "list") return { view: "list" };

  return { view: "map" };
}

function applyRoute() {
  const r = parseHash();
  state.view = r.view;
  state.countryCode = r.countryCode || null;
  render();
}

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
      const code = row.country_code.toString().toUpperCase();
      if (!countryMap.has(code)) {
        countryMap.set(code, row.country);
      }
    }
  }

  // Years
  if (yearEl) {
    yearEl.options.length = 1; // keep "Year (all)"
    Array.from(yearSet)
      .sort((a, b) => a - b)
      .forEach(year => {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        yearEl.appendChild(opt);
      });
  }

  // Energy sources
  if (methEl) {
    methEl.innerHTML = "";
    Array.from(sourceSet)
      .sort()
      .forEach(source => {
        const opt = document.createElement("option");
        opt.value = source;
        opt.textContent = source;
        methEl.appendChild(opt);
      });
  }

  // Countries
  if (countryEl) {
    countryEl.options.length = 1; // keep "Country (all)"
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

// -------------------------
// FILTER HANDLING
// -------------------------
function extractFilters() {
  const yearEl = document.getElementById("filter-year");
  const methEl = document.getElementById("filter-methodology");
  const regionEl = document.getElementById("filter-region");
  const countryEl = document.getElementById("filter-country");

  state.filters.year = yearEl ? yearEl.value : "";
  state.filters.methodologies = methEl
    ? Array.from(methEl.selectedOptions).map(o => o.value)
    : [];
  state.filters.regions = regionEl
    ? Array.from(regionEl.selectedOptions).map(o => o.value)
    : [];
  state.filters.country = countryEl ? countryEl.value : "";
}

if (FILTERS_EL) {
  FILTERS_EL.addEventListener("change", () => {
    extractFilters();
    render();
  });
}

// -------------------------
// FILTERED DATA (shared)
// -------------------------
window.getFilteredData = function getFilteredData() {
  const f = state.filters;
  return window.DATA.filter(row => {
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
// MASTER RENDER FUNCTION
// -------------------------
function render() {
  // show only the active view
  Object.entries(VIEWS).forEach(([name, el]) => {
    if (!el) return;
    if (name === state.view) {
      el.style.display = "block";
      el.classList.add("active");
    } else {
      el.style.display = "none";
      el.classList.remove("active");
    }
  });

  // then render the content of that view
  if (state.view === "map" && window.renderMapView) {
    window.renderMapView();
  }
  if (state.view === "list" && window.renderListView) {
    window.renderListView();
  }
  if (state.view === "country" && window.renderCountryView) {
    window.renderCountryView();
  }
}



// -------------------------
// Navigation buttons & init
// -------------------------
document.querySelectorAll("[data-nav]").forEach(btn => {
  btn.onclick = () => {
    location.hash = `#/${btn.dataset.nav}`;
  };
});

window.addEventListener("hashchange", applyRoute);

window.addEventListener("load", () => {
  buildFiltersFromData();
  extractFilters();
  applyRoute();
});

// Expose for other scripts if needed
window.applyRoute = applyRoute;
window.render = render;
