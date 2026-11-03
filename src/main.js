import Plotly from 'plotly.js-dist-min';
import { WebR } from 'webr';
import './style.css';

const rCode = `data <- read.csv("/home/web_user/enzyme_kinetics.csv")
conditions <- unique(data$condition)

fits <- lapply(conditions, function(condition_name) {
  subset_data <- data[data$condition == condition_name, ]
  substrate_means <- aggregate(velocity_uM_per_min ~ substrate_mM,
                               data = subset_data, FUN = mean)
  Vmax_start <- max(subset_data$velocity_uM_per_min)
  Km_start <- approx(x = substrate_means$velocity_uM_per_min,
                     y = substrate_means$substrate_mM,
                     xout = Vmax_start / 2, rule = 2)$y

  model <- nls(velocity_uM_per_min ~ Vmax * substrate_mM / (Km + substrate_mM),
               data = subset_data,
               start = list(Vmax = Vmax_start, Km = Km_start),
               algorithm = "port", lower = c(Vmax = 0, Km = 0))
  coefficients <- summary(model)$coefficients

  data.frame(condition = condition_name,
             Vmax = coef(model)[["Vmax"]],
             Vmax_SE = coefficients["Vmax", "Std. Error"],
             Km = coef(model)[["Km"]],
             Km_SE = coefficients["Km", "Std. Error"])
})

results <- do.call(rbind, fits)
json_rows <- sprintf('{"condition":"%s","Vmax":%.8f,"Vmax_SE":%.8f,"Km":%.8f,"Km_SE":%.8f}',
                     results$condition, results$Vmax, results$Vmax_SE,
                     results$Km, results$Km_SE)
paste0("[", paste(json_rows, collapse = ","), "]")`;

const loadingMessage = document.querySelector('#loading-message');
const loadingScreen = document.querySelector('#loading-screen');
const appShell = document.querySelector('#app-shell');
document.querySelector('#r-code').textContent = rCode;

function showResults(results, observations) {
  const colors = ['#087f72', '#e36c4c', '#567e9f', '#b08b2e'];
  const traces = [];

  results.forEach((result, index) => {
    const color = colors[index % colors.length];
    const conditionRows = observations.filter((row) => row.condition === result.condition);
    const substrates = conditionRows.map((row) => row.substrate_mM);
    const velocities = conditionRows.map((row) => row.velocity_uM_per_min);
    const maxSubstrate = Math.max(...substrates);
    const curveX = Array.from({ length: 100 }, (_, point) => maxSubstrate * point / 99);

    traces.push({
      x: curveX,
      y: curveX.map((substrate) => result.Vmax * substrate / (result.Km + substrate)),
      type: 'scatter',
      mode: 'lines',
      name: `${result.condition} · fit`,
      line: { color, width: 3 },
      hovertemplate: `${result.condition}<br>[S] %{x:.2f} mM<br>Fit %{y:.1f} µM/min<extra></extra>`,
    });
    traces.push({
      x: substrates,
      y: velocities,
      type: 'scatter',
      mode: 'markers',
      name: `${result.condition} · data`,
      marker: { color, size: 9, line: { color: '#ffffff', width: 1.5 } },
      customdata: conditionRows.map((row) => row.replicate),
      hovertemplate: `${result.condition}<br>[S] %{x:.2f} mM<br>Observed %{y:.1f} µM/min<br>Replicate %{customdata}<extra></extra>`,
    });

    const row = document.createElement('tr');
    row.innerHTML = `<th scope="row"><span class="condition-swatch" style="--swatch:${color}"></span>${result.condition}</th>
      <td>${result.Vmax.toFixed(2)} <span class="uncertainty">± ${result.Vmax_SE.toFixed(2)}</span></td>
      <td>${result.Km.toFixed(2)} <span class="uncertainty">± ${result.Km_SE.toFixed(2)}</span></td>`;
    document.querySelector('#summary-body').append(row);
  });

  Plotly.newPlot('kinetics-plot', traces, {
    autosize: true,
    margin: { l: 58, r: 18, t: 10, b: 52 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'DM Sans, sans-serif', color: '#51615d', size: 12 },
    xaxis: {
      title: { text: 'Substrate concentration (mM)', standoff: 12 },
      rangemode: 'tozero',
      gridcolor: '#e8eeeb',
      linecolor: '#dce4e0',
      zeroline: false,
    },
    yaxis: {
      title: { text: 'Velocity (µM/min)', standoff: 10 },
      rangemode: 'tozero',
      gridcolor: '#e8eeeb',
      linecolor: '#dce4e0',
      zeroline: false,
    },
    legend: { orientation: 'h', x: 0, y: 1.14, font: { size: 11 } },
    hovermode: 'closest',
    colorway: colors,
  }, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d'],
  });

  loadingScreen.hidden = true;
  appShell.hidden = false;
  window.dispatchEvent(new Event('resize'));
}

async function runAnalysis() {
  try {
    const response = await fetch('/data/enzyme_kinetics.csv');
    if (!response.ok) throw new Error(`Could not load CSV (${response.status})`);
    const csvText = await response.text();
    const [headerLine, ...dataLines] = csvText.trim().split(/\r?\n/);
    const headers = headerLine.split(',');
    const observations = dataLines.map((line) => {
      const values = line.split(',');
      return Object.fromEntries(headers.map((header, index) => [
        header,
        index === 0 ? values[index] : Number(values[index]),
      ]));
    });

    loadingMessage.textContent = 'Initializing the R runtime...';
    const webR = new WebR();
    await webR.init();
    await webR.FS.writeFile('/home/web_user/enzyme_kinetics.csv', new TextEncoder().encode(csvText));

    loadingMessage.textContent = 'Fitting Michaelis–Menten models...';
    const result = await webR.evalR(rCode);
    const resultJson = await result.toJs();
    showResults(JSON.parse(resultJson.values[0]), observations);
  } catch (error) {
    loadingMessage.textContent = `Analysis could not be completed: ${error.message}`;
    loadingScreen.classList.add('has-error');
  }
}

runAnalysis();