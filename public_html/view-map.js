// view-map.js
// Depends on: state, getFilteredData, maplibregl

const URL_WORLD_GEO =
  "./lib/countries.high.geojson";

let mapInstance = null;
let worldGeojsonOriginal = null;

const KPI_COLOR_STOPS = [
  { v: 0,   c: "#F7EFC6" },
  { v: 10,  c: "#F3DC9C" },
  { v: 50,  c: "#F2B08A" },
  { v: 60,  c: "#CDEED7" },
  { v: 100, c: "#76D6A1" }
];

window.renderMapView = async function renderMapView() {
  if (!mapInstance) {
    await initMap();
  }
  updateMapColors();
  setupKpiOverlaySwitch();
};

function initMap() {
  return new Promise(async (resolve) => {
    mapInstance = new maplibregl.Map({
      container: "map-container",
      style: "maplibre_style.json",
      center: [7.3, 53.6],
      zoom: 3.3,
      minZoom: 2,
      maxZoom: 4
    });

    mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

    mapInstance.on("load", async () => {
      try {
        if (window.WORLD_COUNTRIES) {
          worldGeojsonOriginal = window.WORLD_COUNTRIES;
        } else {
          const res = await fetch(URL_WORLD_GEO);
          worldGeojsonOriginal = await res.json();
        }
      } catch (err) {
        console.error("Failed to load world countries geojson", err);
        return resolve();
      }

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

      mapInstance.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": [
          "case",
          ["==", ["get", "hasDataForFilters"], true],
          // soft gradient stops (match CountryUI defaults)
          ["interpolate", ["linear"], ["coalesce", ["get", "kpi_value"], 0],
            0,   "#F7EFC6",
            10,  "#F3DC9C",
            50,  "#F2B08A",
            60,  "#CDEED7",
            100, "#76D6A1"
          ],
          "#e0e0e0"
        ],
          "fill-opacity": 0.8
        }
      });

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
  const filteredByCode = new Map();
  for (const r of filtered) {
    const code = (r.country_code || "").toUpperCase();
    if (!filteredByCode.has(code)) filteredByCode.set(code, []);
    filteredByCode.get(code).push(r);
  }

  // Which KPI drives coloring (future-proof)
  const kpiKey = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_renewables";

  // Map KPI per country from aggregated DATA (not from detail rows)
  const agg = window.DATA || [];
  const yearFilter = window.state?.filters?.year ? Number(window.state.filters.year) : null;

  const kpiByCode = new Map();
  for (const row of agg) {
    const code = (row.country_code || "").toUpperCase();
    if (!code) continue;
    if (yearFilter != null && Number(row.year) !== yearFilter) continue;

    // For safety: if multiple rows exist per code/year, prefer the first (or you can max it)
    if (!kpiByCode.has(code)) {
      const v = row[kpiKey];
      const n = v === "" || v == null ? null : (Number(String(v).replace(",", ".")) || 0);
      kpiByCode.set(code, n);
    }
  }

  const updatedGeojson = {
    ...worldGeojsonOriginal,
    features: worldGeojsonOriginal.features.map((f) => {
      const code = (f.id || "").toString().toUpperCase();
      const hasData = filteredByCode.has(code);
      return {
        ...f,
        properties: {
          ...f.properties,
          hasDataForFilters: hasData,
          kpi_value: hasData ? (kpiByCode.get(code) ?? null) : null
        }
      };
    })
  };

  const src = mapInstance.getSource("countries");
  if (src) src.setData(updatedGeojson);
}


function setupMapInteractions() {
  if (!mapInstance) return;

  if (window.CountryUI?.attach) {
    window.CountryUI.attach(mapInstance, "country-fill");
  } else {
    console.warn("CountryUI not loaded. Include country-ui.js before view-map.js");
  }
}

function setupKpiOverlaySwitch() {
  const sel = document.getElementById("kpi-color-key");
  if (!sel) return;

  // set initial value from current config (or default)
  const current = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_renewables";
  sel.value = current;

  sel.addEventListener("change", () => {
    const key = sel.value;

    // update global KPI key (keeps stops the same)
    window.CountryUI?.setColorKpi?.({
      key,
      stops: KPI_COLOR_STOPS
    });

    // recolor countries
    updateMapColors();
  });
}
