// view-map.js
// Depends on: state, getFilteredData, maplibregl

const URL_WORLD_GEO_LOW  = "./lib/countries.geojson";
const URL_WORLD_GEO_HIGH = "./lib/countries.high.geojson";

// Kick off low-res fetch immediately (don't wait for map load)
const _preloadedGeoJson = fetch(URL_WORLD_GEO_LOW).then(r => r.json());

let mapInstance = null;
let worldGeojsonOriginal = null;
let smallCountryDotsGeojson = null;
let initialMapCenter = null;
const INITIAL_ZOOM = 3.3;

class CustomNavControl {
  constructor(center, zoom) {
    this._center = center;
    this._zoom = zoom;
  }

  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const btn = (className, label, onClick, svgContent) => {
      const b = document.createElement("button");
      b.className = className;
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = svgContent;
      b.addEventListener("click", onClick);
      return b;
    };

    const zoomInSvg  = `<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>`;
    const zoomOutSvg = `<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>`;
    const recenterSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="10" cy="10" r="4"/>
      <line x1="10" y1="1" x2="10" y2="5.5"/>
      <line x1="10" y1="14.5" x2="10" y2="19"/>
      <line x1="1" y1="10" x2="5.5" y2="10"/>
      <line x1="14.5" y1="10" x2="19" y2="10"/>
    </svg>`;

    this._container.appendChild(btn("maplibregl-ctrl-zoom-in",  "Zoom in",      () => map.zoomIn(),  zoomInSvg));
    this._container.appendChild(btn("maplibregl-ctrl-recenter", "Re-center map", () => map.easeTo({ center: this._center, zoom: this._zoom }), recenterSvg));
    this._container.appendChild(btn("maplibregl-ctrl-zoom-out", "Zoom out",     () => map.zoomOut(), zoomOutSvg));

    return this._container;
  }

  onRemove() {
    this._container.parentNode?.removeChild(this._container);
    this._map = undefined;
  }
}

const KPI_COLOR_STOPS = [
  { v: 0,   c: "#9bc9fd" },
  { v: 33,  c: "#69aefc" },
  { v: 66,  c: "#0579fa" },
  { v: 100, c: "#034896" }
];

window.renderMapView = async function renderMapView() {
  if (!mapInstance) {
    await initMap();
  }
  updateMapColors();
  setupKpiOverlaySwitch();
};

const COUNTRY_CENTERS = {
  AF:[67,33],AL:[20,41],DZ:[3,28],AR:[-64,-34],AM:[45,40],AU:[134,-25],
  AT:[14,48],AZ:[50,41],BD:[90,24],BY:[28,53],BE:[4,51],BA:[18,44],
  BR:[-52,-10],BG:[25,43],CA:[-96,56],CL:[-71,-30],CN:[105,35],CO:[-72,4],
  HR:[16,46],CZ:[15,50],DK:[10,56],EC:[-78,-2],EG:[30,27],EE:[26,59],
  ET:[40,9],FI:[26,64],FR:[2,47],GE:[44,42],DE:[10,51],GH:[-2,8],
  GR:[22,39],HU:[20,47],IS:[-19,65],IN:[79,21],ID:[120,-5],IR:[53,32],
  IQ:[44,33],IE:[-8,53],IL:[35,31],IT:[12,42],JP:[138,36],JO:[36,31],
  KZ:[67,48],KE:[38,1],KR:[128,36],KW:[48,29],LV:[25,57],LT:[24,56],
  MY:[102,4],MX:[-102,24],MA:[-6,32],NL:[5,52],NZ:[174,-41],NG:[8,10],
  NO:[9,62],PK:[69,30],PE:[-76,-10],PH:[122,13],PL:[20,52],PT:[-8,40],
  RO:[25,46],RU:[100,60],SA:[45,24],RS:[21,44],SG:[104,1],SK:[19,49],
  SI:[15,46],ZA:[25,-29],ES:[-4,40],SE:[16,62],CH:[8,47],TW:[121,24],
  TH:[101,15],TR:[35,39],UA:[32,49],AE:[54,24],GB:[-2,54],US:[-97,38],
  VN:[108,16],ZW:[30,-19]
};

function getLocaleCenter() {
  try {
    const locale = navigator.language || navigator.userLanguage || "";
    const parts = locale.split("-");
    const code = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).toUpperCase();
    const coords = COUNTRY_CENTERS[code];
    if (coords) return coords;
  } catch (e) { /* fall through */ }
  return null;
}

async function getUserCenter() {
  try {
    const resp = await fetch("https://ipapi.co/json/");
    const data = await resp.json();
    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);
    console.info("Centering to country", data.country_code);
    if (!isNaN(lat) && !isNaN(lon)) return [lon, lat];
  } catch (e) { console.info("Failing IP location", e); }
  return getLocaleCenter() || [7.3, 53.6];
}

function initMap() {
  return new Promise(async (resolve) => {
    initialMapCenter = await getUserCenter();

    mapInstance = new maplibregl.Map({
      container: "map-container",
      style: "maplibre_style.json",
      center: initialMapCenter,
      zoom: INITIAL_ZOOM,
      minZoom: 2,
      maxZoom: 4,
      maxPitch: 0,
      dragRotate: false,
      // maxBounds: [[-180, -60], [180, 75]]
    });

    mapInstance.touchZoomRotate.disableRotation();

    mapInstance.addControl(new CustomNavControl(initialMapCenter, INITIAL_ZOOM), "top-right");

    mapInstance.on("load", async () => {
      // 1. Use preloaded low-res GeoJSON (already fetching since page load)
      try {
        worldGeojsonOriginal = await _preloadedGeoJson;
      } catch (err) {
        console.error("Failed to load low-res geojson", err);
        return resolve();
      }

      prepareGeojsonProperties(worldGeojsonOriginal);
      filterOverseasTerritories(worldGeojsonOriginal);

      mapInstance.addSource("countries", {
        type: "geojson",
        data: worldGeojsonOriginal,
        promoteId: "id"
      });

      mapInstance.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "hasDataForFilters"], true],
            ["interpolate", ["linear"], ["coalesce", ["get", "kpi_perc_tracked_total"], 0],
              0,   "#9bc9fd",
              33,  "#69aefc",
              66,  "#0579fa",
              100, "#034896"
            ],
            "#e0e0e0"
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.0,
            0.6
          ]
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


      // Small-country dot markers (visible at all zoom levels)
      const SMALL_COUNTRY_DOTS = [
        { id: "SGP", name: "Singapore",  coords: [103.8198, 1.3521] },
        { id: "MUS", name: "Mauritius",  coords: [57.5522, -20.3484] },
        { id: "CUW", name: "Curaçao",    coords: [-68.9900, 12.1696] },
        { id: "BHR", name: "Bahrain",    coords: [50.5577, 26.0667] }
      ];

      smallCountryDotsGeojson = {
        type: "FeatureCollection",
        features: SMALL_COUNTRY_DOTS.map(c => ({
          type: "Feature",
          id: c.id,
          properties: { id: c.id, name: c.name, display_name: c.name },
          geometry: { type: "Point", coordinates: c.coords }
        }))
      };

      mapInstance.addSource("small-country-dots", {
        type: "geojson",
        data: smallCountryDotsGeojson
      });

      mapInstance.addLayer({
        id: "small-country-dots-fill",
        type: "circle",
        source: "small-country-dots",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "case",
            ["==", ["get", "hasDataForFilters"], true],
            ["interpolate", ["linear"], ["coalesce", ["get", "kpi_perc_tracked_total"], 0],
              0,   "#9bc9fd",
              33,  "#69aefc",
              66,  "#0579fa",
              100, "#034896"
            ],
            "#e0e0e0"
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.7
        }
      });

      setupMapInteractions();
      resolve();

      // 2. Upgrade to high-res in the background
      upgradeToHighRes();
    });
  });
}

function prepareGeojsonProperties(geojson) {
  geojson.features.forEach(f => {
    let p = f.properties || {};
    p.id = f.id;
    p.display_name = p.display_name || p.name || p.NAME_EN || p.ADMIN || (f.id || "");
    f.properties = p;
  });
}

// Remove overseas territories and add French Guiana back as its own feature
function filterOverseasTerritories(geojson) {
  const gufPolygons = [];

  geojson.features.forEach(f => {
    if (!f.geometry) return;
    const id = f.id;
    const geom = f.geometry;

    if (id === "FRA" && geom.type === "MultiPolygon") {
      const european = [];
      geom.coordinates.forEach(polygon => {
        const ring = polygon[0];
        // GUF bounds: lon -54.6..-51.6, lat 2.1..5.7 (only in high-res; low-res has it separate)
        if (ring.some(([lon, lat]) => lon < -50 && lon > -56 && lat > 0 && lat < 8)) {
          gufPolygons.push(polygon);
        } else if (ring.some(([lon, lat]) => lon >= -10 && lon <= 15 && lat >= 40 && lat <= 55)) {
          // Metropolitan France + Corsica
          european.push(polygon);
        }
        // other overseas territories are dropped
      });
      geom.coordinates = european;
    } else if (id === "NOR" && geom.type === "MultiPolygon") {
      // Remove Svalbard (entirely above lat 74)
      geom.coordinates = geom.coordinates.filter(polygon =>
        polygon[0].some(([, lat]) => lat < 74)
      );
    } else if (id === "PRT" && geom.type === "MultiPolygon") {
      // Remove Azores and Madeira (lon < -12; mainland Portugal is lon -9.4..-6.2)
      geom.coordinates = geom.coordinates.filter(polygon =>
        polygon[0].some(([lon]) => lon > -12)
      );
    } else if (id === "ESP" && geom.type === "MultiPolygon") {
      // Remove Canary Islands and other Atlantic territories (lon < -12)
      geom.coordinates = geom.coordinates.filter(polygon =>
        polygon[0].some(([lon]) => lon > -12)
      );
    }
  });

  // In high-res, GUF is embedded inside FRA — re-add it as its own feature
  if (gufPolygons.length > 0) {
    geojson.features.push({
      type: "Feature",
      id: "GUF",
      properties: { id: "GUF", display_name: "French Guiana", name: "French Guiana" },
      geometry: { type: "MultiPolygon", coordinates: gufPolygons }
    });
  }
}

async function upgradeToHighRes() {
  try {
    const res = await fetch(URL_WORLD_GEO_HIGH);
    const highRes = await res.json();
    prepareGeojsonProperties(highRes);
    filterOverseasTerritories(highRes);
    worldGeojsonOriginal = highRes;
    updateMapColors();
    updateRowsCountLabel();
    updateMapDataSourceFooter();
  } catch (err) {
    console.warn("High-res geojson failed to load, keeping low-res", err);
  }
}

// All KPI keys we pre-bake into feature properties
const KPI_KEYS = ["perc_tracked_total", "perc_tracked_renewables", "perc_residual"];

function parseKpiValue(row, key) {
  const v = row[key];
  return v === "" || v == null ? null : (Number(String(v).replace(",", ".")) || 0);
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

  // Pre-compute ALL KPI values per country from aggregated DATA
  const agg = window.DATA || [];
  const selectedYears = window.state?.filters?.years;
  const yearFilter = selectedYears && selectedYears.length
    ? Math.max(...selectedYears.map(Number))
    : null;

  // kpisByCode: Map<code, { perc_tracked_total: n, perc_tracked_renewables: n, perc_residual: n }>
  const kpisByCode = new Map();
  for (const row of agg) {
    const code = (row.country_code || "").toUpperCase();
    if (!code) continue;
    if (yearFilter != null && Number(row.year) !== yearFilter) continue;
    if (kpisByCode.has(code)) continue;

    const vals = {};
    for (const key of KPI_KEYS) vals[key] = parseKpiValue(row, key);
    // Override perc_residual: use residualmix_gco2kwh (AIB) or fall back to computed EF
    {
      const rmCo2 = parseKpiValue(row, "residualmix_gco2kwh");
      if (rmCo2 != null) {
        vals.perc_residual = Math.min(100, (rmCo2 / RESIDUAL_CO2_MAX) * 100);
      } else {
        const tc  = parseKpiValue(row, "total_co2");
        const tg  = parseKpiValue(row, "total_generation");
        const tce = parseKpiValue(row, "total_certified");
        const rg  = (tg != null && tce != null) ? tg - tce : null;
        vals.perc_residual = (tc != null && rg != null && rg > 0)
          ? Math.min(100, (tc / rg / RESIDUAL_CO2_MAX) * 100)
          : null;
      }
    }
    vals.total_certified = parseKpiValue(row, "total_certified");
    vals.methodology = (row.methodology || "").trim();
    kpisByCode.set(code, vals);
  }

  const updatedGeojson = {
    ...worldGeojsonOriginal,
    features: worldGeojsonOriginal.features.map((f) => {
      const code = (f.id || "").toString().toUpperCase();
      const hasData = filteredByCode.has(code);
      const vals = kpisByCode.get(code);
      const kpiProps = {};
      for (const key of KPI_KEYS) kpiProps["kpi_" + key] = hasData && vals ? (vals[key] ?? null) : null;
      const hasIssuance = hasData && vals && vals.total_certified != null && vals.total_certified > 0;
      const isPartialData = hasIssuance && vals.methodology === "I-REC" && (vals.perc_tracked_total == null || vals.perc_tracked_total > 100);
      return {
        ...f,
        properties: {
          ...f.properties,
          hasDataForFilters: hasData,
          hasIssuance: !!hasIssuance,
          isPartialData: !!isPartialData,
          ...kpiProps
        }
      };
    })
  };

  const src = mapInstance.getSource("countries");
  if (src) src.setData(updatedGeojson);

  // Update small-country dot markers with the same data
  const dotSrc = mapInstance.getSource("small-country-dots");
  if (dotSrc && smallCountryDotsGeojson) {
    const updatedDots = {
      ...smallCountryDotsGeojson,
      features: smallCountryDotsGeojson.features.map(f => {
        const code = (f.id || "").toString().toUpperCase();
        const hasData = filteredByCode.has(code);
        const vals = kpisByCode.get(code);
        const kpiProps = {};
        for (const key of KPI_KEYS) kpiProps["kpi_" + key] = hasData && vals ? (vals[key] ?? null) : null;
        const hasIssuance = hasData && vals && vals.total_certified != null && vals.total_certified > 0;
        const isPartialData = hasIssuance && vals.methodology === "I-REC" && (vals.perc_tracked_total == null || vals.perc_tracked_total > 100);
        return {
          ...f,
          properties: {
            ...f.properties,
            hasDataForFilters: hasData,
            hasIssuance: !!hasIssuance,
            isPartialData: !!isPartialData,
            ...kpiProps
          }
        };
      })
    };
    dotSrc.setData(updatedDots);
  }

  // Ensure paint expression matches current KPI
  switchKpiPaint();
}

// Inverted color stops for residual mix (low CO2 = dark/good, high CO2 = light/bad)
const KPI_COLOR_STOPS_INVERTED = [
  { v: 0,   c: "#034896" },
  { v: 33,  c: "#0579fa" },
  { v: 66,  c: "#69aefc" },
  { v: 100, c: "#9bc9fd" }
];

// Scale for residual mix CO2: values are gCO2/kWh, 800 maps to 100 on the color scale
const RESIDUAL_CO2_MAX = 800;

// Swap the paint expression to read a different pre-baked property — no setData() needed
function switchKpiPaint() {
  if (!mapInstance) return;
  const kpiKey = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";
  const prop = "kpi_" + kpiKey;

  const isResidual = kpiKey === "perc_residual";
  const kpiColorExpr = isResidual ? [
    "case",
    ["!=", ["get", prop], null],
    ["interpolate", ["linear"], ["get", prop],
      0, "#034896", 33, "#0579fa", 66, "#69aefc", 100, "#9bc9fd"
    ],
    "#e0e0e0"
  ] : [
    "interpolate", ["linear"], ["coalesce", ["get", prop], 0],
      0, "#9bc9fd", 33, "#69aefc", 66, "#0579fa", 100, "#034896"
  ];

  const colorExpr = [
    "case",
    // Purple: has I-REC issuance but missing generation data
    ["all", ["==", ["get", "hasDataForFilters"], true], ["==", ["get", "isPartialData"], true]], "#5E2390",
    // Grey: in dataset but no issuance data at all
    ["all", ["==", ["get", "hasDataForFilters"], true], ["==", ["get", "hasIssuance"], false]], "#e0e0e0",
    // Normal KPI coloring
    ["==", ["get", "hasDataForFilters"], true], kpiColorExpr,
    "#e0e0e0"
  ];

  const opacityExpr = [
    "case",
    ["boolean", ["feature-state", "hover"], false], 1.0,
    0.6
  ];

  if (mapInstance.getLayer("country-fill")) {
    mapInstance.setPaintProperty("country-fill", "fill-color", colorExpr);
    mapInstance.setPaintProperty("country-fill", "fill-opacity", opacityExpr);
  }
  if (mapInstance.getLayer("small-country-dots-fill")) {
    mapInstance.setPaintProperty("small-country-dots-fill", "circle-color", colorExpr);
    mapInstance.setPaintProperty("small-country-dots-fill", "circle-opacity", opacityExpr);
  }
}


function setupMapInteractions() {
  if (!mapInstance) return;

  if (window.CountryUI?.attach) {
    window.CountryUI.attach(mapInstance, "country-fill");
    window.CountryUI.attach(mapInstance, "small-country-dots-fill");
  } else {
    console.warn("CountryUI not loaded. Include country-ui.js before view-map.js");
  }
}

function setupKpiOverlaySwitch() {
  const sel = document.getElementById("kpi-color-key");
  if (!sel) return;

  // set initial value from current config (or default)
  const current = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";
  sel.value = current;

  sel.addEventListener("change", () => {
    const key = sel.value;
    const stops = key === "perc_residual" ? KPI_COLOR_STOPS_INVERTED : KPI_COLOR_STOPS;
    window.CountryUI?.setColorKpi?.({ key, stops });
    switchKpiPaint();
  });
}
