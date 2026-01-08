// view-list.js
// Depends on: getFilteredData

window.renderListView = function renderListView() {
  const rows = getFilteredData();

  const agg = {};
  const parse = (n) => n ? (parseFloat(String(n).replace(",", ".")) || 0) : 0;

  rows.forEach(r => {
    const code = r.country_code;
    if (!agg[code]) {
      agg[code] = { country: r.country, fossil: 0, nuclear: 0, res: 0, residualPct: 0 };
    }

    const totalGen = parse(r.certified_mix) + parse(r.residual_mix);

    if (["coal", "oil", "gas"].includes(r.energy_source)) {
      agg[code].fossil += totalGen;
    } else if (r.energy_source === "nuclear") {
      agg[code].nuclear += totalGen;
    } else {
      agg[code].res += totalGen;
    }

    agg[code].residualPct += parse(r.residual_mix);
  });

  const codes = Object.keys(agg);
  const labels = codes.map(c => agg[c].country || c);

  const fossil = codes.map(c => agg[c].fossil);
  const nuclear = codes.map(c => agg[c].nuclear);
  const res = codes.map(c => agg[c].res);
  const residualDots = codes.map(c => agg[c].residualPct);

  const chartDom = document.getElementById('list-chart');
  const chart = echarts.init(chartDom);

  chart.setOption({
    // VERTICAL bars: categories on X, value on Y
    xAxis: {
    type: 'category',
    data: labels,          // country names / codes
    axisLabel: { rotate: 0 }  // rotate if labels get crowded
    },
    yAxis: {
    type: 'value',
    max: 100,
    axisLabel: { formatter: '{value}%' }
    },
    series: [
    {
        name: 'Fossil',
        type: 'bar',
        stack: 'total',
        data: fossil,
        itemStyle: { color: '#2B2B2B' }
    },
    {
        name: 'Nuclear',
        type: 'bar',
        stack: 'total',
        data: nuclear,
        itemStyle: { color: '#004C5F' }
    },
    {
        name: 'RES',
        type: 'bar',
        stack: 'total',
        data: res,
        itemStyle: { color: '#78AFC3' }
    },
    {
        name: 'Residual Mix %',
        type: 'scatter',
        symbolSize: 8,
        // one point per country: [xIndex, yValue]
        data: residualDots.map((v, i) => [i, v]),
        itemStyle: { color: '#F2C462' }
    }
    ]

  });

  chart.resize();
};

