// country-ui.js
// Provides: window.CountryUI.attach(mapInstance, layerId)
//          window.CountryUI.getColorKpiConfig(), setColorKpi(config)
//          window.CountryUI.getKpiValue(countryCode), colorForValue(value)

(function () {
  // -----------------------------
  // Configurable KPI for coloring
  // -----------------------------
  let COLOR_KPI = {
    key: "perc_tracked_renewables",
    // thresholds in %, inclusive ranges; we use interpolation between stops
    stops: [
      { v: 0,   c: "#F7EFC6" }, // soft yellow
      { v: 10,  c: "#F3DC9C" }, // deeper soft yellow
      { v: 50,  c: "#F2B08A" }, // soft orange
      { v: 60,  c: "#CDEED7" }, // soft green start
      { v: 100, c: "#76D6A1" }  // soft green
    ]
  };

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex({ r, g, b }) {
    const to = (x) => x.toString(16).padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Soft gradient between stops
  function colorForValue(v) {
    if (v == null || !Number.isFinite(v)) return "#e0e0e0";
    const x = Math.max(0, Math.min(100, v));

    const stops = COLOR_KPI.stops;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (x >= a.v && x <= b.v) {
        const t = (x - a.v) / (b.v - a.v || 1);
        const A = hexToRgb(a.c), B = hexToRgb(b.c);
        return rgbToHex({
          r: Math.round(lerp(A.r, B.r, t)),
          g: Math.round(lerp(A.g, B.g, t)),
          b: Math.round(lerp(A.b, B.b, t))
        });
      }
    }
    return stops[stops.length - 1].c;
  }

  // -----------------------------
  // Data helpers / formatting
  // -----------------------------
  const parseNum = (val) =>
    val === null || val === undefined || val === ""
      ? null
      : (Number(String(val).replace(",", ".")) || 0);

  const formatNum = (val, decimals = 2) => {
    const n = parseNum(val);
    if (n === null) return "-";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  };

  const HIDDEN_DETAIL_COLUMNS = new Set([
    "country",
    "country_code",
    "year",
    "first_source",
    "emission_factor"
  ]);

  const PRETTY_COLUMN_NAMES = {
    energy_source: "Energy source",
    class: "Category",
    certified_mix: "Certified mix",
    issuance_ext: "Issuance (external)",
    issuance_irec: "Issuance (I-REC)",
    residual_mix: "Residual mix",
    total_generation: "Total generation",
    total_co2: "Total CO₂",
    method: "Method"
  };

  const UNITS = {
    certified_mix: "MWh",
    issuance_ext: "MWh",
    issuance_irec: "MWh",
    residual_mix: "MWh",
    total_generation: "MWh",
    total_co2: "kg CO₂"
  };

  const numericCols = new Set([
    "certified_mix",
    "issuance_ext",
    "issuance_irec",
    "residual_mix",
    "total_generation",
    "total_co2"
  ]);

  const prettifyColumn = (key) =>
    PRETTY_COLUMN_NAMES[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const pickYearForCountry = (code) => {
    const y = window.state?.filters?.year;
    if (y) return Number(y);

    const rows = (window.DATA || []).filter(
      (r) => (r.country_code || "").toUpperCase() === code
    );
    if (!rows.length) return null;
    return Math.max(...rows.map((r) => Number(r.year)).filter(Number.isFinite));
  };

  function getAggRow(code) {
    const year = pickYearForCountry(code);
    const agg = (window.DATA || []).find(
      (r) =>
        (r.country_code || "").toUpperCase() === code &&
        (year == null || Number(r.year) === Number(year))
    );
    return { agg, year };
  }

  function getKpis(code) {
    const { agg, year } = getAggRow(code);
    return {
      year,
      country: agg?.country || code,
      perc_tracked_renewables: agg?.perc_tracked_renewables ?? null,
      total_generation: agg?.total_generation ?? null
    };
  }

  function getKpiValue(code) {
    const { agg } = getAggRow(code);
    const v = agg?.[COLOR_KPI.key];
    const n = parseNum(v);
    // KPI like perc_tracked_renewables is already % numeric (or string) in your aggregated output
    return n == null ? null : n;
  }

  // -----------------------------
  // Hover popup (2 KPI cards)
  // -----------------------------
  function buildPopupHtml(k, kpiColor) {
    const pct =
      k.perc_tracked_renewables == null
        ? "-"
        : `${formatNum(k.perc_tracked_renewables, 2)}%`;
    const gen =
      k.total_generation == null ? "-" : formatNum(k.total_generation, 2);

    return `
      <div style="font-family: Arial, sans-serif; font-size:12px; padding:10px; min-width:240px;">
        <div style="font-weight:700; margin-bottom:6px;">
          ${k.country}${k.year ? ` (${k.year})` : ""}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div style="border:1px solid #e7e7e7; border-radius:10px; padding:8px;">
            <div style="font-size:11px; color:#666; margin-bottom:4px;">Tracked renewables</div>
            <div style="font-size:16px; font-weight:800; color:#111;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:999px; background:${kpiColor}; margin-right:6px; vertical-align:middle;"></span>
              ${pct}
            </div>
          </div>

          <div style="border:1px solid #e7e7e7; border-radius:10px; padding:8px;">
            <div style="font-size:11px; color:#666; margin-bottom:4px;">Total generation</div>
            <div style="font-size:16px; font-weight:700;">${gen} <span style="font-size:11px; color:#666;">MWh</span></div>
          </div>
        </div>

        <div style="margin-top:8px; color:#666; font-size:11px;">
          Click for details
        </div>
      </div>
    `;
  }

  // -----------------------------
  // Modal creation + sortable table
  // -----------------------------
  function ensureModal() {
    let backdrop = document.getElementById("kpi-modal-backdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "kpi-modal-backdrop";
    backdrop.className = "kpi-modal-backdrop";
    backdrop.innerHTML = `
      <div class="kpi-modal" role="dialog" aria-modal="true">
        <div class="kpi-modal-header">
          <div class="kpi-modal-title" id="kpi-modal-title"></div>
          <button class="kpi-modal-close" id="kpi-modal-close" type="button">Close</button>
        </div>
        <div class="kpi-modal-body" id="kpi-modal-body"></div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = () => {
      const modal = backdrop.querySelector(".kpi-modal");
      backdrop.classList.remove("open");
      modal.classList.remove("open");
      setTimeout(() => backdrop.remove(), 170);
    };

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector("#kpi-modal-close").addEventListener("click", close);

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && document.getElementById("kpi-modal-backdrop"))
          close();
      },
      { once: true }
    );

    return backdrop;
  }

  function openDetailsModal(countryCode) {
    const k = getKpis(countryCode);
    const year = k.year;

    const details = (window.DATA_DETAIL || []).filter(
      (r) =>
        (r.country_code || "").toUpperCase() === countryCode &&
        (year == null || Number(r.year) === Number(year))
    );

    const cols = details.length
      ? Object.keys(details[0]).filter((c) => !HIDDEN_DETAIL_COLUMNS.has(c))
      : [
          "energy_source",
          "class",
          "certified_mix",
          "issuance_ext",
          "issuance_irec",
          "residual_mix",
          "total_generation",
          "total_co2",
          "method"
        ];

    const kpiVal = getKpiValue(countryCode);
    const kpiColor = colorForValue(kpiVal);

    const pct =
      k.perc_tracked_renewables == null
        ? "-"
        : `${formatNum(k.perc_tracked_renewables, 2)}%`;
    const gen =
      k.total_generation == null ? "-" : formatNum(k.total_generation, 2);

    const backdrop = ensureModal();
    const modal = backdrop.querySelector(".kpi-modal");
    backdrop.querySelector("#kpi-modal-title").textContent =
      `${k.country}${k.year ? ` (${k.year})` : ""} — Details`;

    // Sort state
    let sortKey = null;
    let sortDir = 1; // 1 asc, -1 desc

    // Compute totals for numeric columns (from current details rows)
    const totals = {};
    for (const c of cols) {
      if (numericCols.has(c)) totals[c] = 0;
    }
    for (const row of details) {
      for (const c of cols) {
        if (!numericCols.has(c)) continue;
        const n = parseNum(row[c]);
        totals[c] += (n == null ? 0 : n);
      }
    }

    const body = backdrop.querySelector("#kpi-modal-body");

    function renderTable() {
      const rows = details.slice();

      if (sortKey) {
        rows.sort((a, b) => {
          const av = a[sortKey];
          const bv = b[sortKey];

          // numeric if possible
          if (numericCols.has(sortKey) || String(sortKey).startsWith("perc_")) {
            const an = parseNum(av) ?? 0;
            const bn = parseNum(bv) ?? 0;
            return (an - bn) * sortDir;
          }

          // string
          return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
        });
      }

      const thead = `
        <thead>
          <tr>
            ${cols
              .map((c) => {
                const unit = UNITS[c] ? ` <span style="font-weight:400;color:#666;">(${UNITS[c]})</span>` : "";
                const ind = sortKey === c ? `<span class="sort-ind">${sortDir === 1 ? "▲" : "▼"}</span>` : `<span class="sort-ind"></span>`;
                return `<th data-sort="${c}">${prettifyColumn(c)}${unit}${ind}</th>`;
              })
              .join("")}
          </tr>
        </thead>
      `;

      const tbodyRows = rows
        .map((row) => {
          const tds = cols
            .map((c) => {
              const v = row[c];
              if (String(c).startsWith("perc_")) {
                const n = parseNum(v);
                return `<td>${n == null ? "-" : `${formatNum(n, 2)}%`}</td>`;
              }
              if (numericCols.has(c)) {
                const n = parseNum(v);
                // keep your high precision for row-level numbers
                return `<td>${n == null ? (v === "" ? "-" : String(v)) : formatNum(n, 2)}</td>`;
              }
              return `<td>${v === "" || v == null ? "-" : String(v)}</td>`;
            })
            .join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");

      const totalsRow = `
        <tr class="kpi-totals-row">
          ${cols
            .map((c, idx) => {
              if (idx === 0) return `<td>Totals</td>`;
              if (!numericCols.has(c)) return `<td></td>`;
              // totals should be readable: fewer decimals
              return `<td>${formatNum(totals[c], c === "total_co2" ? 0 : 2)}</td>`;
            })
            .join("")}
        </tr>
      `;

      const table = `
        <table class="kpi-table">
          ${thead}
          <tbody>
            ${tbodyRows}
            ${totalsRow}
          </tbody>
        </table>
      `;

      // Render + wire sorting
      const tableWrap = body.querySelector("#kpi-table-wrap");
      tableWrap.innerHTML = table;

      tableWrap.querySelectorAll("th[data-sort]").forEach((th) => {
        th.addEventListener("click", () => {
          const key = th.getAttribute("data-sort");
          if (sortKey === key) sortDir = sortDir * -1;
          else { sortKey = key; sortDir = -1; } // default: desc for “largest first”
          renderTable();
        });
      });
    }

    body.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Tracked renewables</div>
          <div class="kpi-value">
            <span style="display:inline-block; width:10px; height:10px; border-radius:999px; background:${kpiColor}; margin-right:8px; vertical-align:middle;"></span>
            ${pct}
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total generation (MWh)</div>
          <div class="kpi-value">${gen}</div>
        </div>
      </div>

      <div id="kpi-table-wrap"></div>
    `;

    renderTable();

    // animate in
    requestAnimationFrame(() => {
      backdrop.classList.add("open");
      modal.classList.add("open");
    });
  }

  // -----------------------------
  // Public API
  // -----------------------------
  function attach(mapInstance, layerId) {
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    mapInstance.on("mouseenter", layerId, () => {
      mapInstance.getCanvas().style.cursor = "pointer";
    });

    mapInstance.on("mouseleave", layerId, () => {
      mapInstance.getCanvas().style.cursor = "";
      popup.remove();
    });

    mapInstance.on("mousemove", layerId, (e) => {
      const feature = e.features && e.features[0];
      if (!feature) return;

      const code = (feature.properties && feature.properties.id || "")
        .toString()
        .toUpperCase();

      const rows = (window.DATA || []).filter(r => (r.country_code || "").toUpperCase() === code);
      if (!rows.length) {
        popup.setLngLat(e.lngLat).setHTML(`<strong>${code}</strong><br/><em>No data for current filters</em>`).addTo(mapInstance);
        return;
      }

      const k = getKpis(code);
      const kpiVal = getKpiValue(code);
      const kpiColor = colorForValue(kpiVal);
      popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(k, kpiColor)).addTo(mapInstance);
    });

    mapInstance.on("click", layerId, (e) => {
      const feature = e.features && e.features[0];
      if (!feature) return;

      const code = (feature.id || feature.properties?.id || "")
        .toString()
        .toUpperCase();

      if (code) openDetailsModal(code);
    });
  }

  function setColorKpi(config) {
    // config: { key, stops:[{v,c},...] }
    if (config?.key) COLOR_KPI.key = config.key;
    if (Array.isArray(config?.stops) && config.stops.length >= 2) COLOR_KPI.stops = config.stops;
  }

  function getColorKpiConfig() {
    return JSON.parse(JSON.stringify(COLOR_KPI));
  }

  window.CountryUI = {
    attach,
    setColorKpi,
    getColorKpiConfig,
    getKpiValue,
    colorForValue
  };
})();
