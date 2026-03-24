// data_aib.js
// Loads 01_aggregated.csv into window.DATA and 01_detail.csv into window.DATA_DETAIL.
// Replaces the original data.js and data_detail.js.

(function () {
  function splitCSVLine(line) {
    var fields = [];
    var cur = "";
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') { inQuotes = false; } else { cur += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { fields.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  function parseCSV(text) {
    var lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    var headers = splitCSVLine(lines[0]);
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var vals = splitCSVLine(lines[i]);
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = vals[j] != null ? vals[j] : "";
      }
      rows.push(obj);
    }
    return rows;
  }

  function coerceNumeric(row, fields) {
    for (var k = 0; k < fields.length; k++) {
      var key = fields[k];
      if (row[key] === "" || row[key] == null) continue;
      var n = Number(row[key]);
      if (Number.isFinite(n)) row[key] = n;
    }
    return row;
  }

  var AGG_NUMERIC = [
    "year", "total_generation", "total_co2", "total_certified",
    "perc_tracked_total", "perc_residual", "perc_tracked_renewables",
    "perc_green", "residualmix_gco2kwh"
  ];

  var DETAIL_NUMERIC = [
    "year",
    "issuance_irec", "issuance_tigrs", "issuance_ecogox", "issuance_lgc",
    "issuance_go", "issuance_go_expire", "issuance_go_cancel",
    "issuance_ext", "issuance_total", "certified_mix",
    "total_generation", "residual_mix", "total_co2", "emission_factor"
  ];

  // Load aggregated -> window.DATA, then init the app
  fetch("data/01_aggregated.csv")
    .then(function (res) { return res.text(); })
    .then(function (text) {
      var rows = parseCSV(text);
      for (var i = 0; i < rows.length; i++) coerceNumeric(rows[i], AGG_NUMERIC);
      window.DATA = rows;
      if (typeof window.initApp === "function") {
        window.initApp();
      } else if (typeof window.render === "function") {
        window.render();
      }
    })
    .catch(function (err) {
      console.warn("data_aib.js: failed to load 01_aggregated.csv", err);
    });

  // Load detail -> window.DATA_DETAIL (async, only needed on country click)
  fetch("data/01_detail.csv")
    .then(function (res) { return res.text(); })
    .then(function (text) {
      var rows = parseCSV(text);
      for (var i = 0; i < rows.length; i++) coerceNumeric(rows[i], DETAIL_NUMERIC);
      window.DATA_DETAIL = rows;
    })
    .catch(function (err) {
      console.warn("data_aib.js: failed to load 01_detail.csv", err);
    });
})();
