// main.js

// Globals from index.html / data.js:
// - window.DATA
// - window.maplibregl
const url_world_geo = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

let mapInstance = null;
let worldGeojsonOriginal = null;

const state = {
  view: "map",
  countryCode: null, // ISO3, e.g. "ARG", "CHL", "NLD", "DEU"
  filters: {
    year: "",
    methodologies: [], // will be matched to energy_source
    regions: [],       // currently unused (no region in DATA)
    country: ""        // ISO3 code for dropdown if you want it
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

window.addEventListener("hashchange", applyRoute);
window.addEventListener("load", applyRoute);

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
    // keep the first "Year (all)" option, remove others
    yearEl.options.length = 1;
    Array.from(yearSet)
      .sort((a, b) => a - b)
      .forEach(year => {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        yearEl.appendChild(opt);
      });
  }

  // Energy sources (methodology)
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

  // Countries (code as value, name as label)
  if (countryEl) {
    // keep the first "Country (all)" option, remove others
    countryEl.options.length = 1;
    Array.from(countryMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1])) // sort by country name
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
// FILTERED DATA
// -------------------------
function getFilteredData() {
  const f = state.filters;
  return window.DATA.filter(row => {
    if (f.year && row.year.toString() !== f.year) return false;
    if (f.country && row.country_code !== f.country) return false;

    // methodologies filter maps to energy_source
    if (f.methodologies.length && !f.methodologies.includes(row.energy_source)) {
      return false;
    }

    // Currently we have no region field in DATA, so skip f.regions filter
    return true;
  });
}

// -------------------------
// MAP INIT & UPDATE
// -------------------------
async function renderMapView() {
  if (!mapInstance) {
    await initMap();
  }
  updateMapColors();
}

function initMap() {
  return new Promise(async (resolve) => {
    mapInstance = new maplibregl.Map({
      container: "map-container",
      style: "https://demotiles.maplibre.org/style.json",
      center: [0, 20],
      zoom: 1.5
    });

    mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

    mapInstance.on("load", async () => {
      // Load world countries GeoJSON
      try {
        // If you have WORLD_COUNTRIES defined in JS
        if (window.WORLD_COUNTRIES) {
          worldGeojsonOriginal = window.WORLD_COUNTRIES;
        } else {
          // Fallback: fetch from local file if you still use it
          const res = await fetch(url_world_geo);
          worldGeojsonOriginal = await res.json();
        }
      } catch (err) {
        console.error("Failed to load world countries geojson", err);
        return resolve();
      }

      // Normalize display name; country_code will come from feature.id
      worldGeojsonOriginal.features.forEach(f => {
        let p = f.properties || {};
        p.id = f.id;
        p.display_name = p.display_name || p.name || p.NAME_EN || p.ADMIN || (f.id || "");
        f.properties = p;
      });

      mapInstance.addSource("countries", {
        type: "geojson",
        data: worldGeojsonOriginal
      });

      // Fill layer
      mapInstance.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "hasDataForFilters"], true],
            "#4176ff", // with data
            "#e0e0e0"  // no data
          ],
          "fill-opacity": 0.8
        }
      });

      // Outline layer
      mapInstance.addLayer({
        id: "country-outline",
        type: "line",
        source: "countries",
        paint: {
          "line-color": "#ffffff",
          "line-width": 0.5
        }
      });

      setupMapInteractions();

      resolve();
    });
  });
}

function updateMapColors() {
  if (!mapInstance || !worldGeojsonOriginal) return;

  const filtered = getFilteredData();
  const countriesWithData = new Set(filtered.map(r => r.country_code));

  const updatedGeojson = {
    ...worldGeojsonOriginal,
    features: worldGeojsonOriginal.features.map(f => {
      const code = (f.id || "").toString().toUpperCase();
      return {
        ...f,
        properties: {
          ...f.properties,
          hasDataForFilters: countriesWithData.has(code)
        }
      };
    })
  };

  const src = mapInstance.getSource("countries");
  if (src) {
    src.setData(updatedGeojson);
  }
}

