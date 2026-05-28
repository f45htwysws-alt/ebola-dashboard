async function loadEbolaData() {
  const url = "latest.json";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json();
}

let charts = {
  timeSeries: null,
  rt: null,
  heatmapCases: null,
  heatmapAge: null
};

function formatNumber(n) {
  return n.toLocaleString("de-DE");
}

function computeAggregates(data) {
  const countries = data.countries;
  let totalCases = 0;
  let totalDeaths = 0;
  let currentHosp = 0;
  let rtValues = [];

  countries.forEach(country => {
    const ts = country.timeseries;
    ts.forEach(entry => {
      totalCases += entry.cases;
      totalDeaths += entry.deaths;
    });
    const last = ts[ts.length - 1];
    currentHosp += last.hospitalized;
    rtValues.push(last.r_estimate);
  });

  const rtAvg =
    rtValues.length > 0
      ? rtValues.reduce((a, b) => a + b, 0) / rtValues.length
      : 0;

  return {
    totalCases,
    totalDeaths,
    currentHosp,
    rtAvg
  };
}

function updateKpis(data) {
  const metaGenerated = document.getElementById("metaGenerated");
  if (data.meta && data.meta.generated) {
    metaGenerated.textContent = data.meta.generated;
  }

  const agg = computeAggregates(data);
  document.getElementById("kpiTotalCases").textContent = formatNumber(
    agg.totalCases
  );
  document.getElementById("kpiTotalDeaths").textContent = formatNumber(
    agg.totalDeaths
  );
  document.getElementById("kpiCurrentHosp").textContent = formatNumber(
    agg.currentHosp
  );
  document.getElementById("kpiRt").textContent = agg.rtAvg.toFixed(2);
}

function initCountrySelect(data) {
  const select = document.getElementById("countrySelect");
  select.innerHTML = "";
  data.countries.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.country;
    opt.textContent = c.country;
    select.appendChild(opt);
  });
}

function getCountryData(data, countryName) {
  return data.countries.find(c => c.country === countryName);
}

function renderTimeSeriesChart(country, metric) {
  const ctx = document.getElementById("timeSeriesChart").getContext("2d");
  const labels = country.timeseries.map(t => t.date);
  const values = country.timeseries.map(t => t[metric]);

  const colors = {
    cases: "#0072ce",
    deaths: "#c0392b",
    hospitalized: "#8e44ad",
    recovered: "#27ae60"
  };

  if (charts.timeSeries) charts.timeSeries.destroy();

  charts.timeSeries = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: metric,
          data: values,
          borderColor: colors[metric] || "#0072ce",
          backgroundColor: "rgba(0,114,206,0.1)",
          tension: 0.2,
          fill: true,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} ${metric}`
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 60 } },
        y: { beginAtZero: true }
      }
    }
  });

  const titleMap = {
    cases: "Fälle",
    deaths: "Todesfälle",
    hospitalized: "Hospitalisiert",
    recovered: "Genesen"
  };
  document.getElementById("mainChartTitle").textContent =
    titleMap[metric] || metric;
}

function renderRtChart(country) {
  const ctx = document.getElementById("rtChart").getContext("2d");
  const labels = country.timeseries.map(t => t.date);
  const values = country.timeseries.map(t => t.r_estimate);

  if (charts.rt) charts.rt.destroy();

  charts.rt = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "R(t)",
          data: values,
          borderColor: "#27ae60",
          backgroundColor: "rgba(39,174,96,0.1)",
          tension: 0.2,
          fill: true,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `R(t): ${ctx.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 60 } },
        y: {
          beginAtZero: false,
          suggestedMin: 0.8,
          suggestedMax: 1.4
        }
      }
    }
  });
}

