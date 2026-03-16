# Residual Visual

Visualisation of certified and residual mix of energy sources for countries.

## Setup

Static site — serve the `public_html/` folder with any web server. No build step required.

```bash
# e.g. with Python
python -m http.server -d public_html 8000
```

## Data Pipeline

Raw CSV data is converted into two JS files using the Python script:

```bash
python convertcsv.py input.csv public_html/data/data_detail.js public_html/data/data.js
```

- **`data.js`** — aggregated per country/year (totals, percentages, methodology)
- **`data_detail.js`** — row-level detail per energy source

Requires `pycountry` (`pip install pycountry`).

## Project Structure

```
public_html/
├── index.html          # Entry point
├── main.js             # Filters, state, export modal
├── view-map.js         # MapLibre world map + KPI coloring
├── country-ui.js       # Country hover popups, detail modal, charts
├── style.css           # Main styles
├── country-ui.css      # Modal/detail styles
├── data/               # Generated data files (data.js, data_detail.js)
├── lib/                # Vendor libs (MapLibre, ECharts, MultiSelect)
└── img/                # Logo and assets
```

## Key Features

- Interactive choropleth map with 3 switchable KPIs
- Country detail modal with bar chart, pie charts, and sortable table
- Year navigation and multi-select filters
- XLSX export with lead capture form
- Progressive GeoJSON loading (low-res → high-res)

## Dependencies

All vendored in `lib/` — no package manager needed:

- [MapLibre GL JS](https://maplibre.org/) — map rendering
- [ECharts](https://echarts.apache.org/) — charts
- [SheetJS](https://sheetjs.com/) — XLSX export
- MultiSelect — dropdown enhancement