function setupMapInteractions() {
  if (!mapInstance) return;

  mapInstance.on("mouseenter", "country-fill", () => {
    mapInstance.getCanvas().style.cursor = "pointer";
  });
  mapInstance.on("mouseleave", "country-fill", () => {
    mapInstance.getCanvas().style.cursor = "";
  });

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  // Hover popup
  mapInstance.on("mousemove", "country-fill", (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;

    const code = (feature.properties && feature.properties.id || "").toString().toUpperCase();
    const name = (feature.properties && feature.properties.display_name) || code;

    const rows = getFilteredData().filter(r => r.country_code === code);
    
    if (!rows.length) {
        const html = `<strong>${name}</strong><br/><em>No data for current filters</em>`;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance);
        return;
    }

    // Aggregate by energy_source
    const bySource = {};
    const parseNum = (val) =>
        val ? (parseFloat(String(val).replace(",", ".")) || 0) : 0;

    for (const r of rows) {
        const src = r.energy_source || "other";
        if (!bySource[src]) {
        bySource[src] = {
            certified: 0,
            residual: 0,
            emissionFactor: 0,
            emissionFactorCount: 0
        };
        }

        const cert = parseNum(r.certified_mix);
        const resid = parseNum(r.residual_mix);
        const ef   = parseNum(r.emission_factor);

        bySource[src].certified += cert;
        bySource[src].residual += resid;

        if (ef > 0) {
        bySource[src].emissionFactor += ef;
        bySource[src].emissionFactorCount += 1;
        }
    }

    let totalCertified = 0;
    let totalResidual = 0;
    let totalGeneration = 0;
    let totalCO2 = 0;

    const sources = Object.keys(bySource).sort();
    let rowsHtml = "";

    for (const src of sources) {
        const agg = bySource[src];

        const totalGen = agg.certified + agg.residual; // Total Generation
        const avgEf = agg.emissionFactorCount
        ? agg.emissionFactor / agg.emissionFactorCount
        : 0;

        // CO₂ emissions = emission factor * total generation
        const co2 = totalGen * avgEf;

        // "tracked percentage" as % of certified mix compared to total generation
        const trackedPct =
        totalGen > 0 ? (agg.certified / totalGen) * 100 : 0;

        totalCertified += agg.certified;
        totalResidual += agg.residual;
        totalGeneration += totalGen;
        totalCO2 += co2;

        rowsHtml += `
        <tr>
            <td>${src}</td>
            <td style="text-align:right;">${totalGen.toFixed(1)}</td>
            <td style="text-align:right;">${agg.certified.toFixed(1)}</td>
            <td style="text-align:right;">${agg.residual.toFixed(1)}</td>
            <td style="text-align:right;">${totalGen > 0 ? trackedPct.toFixed(0) + "%" : "-"}</td>
            <td style="text-align:right;">${avgEf ? avgEf.toFixed(2) : "-"}</td>
            <td style="text-align:right;">${co2 ? co2.toFixed(1) : "-"}</td>
        </tr>`;
    }

    const totalsRow = `
        <tr style="font-weight:bold; border-top:1px solid #ccc;">
        <td>Totals</td>
        <td style="text-align:right;">${totalGeneration.toFixed(1)}</td>
        <td style="text-align:right;">${totalCertified.toFixed(1)}</td>
        <td style="text-align:right;">${totalResidual.toFixed(1)}</td>
        <td></td>
        <td></td>
        <td style="text-align:right;">${totalCO2.toFixed(1)}</td>
        </tr>
    `;

    const html = `
        <div style="font-size:12px; min-width:420px; max-width:520px; padding:6px; box-sizing:border-box;">
        <div style="font-weight:bold; text-align:center; margin-bottom:4px;">
            ${name} – Energy Mix Details
        </div>
        <table style="border-collapse:collapse; width:100%; font-size:11px; table-layout:auto;">
            <thead>
            <tr style="border-bottom:1px solid #ccc;">
                <th style="text-align:left;">Source</th>
                <th style="text-align:right;">Total<br/>Generation</th>
                <th style="text-align:right;">Certified<br/>Mix</th>
                <th style="text-align:right;">Residual<br/>Mix</th>
                <th style="text-align:right;">Tracked<br/>percentage</th>
                <th style="text-align:right;">Emission<br/>Factor</th>
                <th style="text-align:right;">CO₂<br/>Emissions (Mt)</th>
            </tr>
            </thead>
            <tbody>
            ${rowsHtml}
            ${totalsRow}
            </tbody>
        </table>
        </div>
    `;

    popup
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(mapInstance);
  });

  mapInstance.on("mouseleave", "country-fill", () => {
    popup.remove();
  });

  // Click → go to country detail
  mapInstance.on("click", "country-fill", (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;

    const code = (feature.id || "").toString().toUpperCase();
    if (code) {
      location.hash = `#/country/${code}`;
    }
  });
}