function renderHeatmapCases(data) {
  const ctx = document.getElementById("heatmapCases").getContext("2d");
  const countries = data.countries.map(c => c.country);
  const dates = data.countries[0].timeseries.map(t => t.date);

  const points = [];
  data.countries.forEach((country, rowIndex) => {
    country.timeseries.forEach((t, colIndex) => {
      points.push({
        x: dates[colIndex],
        y: countries[rowIndex],
        v: t.cases
      });
    });
  });

  if (charts.heatmapCases) charts.heatmapCases.destroy();

  charts.heatmapCases = new Chart(ctx, {
    type: "matrix",
    data: {
      datasets: [
        {
          label: "Fälle",
          data: points,
          backgroundColor: ctx => {
            const value = ctx.raw.v;
            if (value === 0) return "rgba(230,230,230,0.5)";
            const alpha = Math.min(0.15 + value / 15, 0.95);
            return `rgba(192,57,43,${alpha})`;
          },
          width: () => 16,
          height: () => 16
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          type: "category",
          labels: dates,
          ticks: {
            maxRotation: 90,
            minRotation: 90,
            autoSkip: true,
            maxTicksLimit: 15
          }
        },
        y: {
          type: "category",
          labels: countries
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `${ctx[0].raw.y} – ${ctx[0].raw.x}`,
            label: ctx => `${ctx.raw.v} Fälle`
          }
        }
      }
    }
  });
}

function renderHeatmapAge(data) {
  const ctx = document.getElementById("heatmapAge").getContext("2d");
  const countries = data.countries.map(c => c.country);
  const ageGroups = ["0-14", "15-49", "50+"];

  const points = [];
  data.countries.forEach((country, rowIndex) => {
    ageGroups.forEach((age, colIndex) => {
      const sum = country.timeseries.reduce(
        (acc, t) => acc + (t.age_distribution?.[age] || 0),
        0
      );
      points.push({
        x: age,
        y: countries[rowIndex],
        v: sum
      });
    });
  });

  if (charts.heatmapAge) charts.heatmapAge.destroy();

  charts.heatmapAge = new Chart(ctx, {
    type: "matrix",
    data: {
      datasets: [
        {
          label: "Altersverteilung",
          data: points,
          backgroundColor: ctx => {
            const value = ctx.raw.v;
            if (value === 0) return "rgba(220,220,220,0.5)";
            const alpha = Math.min(0.1 + value / 80, 0.95);
            return `rgba(41,128,185,${alpha})`;
          },
          width: () => 40,
          height: () => 20
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          type: "category",
          labels: ageGroups
        },
        y: {
          type: "category",
          labels: countries
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `${ctx[0].raw.y} – ${ctx[0].raw.x}`,
            label: ctx => `${ctx.raw.v} Fälle (kumuliert)`
          }
        }
      }
    }
  });
}

function renderSummaryTable(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  tbody.innerHTML = "";

  data.countries.forEach(country => {
    const ts = country.timeseries;
    const last7 = ts.slice(-7);

    const sumCases = last7.reduce((acc, t) => acc + t.cases, 0);
    const sumDeaths = last7.reduce((acc, t) => acc + t.deaths, 0);
    const last = ts[ts.length - 1];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${country.country}</td>
      <td>${formatNumber(sumCases)}</td>
      <td>${formatNumber(sumDeaths)}</td>
      <td>${formatNumber(last.hospitalized)}</td>
      <td>${last.r_estimate.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function initDashboard() {
  try {
    const data = await loadEbolaData();

    updateKpis(data);
    initCountrySelect(data);
    renderHeatmapCases(data);
    renderHeatmapAge(data);
    renderSummaryTable(data);

    const countrySelect = document.getElementById("countrySelect");
    const metricSelect = document.getElementById("metricSelect");

    const initialCountry = countrySelect.value || data.countries[0].country;
    const initialMetric = metricSelect.value;

    const initialCountryData = getCountryData(data, initialCountry);
    renderTimeSeriesChart(initialCountryData, initialMetric);
    renderRtChart(initialCountryData);

    countrySelect.addEventListener("change", () => {
      const cData = getCountryData(data, countrySelect.value);
      renderTimeSeriesChart(cData, metricSelect.value);
      renderRtChart(cData);
    });

    metricSelect.addEventListener("change", () => {
      const cData = getCountryData(data, countrySelect.value);
      renderTimeSeriesChart(cData, metricSelect.value);
    });
  } catch (err) {
    console.error("Fehler beim Initialisieren des Dashboards:", err);
    alert("Fehler beim Laden der Daten: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", initDashboard);
