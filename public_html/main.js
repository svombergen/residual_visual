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

// Globals for MultiSelect filter widgets
window.filterControls = {
  year: null,
  methodology: null,
  region: null,
  country: null
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
      const code = String(row.country_code).toUpperCase();
      if (!countryMap.has(code)) {
        countryMap.set(code, row.country);
      }
    }
  }

  // Years
  if (yearEl && yearEl.tagName === "SELECT") {
    yearEl.innerHTML = '<option value="">Year (all)</option>';
    Array.from(yearSet)
      .sort((a, b) => a - b)
      .forEach(year => {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        yearEl.appendChild(opt);
      });
  }

  // Methodologies / energy sources
  if (methEl && methEl.tagName === "SELECT") {
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
  if (countryEl && countryEl.tagName === "SELECT") {
    countryEl.innerHTML = '<option value="">Country (all)</option>';
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
  state.filters.methodologies =
    fc.methodology ? fc.methodology.selectedValues.slice() : [];

  // Multi: regions
  state.filters.regions =
    fc.region ? fc.region.selectedValues.slice() : [];

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

  // Update toggle button label based on current view
  const btn = document.getElementById("view-toggle-btn");
  if (btn) {
    const isMapLike = state.view === "map" || state.view === "country";
    // When we are on map (or in a country detail), user can switch to List
    // When we are on list, user can switch back to Map
    btn.textContent = isMapLike ? "List" : "Map";
  }

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
// document.querySelectorAll("[data-nav]").forEach(btn => {
//   btn.onclick = () => {
//     location.hash = `#/${btn.dataset.nav}`;
//   };
// });

window.addEventListener("hashchange", applyRoute);

window.addEventListener("load", () => {
  buildFiltersFromData();
  initFilterMultiSelects();
  extractFilters();
  applyRoute();
});

// Expose for other scripts if needed
window.applyRoute = applyRoute;
window.render = render;

// Button view flip animation
const viewToggleBtn = document.getElementById("view-toggle-btn");

if (viewToggleBtn) {
  viewToggleBtn.addEventListener("click", () => {
    // Add flip animation
    viewToggleBtn.classList.add("flipping");

    // Decide target: treat 'country' as 'map' side for toggling
    const isMapLike = state.view === "map" || state.view === "country";
    const targetView = isMapLike ? "list" : "map";

    // Switch hash midway through flip
    setTimeout(() => {
      location.hash = `#/${targetView}`;
    }, 150);

    // Remove flip class after animation
    setTimeout(() => {
      viewToggleBtn.classList.remove("flipping");
    }, 300);
  });
}