// -------------------------
// LIST VIEW
// -------------------------
function renderListView() {
  const rows = getFilteredData();
  const tbody = document.getElementById("list-table-body");
  if (!tbody) return;

  tbody.innerHTML = rows.map(r =>
    `<tr onclick="location.hash='#/country/${r.country_code}'">
       <td>${r.country}</td>
       <td>${r.year}</td>
       <td>${r.energy_source}</td>
     </tr>`
  ).join("");
}

// -------------------------
// COUNTRY DETAIL VIEW
// -------------------------
function renderCountryView() {
  const code = state.countryCode;
  const rows = getFilteredData().filter(r => r.country_code === code);

  const nameSpan = document.getElementById("country-name");
  const msg = document.getElementById("country-message");
  const tbody = document.getElementById("country-table-body");

  if (!nameSpan || !msg || !tbody) return;

  const displayCountry = rows[0]?.country || code || "";
  nameSpan.textContent = displayCountry;

  if (!rows.length) {
    msg.textContent = "There is currently no available data for the Residual Mix for this country.";
    tbody.innerHTML = "";
  } else {
    msg.textContent = "";
    tbody.innerHTML = rows.map(r =>
      `<tr>
         <td>${r.year}</td>
         <td>${r.energy_source}</td>
         <td>${r.certified_mix}</td>
         <td>${r.residual_mix}</td>
         <td>${r.emission_factor}</td>
       </tr>`
    ).join("");
  }

  // Next country button
  const uniqueCountries = [...new Set(window.DATA.map(r => r.country_code))].sort();
  const nextBtn = document.getElementById("next-country-btn");
  if (!nextBtn) return;

  nextBtn.onclick = () => {
    if (!uniqueCountries.length) return;
    const idx = uniqueCountries.indexOf(code);
    const next = uniqueCountries[(idx + 1 + uniqueCountries.length) % uniqueCountries.length];
    location.hash = `#/country/${next}`;
  };
}

// -------------------------
// MASTER RENDER FUNCTION
// -------------------------
function render() {
  Object.values(VIEWS).forEach(v => v && v.classList.remove("active"));
  if (VIEWS[state.view]) VIEWS[state.view].classList.add("active");

  if (state.view === "map") renderMapView();
  if (state.view === "list") renderListView();
  if (state.view === "country") renderCountryView();
}

// -------------------------
// Navigation buttons
// -------------------------
document.querySelectorAll("[data-nav]").forEach(btn => {
  btn.onclick = () => {
    location.hash = `#/${btn.dataset.nav}`;
  };
});

// Build filters from data and then apply route on load
window.addEventListener("load", () => {
  buildFiltersFromData();
  extractFilters();
  applyRoute();
});