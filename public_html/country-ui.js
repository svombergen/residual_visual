// country-ui.js
// Provides: window.CountryUI.attach(mapInstance, layerId)
//          window.CountryUI.getColorKpiConfig(), setColorKpi(config)
//          window.CountryUI.getKpiValue(countryCode), colorForValue(value)

(function () {
  // -----------------------------
  // Configurable KPI for coloring
  // -----------------------------
  // Must match RESIDUAL_CO2_MAX in view-map.js
  const RESIDUAL_CO2_MAX = 800;

  let COLOR_KPI = {
    key: "perc_tracked_total",
    // thresholds in %, inclusive ranges; we use interpolation between stops
    stops: [
      { v: 0,   c: "#9bc9fd" },
      { v: 33,  c: "#69aefc" },
      { v: 66,  c: "#0579fa" },
      { v: 100, c: "#034896" }
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
  const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(String(val).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const formatNum = (val, decimals = 2) => {
    const n = parseNum(val);
    if (n === null || !Number.isFinite(n)) return "n/a";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  };

  const HIDDEN_DETAIL_COLUMNS = new Set([
    "country",
    "country_code",
    "year",
    "methodology",
    "sources",
    "emission_factor",
    "class",
    "issuance",
    "total_co2"
  ]);

  // Desired table column order (left to right); columns with all-zero values are hidden
  const TABLE_COLUMN_ORDER = [
    "energy_source",
    "total_generation",
    "certified_mix",
    "issuance_irec_e",
    "issuance_itrack",
    "issuance_go",
    "issuance_lgc",
    "issuance_tigrs",
    "issuance_ecogox",
    "issuance_other",
    "import_physical",
    "export_physical",
    "import_certificates",
    "export_certificates",
    "untracked",
    "residual_mix"   // always last
  ];

  const ISSUANCE_SPECIFIC_COLS = [
    "issuance_irec_e", "issuance_itrack", "issuance_go",
    "issuance_lgc", "issuance_tigrs", "issuance_ecogox", "issuance_other"
  ];

  const PRETTY_COLUMN_NAMES = {
    energy_source: "Energy Source",
    certified_mix: "Issuance (all EACs)",
    issuance_irec_e: "Issuance (I-REC(E))",
    issuance_itrack: "Issuance (I-TRACK)",
    issuance_go: "Issuance (GO)",
    issuance_lgc: "Issuance (LGC)",
    issuance_tigrs: "Issuance (TIGRS)",
    issuance_ecogox: "Issuance (Ecogox)",
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
    certified_mix: "TWh",
    issuance_irec_e: "TWh",
    issuance_itrack: "TWh",
    issuance_go: "TWh",
    issuance_lgc: "TWh",
    issuance_tigrs: "TWh",
    issuance_ecogox: "TWh",
    issuance_other: "TWh",
    residual_mix: "TWh",
    total_generation: "TWh",
    total_co2: "kg CO₂",
    import_physical: "TWh",
    export_physical: "TWh",
    import_certificates: "TWh",
    export_certificates: "TWh",
    untracked: "TWh",
    gen_mix_ef: "tCO₂/MWh",
    residual_mix_ef: "tCO₂/MWh"
  };

  const numericCols = new Set([
    "certified_mix",
    "issuance_irec_e",
    "issuance_itrack",
    "issuance_go",
    "issuance_lgc",
    "issuance_tigrs",
    "issuance_ecogox",
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
    const rmCo2 = parseNum(agg?.residualmix_gco2kwh);
    if (rmCo2 != null) return rmCo2 / 1000; // gCO2/kWh → tCO2/MWh

    // Fallback: derive from total CO2 and untracked generation
    const totalCo2 = parseNum(agg?.total_co2);
    const totalGen = parseNum(agg?.total_generation);
    const totalCert = parseNum(agg?.total_certified);
    if (totalCo2 == null || totalGen == null || totalCert == null) return null;
    const residualGen = totalGen - totalCert;
    if (residualGen <= 0) return null;
    return totalCo2 / residualGen / 1000;
  }

  function computeGenerationEf(agg) {
    const genGco2 = parseNum(agg?.generation_gco2kwh);
    if (genGco2 != null) return genGco2 / 1000; // gCO2/kWh → tCO2/MWh

    // Fallback: total CO2 / total generation
    const totalCo2 = parseNum(agg?.total_co2);
    const totalGen = parseNum(agg?.total_generation);
    if (totalCo2 == null || totalGen == null || totalGen <= 0) return null;
    return totalCo2 / totalGen / 1000;
  }

  function getKpis(code) {
    const { agg, year } = getAggRow(code);
    return {
        year,
        country: agg?.country || code,
        perc_tracked_total: agg?.perc_tracked_total ?? null,
        perc_tracked_renewables: agg?.perc_tracked_renewables ?? null,
        generation_ef: computeGenerationEf(agg),
        residual_ef: computeResidualEf(agg),
    };
  }

  function residualGco2kwh(agg) {
    const rmCo2 = parseNum(agg?.residualmix_gco2kwh);
    if (rmCo2 != null) return rmCo2;
    const tc  = parseNum(agg?.total_co2);
    const tg  = parseNum(agg?.total_generation);
    const tce = parseNum(agg?.total_certified);
    const rg  = (tg != null && tce != null) ? tg - tce : null;
    return (tc != null && rg != null && rg > 0) ? tc / rg : null; // ktCO2/TWh = gCO2/kWh
  }

  function getKpiValue(code) {
    const { agg } = getAggRow(code);
    if (COLOR_KPI.key === "perc_residual") {
      const gco2 = residualGco2kwh(agg);
      return gco2 != null ? Math.min(100, (gco2 / RESIDUAL_CO2_MAX) * 100) : null;
    }
    const v = agg?.[COLOR_KPI.key];
    const n = parseNum(v);
    return n == null ? null : n;
  }

  // -----------------------------
  // Hover popup (2 KPI cards)
  // -----------------------------
  function buildPopupHtml(k, kpiColor, code, isPartialData) {
    const colorKey = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";

    const fmtPct = (v) => { const s = formatNum(v != null ? Math.min(100, v) : v, 2); return s === "n/a" ? s : s + "%"; };
    const pctTrackedElec = fmtPct(k.perc_tracked_total);
    const pctRenew       = fmtPct(k.perc_tracked_renewables);
    const generationEf   = formatNum(k.generation_ef, 4);
    const residualEf     = formatNum(k.residual_ef, 4);

    const dot = (key) =>
        key === colorKey
        ? `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${kpiColor};margin-right:6px;vertical-align:middle;"></span>`
        : "";

    return `
        <div style="font-family:'IBM Plex Sans',Arial,sans-serif; font-size:12px; padding:10px; min-width:400px; color:#034EA2;">
        <div style="font-weight:700; margin-bottom:6px; color:#011832;">
            ${countryFlag(code)}${k.country}${k.year ? ` (${k.year})` : ""}
        </div>

        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
            <div style="border:1px solid #CDE4FE; border-radius:10px; padding:8px; background:#f8faff;">
            <div style="font-size:11px; color:#034EA2; margin-bottom:4px;">Tracked Generation</div>
            <div style="font-size:15px; font-weight:800; color:#011832;">
                ${dot("perc_tracked_total")}${pctTrackedElec}
            </div>
            </div>

            <div style="border:1px solid #CDE4FE; border-radius:10px; padding:8px; background:#f8faff;">
            <div style="font-size:11px; color:#034EA2; margin-bottom:4px;">Tracked Renewables</div>
            <div style="font-size:15px; font-weight:800; color:#011832;">
                ${dot("perc_tracked_renewables")}${pctRenew}
            </div>
            </div>

            <div style="border:1px solid #CDE4FE; border-radius:10px; padding:8px; background:#f8faff;">
            <div style="font-size:11px; color:#034EA2; margin-bottom:4px;">Generation Mix</div>
            <div style="font-size:15px; font-weight:800; color:#011832;">
                ${generationEf}${generationEf !== "n/a" ? ' <span style="font-size:10px;font-weight:400;color:#034EA2;">tCO₂/MWh</span>' : ""}
            </div>
            </div>

            <div style="border:1px solid #CDE4FE; border-radius:10px; padding:8px; background:#f8faff;">
            <div style="font-size:11px; color:#034EA2; margin-bottom:4px;">Residual Mix</div>
            <div style="font-size:15px; font-weight:800; color:#011832;">
                ${dot("perc_residual")}${residualEf}${residualEf !== "n/a" ? ' <span style="font-size:10px;font-weight:400;color:#034EA2;">tCO₂/MWh</span>' : ""}
            </div>
            </div>
        </div>

        ${isPartialData ? '<div style="margin-top:6px;padding:4px 8px;background:#f3e8fa;border-radius:6px;color:#5E2390;font-size:11px;font-weight:600;">Some data is missing in our dataset</div>' : ''}
        <div style="margin-top:8px; color:#3793FB; font-size:11px;">
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
            <span id="kpi-modal-method" style="font-size:11px;color:#034EA2;"></span>
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
            <span style="font-weight:700;color:#011832;">${year ?? "-"}</span>
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

    // Shared source order: renewables A-Z, Other (R), fossils A-Z, Other (F)
    const SOURCE_ORDER = [
        "Bio", "Hydro", "Solar", "Wind", "Other (R)",
        "Coal", "Gas", "Nuclear", "Oil", "Other (F)"
    ];
    const sortBySrcOrder = (entries) =>
        entries.sort(([a], [b]) => {
            const ai = SOURCE_ORDER.indexOf(a);
            const bi = SOURCE_ORDER.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

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
        generation_ef: computeGenerationEf(aggRow),
        residual_ef: computeResidualEf(aggRow),
        };

        // Details for this year
        const details = (window.DATA_DETAIL || []).filter(
        r =>
            String(r.country_code || "").toUpperCase() === code &&
            Number(r.year) === Number(year)
        );

        // Enrich detail rows with computed columns
        const enrichedDetails = details.map(r => {
            const cert  = parseNum(r.certified_mix) || 0;
            const irec  = parseNum(r.issuance_irec) || 0;
            const gen   = parseNum(r.total_generation) || 0;
            const co2   = parseNum(r.total_co2) || 0;
            const resid = parseNum(r.residual_mix) || 0;
            const go    = parseNum(r.issuance_go) || 0;
            const lgc   = parseNum(r.issuance_lgc) || 0;
            const tigrs = parseNum(r.issuance_tigrs) || 0;
            const eco   = parseNum(r.issuance_ecogox) || 0;
            // Split I-REC issuance into renewable (I-REC(E)) and nuclear/fossil (I-TRACK)
            const isITrack = r.issuance === "I-TRACK(E)";
            return {
                ...r,
                issuance_irec_e: isITrack ? 0 : irec,
                issuance_itrack: isITrack ? irec : 0,
                issuance_other: Math.max(0, Math.round((cert - irec - go - lgc - tigrs - eco) * 1e9) / 1e9),
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
        const activeIssuanceCols = ISSUANCE_SPECIFIC_COLS.filter(c =>
            enrichedDetails.some(r => (typeof r[c] === "number" ? r[c] : parseNum(r[c]) || 0) !== 0)
        );
        const cols = TABLE_COLUMN_ORDER.filter(c => {
            if (c === "energy_source") return true; // always show
            if (c === "residual_mix") return true;  // always last
            if (c === "certified_mix") return activeIssuanceCols.length > 1; // only if multiple issuance types
            return enrichedDetails.some(r => {
                const v = numericCols.has(c) ? (typeof r[c] === "number" ? r[c] : parseNum(r[c]) || 0) : r[c];
                return v !== 0 && v !== "" && v != null;
            });
        });

        // Color dot should reflect *current* map-color KPI key, but KPIs stay in fixed positions
        const kpiVal = (() => {
        const key = window.CountryUI?.getColorKpiConfig?.().key || "perc_tracked_total";
        if (key === "perc_residual") {
            const gco2 = residualGco2kwh(aggRow);
            return gco2 != null ? Math.min(100, (gco2 / RESIDUAL_CO2_MAX) * 100) : null;
        }
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

        const DISCLAIMER = "Generation data may be lower than issuance data due to the inclusion of behind-the-meter issuance, which is not reflected in generation totals.";
        const infoIcon = (show) => !show ? "" : `<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#034EA2;color:#fff;font-size:9px;font-weight:700;line-height:1;font-family:sans-serif;font-style:normal;vertical-align:middle;margin-left:3px;cursor:help;" onmouseenter="this.querySelector('.disc-tip').style.visibility='visible'" onmouseleave="this.querySelector('.disc-tip').style.visibility='hidden'">i<span class="disc-tip" style="visibility:hidden;position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#011832;color:#fff;padding:8px 10px;border-radius:6px;font-size:11px;font-weight:400;line-height:1.5;width:240px;z-index:9999;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.25);white-space:normal;">${DISCLAIMER}</span></span>`;

        const fmtPct = (v) => { const s = formatNum(v != null ? Math.min(100, v) : v, 2); return s === "n/a" ? s : s + "%"; };
        const pctTrackedElec = fmtPct(k.perc_tracked_total);
        const pctRenew = fmtPct(k.perc_tracked_renewables);
        const generationEf = formatNum(k.generation_ef, 4);
        const residualEf = formatNum(k.residual_ef, 4);

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
        const dataSources = [...new Set(details.flatMap(r => (r.sources || "").split(",").map(s => s.trim())).filter(Boolean))];

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
        } else {
            rows.sort((a, b) => {
            const ai = SOURCE_ORDER.indexOf(a.energy_source);
            const bi = SOURCE_ORDER.indexOf(b.energy_source);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            });
        }

        const thead = `
            <thead>
            <tr>
                ${cols
                .map((c) => {
                    const unit = UNITS[c]
                    ? ` <span style="font-weight:400;color:#3793FB;">(${UNITS[c]})</span>`
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
                    const fmt = n == null ? "" : formatNum(n, dec);
                    return `<td>${fmt === "n/a" ? "" : fmt}</td>`;
                }
                return `<td>${v === "" || v == null ? "" : String(v)}</td>`;
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

        // Partial data detection (I-REC issuance but missing/incomplete generation data)
        const isPartialData = (() => {
            const tc = parseNum(aggRow?.total_certified);
            const meth = (aggRow?.methodology || "").trim();
            const pt = parseNum(aggRow?.perc_tracked_total);
            return tc != null && tc > 0 && meth === "I-REC" && (pt == null || pt > 100);
        })();

        // Fixed KPI order: tracked electricity, tracked renewables, residual mix
        body.innerHTML = `
        ${isPartialData ? '<div style="margin-bottom:12px;padding:8px 12px;background:#f3e8fa;border-radius:8px;color:#5E2390;font-size:12px;font-weight:600;border:1px solid #d4b8e8;">Some data is missing in our dataset</div>' : ''}
        <div class="kpi-grid" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
            <div class="kpi-card">
            <div class="kpi-label">Tracked Generation${infoIcon(parseNum(aggRow?.perc_tracked_total) > 100)}</div>
            <div class="kpi-value">${dot("perc_tracked_total")}${pctTrackedElec}</div>
            </div>

            <div class="kpi-card">
            <div class="kpi-label">Tracked Renewables${infoIcon(parseNum(aggRow?.perc_tracked_renewables) > 100)}</div>
            <div class="kpi-value">${dot("perc_tracked_renewables")}${pctRenew}</div>
            </div>

            <div class="kpi-card">
            <div class="kpi-label">Generation Mix</div>
            <div class="kpi-value">${generationEf}${generationEf !== "n/a" ? ' <span style="font-size:11px;font-weight:400;color:#034EA2;">tCO₂/MWh</span>' : ""}</div>
            </div>

            <div class="kpi-card">
            <div class="kpi-label">Residual Mix</div>
            <div class="kpi-value">${dot("perc_residual")}${residualEf}${residualEf !== "n/a" ? ' <span style="font-size:11px;font-weight:400;color:#034EA2;">tCO₂/MWh</span>' : ""}</div>
            </div>
        </div>

        <div class="kpi-segments" id="kpi-segments">
            <button class="kpi-seg-btn${activeTab === "bar" ? " active" : ""}" data-tab="bar">Generation mix</button>
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

        <div id="kpi-data-source-footer" style="margin-top:12px;padding-top:10px;border-top:1px solid #CDE4FE;font-size:11px;color:#034EA2;">
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
                "Bio":"#93AA7B","Coal":"#D9D9D9","Gas":"#FFC285","Hydro":"#69aefc",
                "Nuclear":"#5E2390","Oil":"#795548","Solar":"#FFE085","Wind":"#CDE4FE",
                "Other (R)":"#76D6A1","Other (F)":"#BDBDBD"
            };
            const fallbackColor = "#CDCED0";

            // Left pie: Generation Mix (by energy source, using total_generation)
            const genBySource = {};
            for (const r of rows) {
                const src = r.energy_source || "Other";
                genBySource[src] = (genBySource[src] || 0) + (parseNum(r.total_generation) || 0);
            }
            const genData = sortBySrcOrder(Object.entries(genBySource).filter(([,v]) => v > 0))
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
            const resData = sortBySrcOrder(Object.entries(resBySource).filter(([,v]) => v > 0))
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

            // Emission factor for the center label — prefer authoritative AIB agg values,
            // fall back to detail-derived calculation when agg values are unavailable.
            const genGco2 = parseNum(aggRow?.generation_gco2kwh);
            const genEf = genGco2 != null ? genGco2 / 1000
                        : totalGen > 0 ? (rows.reduce((s, r) => s + (parseNum(r.total_co2) || 0), 0) / totalGen / 1000)
                        : null;
            const residualGen = totalGen - totalCert;
            const resEf = computeResidualEf(aggRow) ??
                          (residualGen > 0 ? (rows.reduce((s, r) => s + (parseNum(r.total_co2) || 0), 0) / residualGen / 1000) : null);

            const pieLabelOpt = { show: false };
            const pieEmphasis = { label: { show: true, fontSize: 12, fontWeight: "bold", formatter: "{b}\n{d}%", overflow: "break" } };
            const pieStyle = { borderRadius: 4, borderColor: "#fff", borderWidth: 2 };

            donutChart.setOption({
                tooltip: { show: false },
                legend: { bottom: 0, textStyle: { fontSize: 11 } },
                title: [
                    { text: "Generation Mix", left: "16%", top: 0, textAlign: "center", textStyle: { fontSize: 13, fontWeight: 700, color: "#011832" } },
                    { text: "Tracked Generation", left: "50%", top: 0, textAlign: "center", textStyle: { fontSize: 13, fontWeight: 700, color: "#011832" } },
                    { text: "Residual Mix", left: "83%", top: 0, textAlign: "center", textStyle: { fontSize: 13, fontWeight: 700, color: "#011832" } },
                    // Values below pies
                    { text: genEf != null ? `${formatNum(genEf, 4)} tCO₂/MWh` : "", left: "16%", top: "70%", textAlign: "center",
                      textStyle: { fontSize: 14, fontWeight: 700, color: "#034EA2" } },
                    { text: `${trackedPct}%`, left: "50%", top: "70%", textAlign: "center",
                      textStyle: { fontSize: 14, fontWeight: 700, color: "#034EA2" } },
                    { text: resEf != null ? `${formatNum(resEf, 4)} tCO₂/MWh` : "", left: "83%", top: "70%", textAlign: "center",
                      textStyle: { fontSize: 14, fontWeight: 700, color: "#034EA2" } }
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

        // ---- Generation mix bar chart ----
        function renderBarChart(rows) {
            if (barChart) { barChart.dispose(); barChart = null; }
            const container = body.querySelector("#kpi-bar-chart");
            if (!container) return;
            barChart = echarts.init(container);

            // Build lookup: energy_source → enriched row
            const rowBySource = {};
            for (const r of rows) rowBySource[r.energy_source || "Unknown"] = r;

            // Get numeric field for a fixed-order source (0 if source absent)
            const val = (src, field) => parseNum(rowBySource[src]?.[field]) || 0;

            // ECharts renders category axis bottom-to-top, so reverse for top-to-bottom display
            const BAR_ORDER = [...SOURCE_ORDER].reverse();

            const seriesDefs = [
                { name: "Issuance I-REC(E)", color: "#93aa7b", values: BAR_ORDER.map(s => val(s, "issuance_irec_e")) },
                { name: "Issuance I-TRACK",  color: "#9B59B6", values: BAR_ORDER.map(s => val(s, "issuance_itrack")) },
                { name: "Issuance GO",        color: "#ffe085", values: BAR_ORDER.map(s => val(s, "issuance_go")) },
                { name: "Issuance LGC",       color: "#f0d060", values: BAR_ORDER.map(s => val(s, "issuance_lgc")) },
                { name: "Issuance TIGRS",     color: "#fad48a", values: BAR_ORDER.map(s => val(s, "issuance_tigrs")) },
                { name: "Issuance Ecogox",    color: "#e8c46a", values: BAR_ORDER.map(s => val(s, "issuance_ecogox")) },
                { name: "Not Issued",         color: "#F2B08A", values: BAR_ORDER.map(s => Math.max(0, val(s, "total_generation") - val(s, "certified_mix"))) },
                { name: "Import",             color: "#83D5F4", values: BAR_ORDER.map(s => val(s, "import_physical")) },
                { name: "Export",             color: "#E7E58F", values: BAR_ORDER.map(s => -(val(s, "export_physical"))) },
            ];

            // Show only series with at least one non-zero value
            const activeSeries = seriesDefs.filter(s => s.values.some(v => v !== 0));

            barChart.setOption({
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
                    valueFormatter: w => formatNum(w, 2) + " TWh" },
                legend: { bottom: 0, textStyle: { fontSize: 12 },
                    data: activeSeries.map(s => s.name) },
                grid: { left: 10, right: 20, top: 10, bottom: 40, containLabel: true },
                xAxis: { type: "value", axisLabel: { fontSize: 11 } },
                yAxis: { type: "category", data: BAR_ORDER, axisLabel: { fontSize: 11 } },
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
  let hoveredId = null;

  function setHover(mapInstance, id) {
    if (hoveredId != null) {
      mapInstance.setFeatureState({ source: "countries", id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    if (id != null) {
      mapInstance.setFeatureState({ source: "countries", id: id }, { hover: true });
    }
  }

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
      setHover(mapInstance, null);
    });

    mapInstance.on("mousemove", layerId, (e) => {
        const feature = e.features && e.features[0];
        if (!feature) return;

        const code = (feature.properties && feature.properties.id || "")
            .toString()
            .toUpperCase();

        // Highlight hovered country
        if (layerId === "country-fill") setHover(mapInstance, code);

        const hasDataForFilters = !!feature.properties?.hasDataForFilters;
        const hasIssuance = !!feature.properties?.hasIssuance;

        const hasIsPartialData = !!feature.properties?.isPartialData;

        // Grey or missing: show simple popup without KPIs
        if (!hasDataForFilters || !hasIssuance) {
            const msg = hasDataForFilters ? "No issuance data available" : "No data for current filters";
            popup
            .setLngLat(e.lngLat)
            .setHTML(
                `<div style="font-family:Arial,sans-serif;font-size:12px;padding:10px;min-width:220px;">
                <div style="font-weight:700;margin-bottom:6px;">${countryFlag(code)}${feature.properties?.display_name || code}</div>
                <div style="color:#666;font-size:11px;">${msg}</div>
                </div>`
            )
            .addTo(mapInstance);
            return;
        }

        // Purple: partial data — show warning popup with click prompt
        if (hasIsPartialData) {
            popup
            .setLngLat(e.lngLat)
            .setHTML(
                `<div style="font-family:Arial,sans-serif;font-size:12px;padding:10px;min-width:220px;">
                <div style="font-weight:700;margin-bottom:6px;">${countryFlag(code)}${feature.properties?.display_name || code}</div>
                <div style="color:#5E2390;font-size:11px;font-weight:600;">Some data is missing in our dataset</div>
                <div style="margin-top:8px;color:#3793FB;font-size:11px;">Click for details</div>
                </div>`
            )
            .addTo(mapInstance);
            return;
        }
        const k = getKpis(code);
        const kpiVal = getKpiValue(code);
        const kpiColor = colorForValue(kpiVal);

        popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(k, kpiColor, code, false)).addTo(mapInstance);
    });

    mapInstance.on("click", layerId, (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;

    const hasDataForFilters = !!feature.properties?.hasDataForFilters;
    const hasIssuance = !!feature.properties?.hasIssuance;
    if (!hasDataForFilters || !hasIssuance) return; // don't open modal for missing/no-issuance countries

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
