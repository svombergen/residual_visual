// country-ui.js
// Provides: window.CountryUI.attach(mapInstance, layerId)
//          window.CountryUI.getColorKpiConfig(), setColorKpi(config)
//          window.CountryUI.getKpiValue(countryCode), colorForValue(value)

(function () {
  // -----------------------------
  // Configurable KPI for coloring
  // -----------------------------
  let COLOR_KPI = {
    key: "perc_tracked_total",
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
    "emission_factor",
    "class",
    "method",
    "total_co2",
    "residual_mix"
  ]);

  // Desired table column order (left to right); columns with all-zero values are hidden
  const TABLE_COLUMN_ORDER = [
    "energy_source",
    "total_generation",
    "certified_mix",
    "issuance_irec",
    "issuance_ext",
    "issuance_other",
    "import_physical",
    "export_physical",
    "import_certificates",
    "export_certificates",
    "untracked",
    "gen_mix_ef",
    "residual_mix_ef"
  ];

  const PRETTY_COLUMN_NAMES = {
    energy_source: "Energy Source",
    certified_mix: "Issuance (all EACs)",
    issuance_ext: "Issuance (GO)",
    issuance_irec: "Issuance (I-REC(E))",
    issuance_other: "Issuance (other)",
    residual_mix: "Residual mix",
    total_generation: "Total Generation",
    total_co2: "Total CO₂",
    import_physical: "Import (physical)",
    export_physical: "Export (physical)",
    import_certificates: "Import (certificates)",
    export_certificates: "Export (certificates)",
    untracked: "Untracked",
    gen_mix_ef: "Generation Mix EF",
    residual_mix_ef: "Residual Mix EF"
  };

  const UNITS = {
    certified_mix: "MWh",
    issuance_ext: "MWh",
    issuance_irec: "MWh",
    issuance_other: "MWh",
    residual_mix: "MWh",
    total_generation: "MWh",
    total_co2: "kg CO₂",
    import_physical: "MWh",
    export_physical: "MWh",
    import_certificates: "MWh",
    export_certificates: "MWh",
    untracked: "MWh",
    gen_mix_ef: "tCO₂/MWh",
    residual_mix_ef: "tCO₂/MWh"
  };

  const numericCols = new Set([
    "certified_mix",
    "issuance_ext",
    "issuance_irec",
    "issuance_other",
    "residual_mix",
    "total_generation",
    "total_co2",
    "import_physical",
    "export_physical",
    "import_certificates",
    "export_certificates",
    "untracked",
    "gen_mix_ef",
    "residual_mix_ef"
  ]);

  const prettifyColumn = (key) =>
    PRETTY_COLUMN_NAMES[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // ISO 3166-1 alpha-3 → alpha-2 lookup (for flag icons)
  const ISO3_TO_ISO2 = {
    AFG:"af",AGO:"ao",ALB:"al",ARE:"ae",ARG:"ar",ARM:"am",ATA:"aq",
    ATF:"tf",AUS:"au",AUT:"at",AZE:"az",BDI:"bi",BEL:"be",BEN:"bj",
    BFA:"bf",BGD:"bd",BGR:"bg",BHR:"bh",BHS:"bs",BIH:"ba",BLR:"by",BLZ:"bz",
    BMU:"bm",BOL:"bo",BRA:"br",BRN:"bn",BTN:"bt",BWA:"bw",CAF:"cf",
    CAN:"ca",CHE:"ch",CHL:"cl",CHN:"cn",CIV:"ci",CMR:"cm",COD:"cd",
    COG:"cg",COL:"co",CRI:"cr",CUB:"cu",CUW:"cw",CYP:"cy",CZE:"cz",DEU:"de",
    DJI:"dj",DNK:"dk",DOM:"do",DZA:"dz",ECU:"ec",EGY:"eg",ERI:"er",
    ESH:"eh",ESP:"es",EST:"ee",ETH:"et",FIN:"fi",FJI:"fj",FLK:"fk",
    FRA:"fr",GAB:"ga",GBR:"gb",GEO:"ge",GHA:"gh",GIN:"gn",GMB:"gm",
    GNB:"gw",GNQ:"gq",GRC:"gr",GRL:"gl",GTM:"gt",GUF:"gf",GUY:"gy",
    HND:"hn",HRV:"hr",HTI:"ht",HUN:"hu",IDN:"id",IND:"in",IRL:"ie",
    IRN:"ir",IRQ:"iq",ISL:"is",ISR:"il",ITA:"it",JAM:"jm",JOR:"jo",
    JPN:"jp",KAZ:"kz",KEN:"ke",KGZ:"kg",KHM:"kh",KOR:"kr",KWT:"kw",
    LAO:"la",LBN:"lb",LBR:"lr",LBY:"ly",LKA:"lk",LSO:"ls",LTU:"lt",
    LUX:"lu",LVA:"lv",MAR:"ma",MDA:"md",MDG:"mg",MEX:"mx",MKD:"mk",
    MLI:"ml",MLT:"mt",MMR:"mm",MNE:"me",MNG:"mn",MOZ:"mz",MRT:"mr",
    MUS:"mu",MWI:"mw",MYS:"my",NAM:"na",NCL:"nc",NER:"ne",NGA:"ng",
    NIC:"ni",NLD:"nl",NOR:"no",NPL:"np",NZL:"nz",OMN:"om",PAK:"pk",
    PAN:"pa",PER:"pe",PHL:"ph",PNG:"pg",POL:"pl",PRI:"pr",PRK:"kp",
    PRT:"pt",PRY:"py",PSE:"ps",QAT:"qa",ROU:"ro",RUS:"ru",RWA:"rw",
    SAU:"sa",SDN:"sd",SEN:"sn",SGP:"sg",SLB:"sb",SLE:"sl",SLV:"sv",
    SOM:"so",SRB:"rs",SSD:"ss",SUR:"sr",SVK:"sk",SVN:"si",SWE:"se",
    SWZ:"sz",SYR:"sy",TCD:"td",TGO:"tg",THA:"th",TJK:"tj",TKM:"tm",
    TLS:"tl",TTO:"tt",TUN:"tn",TUR:"tr",TWN:"tw",TZA:"tz",UGA:"ug",
    UKR:"ua",URY:"uy",USA:"us",UZB:"uz",VEN:"ve",VNM:"vn",VUT:"vu",
    YEM:"ye",ZAF:"za",ZMB:"zm",ZWE:"zw"
  };

  function countryFlag(iso3) {
    const iso2 = ISO3_TO_ISO2[iso3];
    if (!iso2) return "";
    return `<img src="https://flagcdn.com/24x18/${iso2}.png" width="24" height="18" alt="" style="vertical-align:middle;margin-right:6px;">`;
  }

  const pickYearForCountry = (code) => {
    const selectedYears = window.state?.filters?.years;
    if (selectedYears && selectedYears.length) {
      return Math.max(...selectedYears.map(Number));
    }

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

  function computeResidualEf(agg) {
    const totalCo2 = parseNum(agg?.total_co2);
    const totalGen = parseNum(agg?.total_generation);
    const totalCert = parseNum(agg?.total_certified);
    if (totalCo2 == null || totalGen == null || totalCert == null) return null;
    const residualGen = totalGen - totalCert;
    if (residualGen <= 0) return null;
    return totalCo2 / residualGen / 1000; // kg → tons CO₂/MWh
  }

  function getKpis(code) {
    const { agg, year } = getAggRow(code);
    return {
        year,
        country: agg?.country || code,
        perc_tracked_total: agg?.perc_tracked_total ?? null,
        perc_tracked_renewables: agg?.perc_tracked_renewables ?? null,
        residual_ef: computeResidualEf(agg)
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
  function buildPopupHtml(k, kpiColor, code) {
    const colorKey = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";

    const pctTrackedElec = k.perc_tracked_total == null ? "-" : `${formatNum(k.perc_tracked_total, 2)}%`;
    const pctRenew       = k.perc_tracked_renewables == null ? "-" : `${formatNum(k.perc_tracked_renewables, 2)}%`;
    const residualEf     = k.residual_ef == null ? "-" : formatNum(k.residual_ef, 4);

    const dot = (key) =>
        key === colorKey
        ? `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${kpiColor};margin-right:6px;vertical-align:middle;"></span>`
        : "";

    return `
        <div style="font-family: Arial, sans-serif; font-size:12px; padding:10px; min-width:320px;">
        <div style="font-weight:700; margin-bottom:6px;">
            ${countryFlag(code)}${k.country}${k.year ? ` (${k.year})` : ""}
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
            <div style="border:1px solid #e7e7e7; border-radius:10px; padding:8px;">
            <div style="font-size:11px; color:#666; margin-bottom:4px;">Tracked Electricity</div>
            <div style="font-size:15px; font-weight:800; color:#111;">
                ${dot("perc_tracked_total")}${pctTrackedElec}
            </div>
            </div>

            <div style="border:1px solid #e7e7e7; border-radius:10px; padding:8px;">
            <div style="font-size:11px; color:#666; margin-bottom:4px;">Tracked Renewables</div>
            <div style="font-size:15px; font-weight:800; color:#111;">
                ${dot("perc_tracked_renewables")}${pctRenew}
            </div>
            </div>

            <div style="border:1px solid #e7e7e7; border-radius:10px; padding:8px;">
            <div style="font-size:11px; color:#666; margin-bottom:4px;">Residual Mix</div>
            <div style="font-size:15px; font-weight:800; color:#111;">
                ${dot("perc_residual")}${residualEf} <span style="font-size:10px;font-weight:400;color:#666;">tCO₂/MWh</span>
            </div>
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
          <div style="display:flex;align-items:center;gap:12px;">
            <span id="kpi-modal-method" style="font-size:11px;color:#666;"></span>
            <button class="kpi-modal-close" id="kpi-modal-close" type="button">Close</button>
          </div>
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
    const code = String(countryCode).toUpperCase();

    // Available years for this country (prefer aggregated DATA; fallback to DATA_DETAIL)
    const yearsFromAgg = (window.DATA || [])
        .filter(r => String(r.country_code || "").toUpperCase() === code)
        .map(r => Number(r.year))
        .filter(Number.isFinite);

    const yearsFromDetail = (window.DATA_DETAIL || [])
        .filter(r => String(r.country_code || "").toUpperCase() === code)
        .map(r => Number(r.year))
        .filter(Number.isFinite);

    const years = Array.from(new Set([...(yearsFromAgg.length ? yearsFromAgg : []), ...yearsFromDetail]))
        .sort((a, b) => a - b);

    // Initial year = latest selected year if it exists AND country has it, else latest available
    const selectedYears = window.state?.filters?.years;
    const globalYear = selectedYears && selectedYears.length
        ? Math.max(...selectedYears.map(Number))
        : null;
    let currentYear = (globalYear != null && years.includes(globalYear))
        ? globalYear
        : (years.length ? years[years.length - 1] : null);

    const backdrop = ensureModal();
    const modal = backdrop.querySelector(".kpi-modal");
    const titleEl = backdrop.querySelector("#kpi-modal-title");
    const body = backdrop.querySelector("#kpi-modal-body");

    // Sort state (persists while stepping years)
    let sortKey = null;
    let sortDir = 1; // 1 asc, -1 desc
    let activeTab = "bar"; // "bar" | "pies" | "table"
    let donutChart = null;
    let barChart = null;

    function setTitle(countryName, year) {
        const idx = years.indexOf(year);
        const hasPrev = idx > 0;
        const hasNext = idx >= 0 && idx < years.length - 1;

        // NOTE: we set innerHTML so we can place buttons around the year
        titleEl.innerHTML = `
        <span>${countryFlag(code)}${countryName}  </span>
        <span class="kpi-year-nav">
            <button class="kpi-year-btn" id="kpi-year-prev" ${hasPrev ? "" : "disabled"} aria-label="Previous year">‹</button>
            <span style="font-weight:700;">${year ?? "-"}</span>
            <button class="kpi-year-btn" id="kpi-year-next" ${hasNext ? "" : "disabled"} aria-label="Next year">›</button>
        </span>
        `;

        // Wire buttons (each render)
        const prevBtn = titleEl.querySelector("#kpi-year-prev");
        const nextBtn = titleEl.querySelector("#kpi-year-next");

        if (prevBtn) {
        prevBtn.onclick = () => {
            const i = years.indexOf(currentYear);
            if (i > 0) {
            currentYear = years[i - 1];
            renderForYear(currentYear);
            }
        };
        }
        if (nextBtn) {
        nextBtn.onclick = () => {
            const i = years.indexOf(currentYear);
            if (i >= 0 && i < years.length - 1) {
            currentYear = years[i + 1];
            renderForYear(currentYear);
            }
        };
        }
    }

    function renderForYear(year) {
        // Pull aggregated row for KPIs for THIS year (does not touch global year filter)
        const aggRow = (window.DATA || []).find(
        r =>
            String(r.country_code || "").toUpperCase() === code &&
            Number(r.year) === Number(year)
        );

        const countryName = aggRow?.country || code;

        const k = {
        country: countryName,
        year,
        perc_tracked_total: aggRow?.perc_tracked_total ?? null,
        perc_tracked_renewables: aggRow?.perc_tracked_renewables ?? null,
        residual_ef: computeResidualEf(aggRow)
        };

        // Details for this year
        const details = (window.DATA_DETAIL || []).filter(
        r =>
            String(r.country_code || "").toUpperCase() === code &&
            Number(r.year) === Number(year)
        );

        // Enrich detail rows with computed columns
        const enrichedDetails = details.map(r => {
            const cert = parseNum(r.certified_mix) || 0;
            const ext  = parseNum(r.issuance_ext) || 0;
            const irec = parseNum(r.issuance_irec) || 0;
            const gen  = parseNum(r.total_generation) || 0;
            const co2  = parseNum(r.total_co2) || 0;
            const resid = parseNum(r.residual_mix) || 0;
            return {
                ...r,
                issuance_other: Math.max(0, cert - ext - irec),
                import_physical: parseNum(r.import_physical) || 0,
                export_physical: parseNum(r.export_physical) || 0,
                import_certificates: parseNum(r.import_certificates) || 0,
                export_certificates: parseNum(r.export_certificates) || 0,
                untracked: parseNum(r.untracked) || 0,
                gen_mix_ef: gen > 0 ? co2 / gen / 1000 : 0,
                residual_mix_ef: resid > 0 ? (co2 > 0 ? co2 / resid / 1000 : 0) : 0
            };
        });

        // Determine visible table columns: use defined order, hide columns with all-zero values
        const cols = TABLE_COLUMN_ORDER.filter(c => {
            if (c === "energy_source") return true; // always show
            return enrichedDetails.some(r => {
                const v = numericCols.has(c) ? (typeof r[c] === "number" ? r[c] : parseNum(r[c]) || 0) : r[c];
                return v !== 0 && v !== "" && v != null;
            });
        });

        // Color dot should reflect *current* map-color KPI key, but KPIs stay in fixed positions
        const kpiVal = (() => {
        const key = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";
        const v = aggRow?.[key];
        const n = v === "" || v == null ? null : (Number(String(v).replace(",", ".")) || 0);
        return n;
        })();
        const kpiColor = colorForValue(kpiVal);

        const colorKey =
        window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";

        const dot = (key) =>
        key === colorKey
            ? `<span style="display:inline-block; width:10px; height:10px; border-radius:999px; background:${kpiColor}; margin-right:8px; vertical-align:middle;"></span>`
            : "";

        const pctTrackedElec =
        k.perc_tracked_total == null
            ? "-"
            : `${formatNum(k.perc_tracked_total, 2)}%`;

        const pctRenew =
        k.perc_tracked_renewables == null
            ? "-"
            : `${formatNum(k.perc_tracked_renewables, 2)}%`;

        const residualEf =
        k.residual_ef == null ? "-" : formatNum(k.residual_ef, 4);

        // Compute totals for numeric columns
        const totals = {};
        for (const c of cols) if (numericCols.has(c)) totals[c] = 0;
        for (const row of enrichedDetails) {
            for (const c of cols) {
                if (!numericCols.has(c)) continue;
                const v = typeof row[c] === "number" ? row[c] : (parseNum(row[c]) || 0);
                totals[c] += v;
            }
        }

        // Methodology: read from aggregated data
        const methodLabel = (aggRow?.methodology || "").trim() || "Other";

        // Data sources
        const dataSources = [...new Set(details.map(r => (r.first_source || "").trim()).filter(Boolean))];

        function renderTable() {
        const rows = enrichedDetails.slice();

        if (sortKey) {
            rows.sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (numericCols.has(sortKey)) {
                const an = (typeof av === "number" ? av : parseNum(av)) ?? 0;
                const bn = (typeof bv === "number" ? bv : parseNum(bv)) ?? 0;
                return (an - bn) * sortDir;
            }
            return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
            });
        }

        const thead = `
            <thead>
            <tr>
                ${cols
                .map((c) => {
                    const unit = UNITS[c]
                    ? ` <span style="font-weight:400;color:#666;">(${UNITS[c]})</span>`
                    : "";
                    const ind =
                    sortKey === c
                        ? `<span class="sort-ind">${sortDir === 1 ? "▲" : "▼"}</span>`
                        : `<span class="sort-ind"></span>`;
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
                if (numericCols.has(c)) {
                    const n = typeof v === "number" ? v : parseNum(v);
                    const dec = (c === "gen_mix_ef" || c === "residual_mix_ef") ? 4 : 2;
                    return `<td>${n == null ? "-" : formatNum(n, dec)}</td>`;
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
                if (c === "gen_mix_ef" || c === "residual_mix_ef") return `<td></td>`;
                return `<td>${formatNum(totals[c], 2)}</td>`;
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

        const tableWrap = body.querySelector("#kpi-table-wrap");
        tableWrap.innerHTML = table;

        tableWrap.querySelectorAll("th[data-sort]").forEach((th) => {
            th.onclick = () => {
            const key = th.getAttribute("data-sort");
            if (sortKey === key) sortDir = sortDir * -1;
            else { sortKey = key; sortDir = -1; }
            renderTable();
            };
        });
        }

        // Fixed KPI order: tracked electricity, tracked renewables, residual mix
        body.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="kpi-card">
            <div class="kpi-label">Tracked Electricity</div>
            <div class="kpi-value">${dot("perc_tracked_total")}${pctTrackedElec}</div>
            </div>

            <div class="kpi-card">
            <div class="kpi-label">Tracked Renewables</div>
            <div class="kpi-value">${dot("perc_tracked_renewables")}${pctRenew}</div>
            </div>

            <div class="kpi-card">
            <div class="kpi-label">Residual Mix</div>
            <div class="kpi-value">${dot("perc_residual")}${residualEf} <span style="font-size:11px;font-weight:400;color:#666;">tCO₂/MWh</span></div>
            </div>
        </div>

        <div class="kpi-segments" id="kpi-segments">
            <button class="kpi-seg-btn${activeTab === "bar" ? " active" : ""}" data-tab="bar">Electricity mix</button>
            <button class="kpi-seg-btn${activeTab === "pies" ? " active" : ""}" data-tab="pies">Generation vs Residual</button>
            <button class="kpi-seg-btn${activeTab === "table" ? " active" : ""}" data-tab="table">Table</button>
        </div>

        <div id="kpi-tab-table" style="display:${activeTab === "table" ? "block" : "none"}">
            <div id="kpi-table-wrap"></div>
        </div>
        <div id="kpi-tab-pies" style="display:${activeTab === "pies" ? "block" : "none"}">
            <div id="kpi-pies-chart" class="kpi-chart-wrap" style="display:flex;align-items:center;"></div>
        </div>
        <div id="kpi-tab-bar" style="display:${activeTab === "bar" ? "block" : "none"}">
            <div id="kpi-bar-chart" class="kpi-chart-wrap"></div>
        </div>

        <div id="kpi-data-source-footer" style="margin-top:12px;padding-top:10px;border-top:1px solid #e7e7e7;font-size:11px;color:#888;">
            ${dataSources.length ? `Data Source: ${dataSources.join(", ")}` : ""}
        </div>
        `;

        // Wire segmented control
        const tabIds = ["bar", "pies", "table"];
        body.querySelectorAll("#kpi-segments .kpi-seg-btn").forEach(btn => {
            btn.onclick = () => {
                activeTab = btn.getAttribute("data-tab");
                body.querySelectorAll("#kpi-segments .kpi-seg-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                tabIds.forEach(t => {
                    const el = body.querySelector("#kpi-tab-" + t);
                    if (el) el.style.display = t === activeTab ? "block" : "none";
                });
                if (activeTab === "pies") renderPies(enrichedDetails);
                if (activeTab === "bar")  renderBarChart(enrichedDetails);
            };
        });

        setTitle(countryName, year);
        const methodEl = backdrop.querySelector("#kpi-modal-method");
        if (methodEl) methodEl.innerHTML = `Methodology: <strong>${methodLabel}</strong>`;
        renderTable();
        if (activeTab === "pies") renderPies(enrichedDetails);
        if (activeTab === "bar")  renderBarChart(enrichedDetails);

        // ---- Generation vs Residual (3 pie charts) ----
        function renderPies(rows) {
            if (donutChart) { donutChart.dispose(); donutChart = null; }
            const container = body.querySelector("#kpi-pies-chart");
            if (!container) return;
            donutChart = echarts.init(container);

            const SOURCE_COLORS = {
                "Bio":"#8BC34A","Coal":"#9E9E9E","Gas":"#FF9800","Hydro":"#2196F3",
                "Nuclear":"#F2B08A","Oil":"#795548","Solar":"#FFD600","Wind":"#00BCD4",
                "Other (R)":"#76D6A1","Other (F)":"#BDBDBD"
            };
            const fallbackColor = "#CDCED0";

            // Left pie: Generation Mix (by energy source, using total_generation)
            const genBySource = {};
            for (const r of rows) {
                const src = r.energy_source || "Other";
                genBySource[src] = (genBySource[src] || 0) + (parseNum(r.total_generation) || 0);
            }
            const genData = Object.entries(genBySource)
                .filter(([,v]) => v > 0)
                .map(([name, value]) => ({
                    name, value: Math.round(value * 100) / 100,
                    itemStyle: { color: SOURCE_COLORS[name] || fallbackColor }
                }));

            // Right pie: Residual Mix (by energy source, using residual_mix)
            const resBySource = {};
            for (const r of rows) {
                const src = r.energy_source || "Other";
                resBySource[src] = (resBySource[src] || 0) + (parseNum(r.residual_mix) || 0);
            }
            const resData = Object.entries(resBySource)
                .filter(([,v]) => v > 0)
                .map(([name, value]) => ({
                    name, value: Math.round(value * 100) / 100,
                    itemStyle: { color: SOURCE_COLORS[name] || fallbackColor }
                }));

            // Middle pie: Tracked percentage (certified vs uncertified)
            const totalGen = rows.reduce((s, r) => s + (parseNum(r.total_generation) || 0), 0);
            const totalCert = rows.reduce((s, r) => s + (parseNum(r.certified_mix) || 0), 0);
            const trackedPct = totalGen > 0 ? Math.round(totalCert / totalGen * 10000) / 100 : 0;
            const trackedData = [
                { name: "Tracked", value: Math.round(totalCert * 100) / 100, itemStyle: { color: "#76D6A1" } },
                { name: "Untracked", value: Math.round((totalGen - totalCert) * 100) / 100, itemStyle: { color: "#e0e0e0" } }
            ].filter(d => d.value > 0);

            // Emission factor for the center label
            const totalCo2 = rows.reduce((s, r) => s + (parseNum(r.total_co2) || 0), 0);
            const genEf = totalGen > 0 ? (totalCo2 / totalGen / 1000) : null;
            const residualGen = totalGen - totalCert;
            const resEf = residualGen > 0 ? (totalCo2 / residualGen / 1000) : null;

            const pieLabelOpt = { show: false };
            const pieEmphasis = { label: { show: true, fontSize: 12, fontWeight: "bold", formatter: "{b}\n{d}%", overflow: "break" } };
            const pieStyle = { borderRadius: 4, borderColor: "#fff", borderWidth: 2 };

            donutChart.setOption({
                tooltip: { show: false },
                legend: { bottom: 0, textStyle: { fontSize: 11 } },
                title: [
                    { text: "Generation Mix", left: "16%", top: 0, textAlign: "center", textStyle: { fontSize: 13, fontWeight: 700 } },
                    { text: "Tracked %", left: "50%", top: 0, textAlign: "center", textStyle: { fontSize: 13, fontWeight: 700 } },
                    { text: "Residual Mix", left: "83%", top: 0, textAlign: "center", textStyle: { fontSize: 13, fontWeight: 700 } },
                    // Values below pies
                    { text: genEf != null ? `${formatNum(genEf, 4)} tCO₂/MWh` : "", left: "16%", top: "70%", textAlign: "center",
                      textStyle: { fontSize: 14, fontWeight: 700, color: "#333" } },
                    { text: `${trackedPct}%`, left: "50%", top: "70%", textAlign: "center",
                      textStyle: { fontSize: 14, fontWeight: 700, color: "#333" } },
                    { text: resEf != null ? `${formatNum(resEf, 4)} tCO₂/MWh` : "", left: "83%", top: "70%", textAlign: "center",
                      textStyle: { fontSize: 14, fontWeight: 700, color: "#333" } }
                ],
                series: [
                    { type: "pie", radius: ["30%", "50%"], center: ["16%", "40%"],
                      label: pieLabelOpt, emphasis: pieEmphasis, itemStyle: pieStyle, data: genData },
                    { type: "pie", radius: ["30%", "50%"], center: ["50%", "40%"],
                      label: pieLabelOpt,
                      emphasis: pieEmphasis, itemStyle: pieStyle, data: trackedData },
                    { type: "pie", radius: ["30%", "50%"], center: ["83%", "40%"],
                      label: pieLabelOpt, emphasis: pieEmphasis, itemStyle: pieStyle, data: resData }
                ]
            });
        }

        // ---- Electricity mix bar chart ----
        function renderBarChart(rows) {
            if (barChart) { barChart.dispose(); barChart = null; }
            const container = body.querySelector("#kpi-bar-chart");
            if (!container) return;
            barChart = echarts.init(container);

            const sources = rows.map(r => r.energy_source || "Unknown");

            const seriesDefs = [
                { name: "Issuance I-REC(E)",   color: "#76D6A1", values: rows.map(r => parseNum(r.issuance_irec) || 0) },
                { name: "Issuance Europe-GOs",  color: "#F3DC9C", values: rows.map(r => parseNum(r.issuance_ext) || 0) },
                { name: "Issuance (other)",     color: "#B1BBF9", values: rows.map(r => {
                    const cert = parseNum(r.certified_mix) || 0;
                    const ext  = parseNum(r.issuance_ext) || 0;
                    const irec = parseNum(r.issuance_irec) || 0;
                    return Math.max(0, cert - ext - irec);
                }) },
                { name: "Not Issued",           color: "#F2B08A", values: rows.map(r => parseNum(r.residual_mix) || 0) },
                { name: "Import",               color: "#83D5F4", values: rows.map(r => parseNum(r.import) || 0) },
                { name: "Export",               color: "#E7E58F", values: rows.map(r => -(parseNum(r.export) || 0)) },
                { name: "Expired",              color: "#D6C7FF", values: rows.map(r => parseNum(r.expired) || 0) }
            ];

            const activeSeries = seriesDefs.filter(s => s.values.some(v => v !== 0));

            barChart.setOption({
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
                    valueFormatter: v => formatNum(v, 2) + " MWh" },
                legend: { bottom: 0, textStyle: { fontSize: 12 },
                    data: activeSeries.map(s => s.name) },
                grid: { left: 10, right: 20, top: 10, bottom: 40, containLabel: true },
                xAxis: { type: "value", axisLabel: { fontSize: 11 } },
                yAxis: { type: "category", data: sources, axisLabel: { fontSize: 11 } },
                series: activeSeries.map(s => ({
                    name: s.name, type: "bar", stack: "total", data: s.values,
                    itemStyle: { color: s.color }, barMaxWidth: 28
                }))
            });
        }
    }

    // First render
    renderForYear(currentYear);

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

        const hasDataForFilters = !!feature.properties?.hasDataForFilters;

        // ✅ If filtered out, show "no data" and do NOT render KPI popup
        if (!hasDataForFilters) {
            popup
            .setLngLat(e.lngLat)
            .setHTML(
                `<div style="font-family:Arial,sans-serif;font-size:12px;padding:10px;min-width:220px;">
                <div style="font-weight:700;margin-bottom:6px;">${countryFlag(code)}${feature.properties?.display_name || code}</div>
                <div style="color:#666;font-size:11px;">No data for current filters</div>
                </div>`
            )
            .addTo(mapInstance);
            return;
        }

        // ✅ Only now compute KPIs/details
        const k = getKpis(code);
        const kpiVal = getKpiValue(code);
        const kpiColor = colorForValue(kpiVal);

        popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(k, kpiColor, code)).addTo(mapInstance);
    });

    mapInstance.on("click", layerId, (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;

    const hasDataForFilters = !!feature.properties?.hasDataForFilters;
    if (!hasDataForFilters) return; // ✅ don't open modal for filtered-out countries

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
