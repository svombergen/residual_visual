// main.js
// Globals from index.html / data.js:
// - window.DATA
// - window.maplibregl

// Shared application state (map-only)
window.state = {
  filters: {
    years: [],   // multi-select; map uses only the latest
    regions: [],
    country: []
  }
};

// Globals for MultiSelect filter widgets
window.filterControls = {
  year: null,
  region: null,
  country: null
};

// -------------------------
// DYNAMIC FILTER OPTIONS
// -------------------------

let suppressFilterChange = false;
// schedule render once per tick (collapses 60+ changes into 1)
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    extractFilters();
    render();
    updateRowsCountLabel();
    updateMapDataSourceFooter();
  });
}

function buildFiltersFromData() {
  const yearEl = document.getElementById("filter-year");
  const countryEl = document.getElementById("filter-country");

  if (!window.DATA || !Array.isArray(window.DATA)) return;

  const yearSet = new Set();
  const countryMap = new Map(); // code -> name

  for (const row of window.DATA) {
    if (row.year != null) yearSet.add(row.year);
    if (row.country_code && row.country) {
      const code = String(row.country_code).toUpperCase();
      if (!countryMap.has(code)) countryMap.set(code, row.country);
    }
  }

  // Years (multi-select)
  if (yearEl && yearEl.tagName === "SELECT") {
    yearEl.innerHTML = "";
    Array.from(yearSet)
      .sort((a, b) => b - a)
      .forEach((year) => {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        yearEl.appendChild(opt);
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
    if (suppressFilterChange) return;
    scheduleRender();
  };

  // ... keep others, but point onChange to onAnyFilterChange

  const yearSelect = document.getElementById("filter-year");
  if (yearSelect) {
    window.filterControls.year = new MultiSelect(yearSelect, {
      listAll: false,
      search: false,
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
      listAll: false,
      search: true,
      selectAll: true,
      // normal changes
      onChange: () => onAnyFilterChange(),

      // bulk operations: suppress until the library finishes toggling options
      onSelectAll: () => {
        suppressFilterChange = true;
        // allow internal loop to complete; then do ONE update
        setTimeout(() => {
          suppressFilterChange = false;
          scheduleRender();
        }, 0);
      },

      onUnselectAll: () => {
        suppressFilterChange = true;
        setTimeout(() => {
          suppressFilterChange = false;
          scheduleRender();
        }, 0);
      }
    });
  }
}

// -------------------------
// FILTER HANDLING
// -------------------------
function extractFilters() {
  const fc = window.filterControls;

  // Multi-year: collect all selected years
  state.filters.years = fc.year
    ? fc.year.selectedValues.map(String)
    : [];

  // Multi: regions
  state.filters.regions = fc.region ? fc.region.selectedValues.slice() : [];

  // Countries (multi-select)
  state.filters.countries = fc.country ? fc.country.selectedValues.slice() : [];

  // If all countries selected, treat it as "no filter"
  if (window.filterControls.country) {
    const total = window.filterControls.country.options?.length;
    if (total && state.filters.countries.length === total) {
      state.filters.countries = [];
    }
  }
}

// -------------------------
// FILTERED DATA (shared)
// -------------------------
window.getFilteredData = function getFilteredData() {
  const f = state.filters;

  // No years selected → nothing to show on the map
  if (!f.years || !f.years.length) return [];

  // Map shows only the latest selected year (no aggregation across years)
  const mapYear = String(Math.max(...f.years.map(Number)));

  return window.DATA.filter((row) => {
    if (row.year.toString() !== mapYear) return false;
    if (f.countries.length && !f.countries.includes(String(row.country_code).toUpperCase())) {
      return false;
    }

    // regions currently unused
    return true;
  });
};

// -------------------------
// Download functions
// -------------------------
function normalizeCode(v) {
  return String(v || "").toUpperCase().trim();
}

function parseNumLoose(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/\./g, "").replace(",", "."); // handles "1.234,56" and "12,34"
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getSelectedFilters() {
  const f = window.state?.filters || {};
  return {
    years: Array.isArray(f.years) ? f.years.map(Number).filter(Number.isFinite) : [],
    countries: Array.isArray(f.countries) ? f.countries.map(normalizeCode)
             : (f.country ? [normalizeCode(f.country)] : []),
    regions: Array.isArray(f.regions) ? f.regions.map(String) : []
  };
}

// Apply current filters to detail rows
function getFilteredDetailRows() {
  const { years, countries, regions } = getSelectedFilters();
  const rows = window.DATA_DETAIL || [];

  return rows.filter((r) => {
    // years: no selection = no rows; otherwise row must be in the selected set
    if (!years.length || !years.includes(Number(r.year))) return false;

    // country_code (multi)
    if (countries.length) {
      const code = normalizeCode(r.country_code);
      if (!countries.includes(code)) return false;
    }

    // region (only if you actually have r.region in detail rows)
    if (regions.length && r.region != null && r.region !== "") {
      if (!regions.includes(String(r.region))) return false;
    }

    return true;
  });
}

// Optional: turn number-like strings into real numbers in Excel columns
const EXCEL_NUMBER_COLUMNS = new Set([
  "certified_mix",
  "issuance_ext",
  "issuance_irec",
  "residual_mix",
  "total_generation",
  "total_co2",
  "emission_factor",
  "perc_tracked_total",
  "perc_tracked_renewables",
  "perc_green"
]);

function toExcelRow(r) {
  const out = { ...r };
  for (const k of Object.keys(out)) {
    if (EXCEL_NUMBER_COLUMNS.has(k)) {
      const n = parseNumLoose(out[k]);
      if (n != null) out[k] = n; // keep blanks as blank
    }
  }
  return out;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFilteredDetailsToXlsx() {
  if (!window.XLSX) {
    alert("XLSX library not loaded. Add the SheetJS script tag.");
    return;
  }

  const filtered = getFilteredDetailRows().map(toExcelRow);

  // Workbook
  const wb = XLSX.utils.book_new();

  // Details sheet
  const wsDetails = XLSX.utils.json_to_sheet(filtered);
  XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

  // Optional: Aggregated sheet that matches current filters too (years + countries)
  const { years, countries } = getSelectedFilters();
  const agg = (window.DATA || []).filter((r) => {
    if (years.length && !years.includes(Number(r.year))) return false;
    if (countries.length && !countries.includes(normalizeCode(r.country_code))) return false;
    return true;
  });
  if (agg.length) {
    const wsAgg = XLSX.utils.json_to_sheet(agg.map(toExcelRow));
    XLSX.utils.book_append_sheet(wb, wsAgg, "Aggregated");
  }

  const yyyy = new Date().toISOString().slice(0, 10);
  const yearsLabel = years.length ? `_year-${years.slice().sort().join(",")}` : "";
  const filename = `export_${yyyy}${yearsLabel}.xlsx`;

  const arrayBuf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  downloadBlob(blob, filename);
}

function updateRowsCountLabel() {
  const el = document.getElementById("rows-count-label");
  if (!el) return;

  const n = getFilteredDetailRows().length;
  el.textContent = `${n} rows`;
}

function updateMapDataSourceFooter() {
  const el = document.getElementById("map-data-source-footer");
  if (!el) return;
  const details = window.DATA_DETAIL;
  if (!details || !details.length) { el.innerHTML = ""; return; }
  const sources = [...new Set(details.map(r => (r.first_source || "").trim()).filter(Boolean))];
  if (!sources.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<details style="cursor:pointer;"><summary style="font-weight:600;color:#666;">Data Sources</summary><div style="margin-top:4px;">${sources.join(", ")}</div></details>`;
}

// -------------------------
// Export lead modal
// -------------------------
function submitLeadToCrm(data) {
  // TODO: wire up to CRM
  console.log("CRM lead:", data);
}

function openExportModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "kpi-modal-backdrop";
  backdrop.innerHTML = `
    <div class="kpi-modal export-modal" role="dialog" aria-modal="true">
      <div class="kpi-modal-header">
        <div class="kpi-modal-title">Download data</div>
        <button class="kpi-modal-close" type="button">Close</button>
      </div>
      <div class="kpi-modal-body">
        <p class="export-modal-intro">Please provide your details before downloading.</p>
        <form id="export-lead-form" novalidate>
          <div class="export-form-field">
            <label for="export-name">Full name <span class="export-required">*</span></label>
            <input type="text" id="export-name" required placeholder="Jane Smith" />
          </div>
          <div class="export-form-field">
            <label for="export-email">Email address <span class="export-required">*</span></label>
            <input type="email" id="export-email" required placeholder="jane@example.com" />
          </div>
          <div class="export-form-field">
            <label for="export-org">Organization <span class="export-required">*</span></label>
            <input type="text" id="export-org" required placeholder="Acme Corp" />
          </div>
          <div class="export-form-check">
            <input type="checkbox" id="export-consent" required />
            <label for="export-consent">
              I acknowledge that my information will be processed in accordance with the organization's CRM and privacy policy. <span class="export-required">*</span>
            </label>
          </div>
          <div class="export-form-actions">
            <button type="submit" class="export-btn-submit">Send &amp; Download</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const modal = backdrop.querySelector(".kpi-modal");

  const close = () => {
    backdrop.classList.remove("open");
    modal.classList.remove("open");
    setTimeout(() => backdrop.remove(), 170);
  };

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector(".kpi-modal-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && backdrop.isConnected) close(); }, { once: true });

  backdrop.querySelector("#export-lead-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name    = backdrop.querySelector("#export-name").value.trim();
    const email   = backdrop.querySelector("#export-email").value.trim();
    const org     = backdrop.querySelector("#export-org").value.trim();
    const consent = backdrop.querySelector("#export-consent").checked;

    if (!name || !email || !org || !consent) return;

    submitLeadToCrm({ name, email, org });
    close();
    exportFilteredDetailsToXlsx();
  });

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    modal.classList.add("open");
  });
}


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

  const btn = document.getElementById("button_export");
  if (btn) btn.onclick = openExportModal;
});
