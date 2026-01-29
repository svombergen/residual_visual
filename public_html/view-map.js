// view-map.js
// Depends on: state, getFilteredData, maplibregl

const URL_WORLD_GEO =
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

let mapInstance = null;
let worldGeojsonOriginal = null;

window.renderMapView = async function renderMapView() {
  if (!mapInstance) {
    await initMap();
  }
  updateMapColors();
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
            "#4176ff",
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

  mapInstance.on("mousemove", "country-fill", (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;

    const code = (feature.properties && feature.properties.id || "")
      .toString()
      .toUpperCase();
    const name = (feature.properties && feature.properties.display_name) || code;

    const rows = getFilteredData().filter(r => r.country_code === code);

    if (!rows.length) {
      const html = `<strong>${name}</strong><br/><em>No data for current filters</em>`;
      popup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance);
      return;
    }

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

      const totalGen = agg.certified + agg.residual;
      const avgEf = agg.emissionFactorCount
        ? agg.emissionFactor / agg.emissionFactorCount
        : 0;

      const co2 = totalGen * avgEf;
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
      <div style="font-size:12px; width:100%; min-width:460px; max-width:620px; padding:10px; box-sizing:border-box;">
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

    popup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance);
  });

  mapInstance.on("mouseleave", "country-fill", () => {
    popup.remove();
  });

  mapInstance.on("click", "country-fill", (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const code = (feature.id || "").toString().toUpperCase();
    if (code) {
      location.hash = `#/country/${code}`;
    }
  });
}
