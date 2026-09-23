const API_BASE = "http://localhost:8000";

// ---------------------------------------------------------------- Navigation
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    link.classList.add("active");
    document.getElementById(`page-${link.dataset.page}`).classList.add("active");
    if (link.dataset.page === "analytics") renderCharts();
    if (link.dataset.page === "map") renderMap();
    if (link.dataset.page === "models") renderModelsTable();
    if (link.dataset.page === "historical") renderHistorical();
  });
});

// ---------------------------------------------------------------- Backend status
async function checkBackend() {
  const pill = document.getElementById("backend-status");
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    pill.textContent = `Backend online (${data.models_loaded.length} models)`;
    pill.className = "status-pill status-online";
  } catch (err) {
    pill.textContent = "Backend offline — start FastAPI server";
    pill.className = "status-pill status-offline";
  }
}

// ---------------------------------------------------------------- Dashboard cards
let currentReading = { rainfall: 78, water_level: 6.8, soil_moisture: 92, temperature: 30, humidity: 88 };

function badgeClass(val, thresholds) {
  // thresholds: [lowMax, modMax, highMax]
  if (val <= thresholds[0]) return "low";
  if (val <= thresholds[1]) return "moderate";
  if (val <= thresholds[2]) return "high";
  return "";
}

function renderParamCards() {
  const r = currentReading;
  const cards = [
    { icon: "🌧️", label: "Rainfall", value: `${r.rainfall} mm/hr`, badge: badgeClass(r.rainfall, [30, 80, 150]) },
    { icon: "🌊", label: "Water Level", value: `${r.water_level} m`, badge: badgeClass(r.water_level, [2, 5, 8]) },
    { icon: "💧", label: "Soil Moisture", value: `${r.soil_moisture} %`, badge: badgeClass(r.soil_moisture, [40, 70, 90]) },
    { icon: "🌡️", label: "Temperature", value: `${r.temperature} °C`, badge: "" },
    { icon: "💦", label: "Humidity", value: `${r.humidity} %`, badge: badgeClass(r.humidity, [50, 75, 90]) },
  ];
  document.getElementById("param-cards").innerHTML = cards.map(c => `
    <div class="card param-card">
      <div style="font-size:26px;margin-bottom:8px;">${c.icon}</div>
      <h3>${c.label}</h3>
      <div class="value">${c.value}</div>
      <span class="badge ${c.badge}">${c.badge ? c.badge.toUpperCase() : "NORMAL"}</span>
    </div>
  `).join("");
}

function renderRisk(riskLevel, probability) {
  const circle = document.getElementById("risk-circle");
  const label = document.getElementById("risk-label");
  const probLabel = document.getElementById("risk-prob-label");
  const colors = { Low: "#54e38e", Moderate: "#ffe066", High: "#ffb84d", Critical: "#ff4f5e" };
  circle.style.borderColor = colors[riskLevel] || "#ff4f5e";
  label.textContent = riskLevel || "—";
  probLabel.textContent = probability != null ? `Probability: ${(probability * 100).toFixed(1)}%` : "Run a prediction to see risk";

  const alertCard = document.getElementById("alert-card");
  const alertText = document.getElementById("alert-text");
  if (riskLevel === "High" || riskLevel === "Critical") {
    alertCard.style.display = "block";
    alertText.textContent = `${riskLevel} flood risk detected based on current environmental conditions.`;
  } else {
    alertCard.style.display = "none";
  }
}

document.getElementById("simulate-btn").addEventListener("click", async () => {
  try {
    const res = await fetch(`${API_BASE}/demo/simulate`, { method: "POST" });
    const data = await res.json();
    currentReading = data;
    renderParamCards();
    const pred = await runPrediction(data, "random_forest");
    if (pred) renderRisk(pred.risk_level, pred.probability);
  } catch (err) {
    alert("Could not reach backend. Is the FastAPI server running on port 8000?");
  }
});

// ---------------------------------------------------------------- Prediction page
async function runPrediction(reading, model) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...reading, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Prediction failed");
  }
  return res.json();
}

document.getElementById("predict-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const reading = {
    rainfall: parseFloat(document.getElementById("in-rainfall").value),
    water_level: parseFloat(document.getElementById("in-water").value),
    soil_moisture: parseFloat(document.getElementById("in-soil").value),
    temperature: parseFloat(document.getElementById("in-temp").value),
    humidity: parseFloat(document.getElementById("in-humidity").value),
  };
  const model = document.getElementById("model-select").value;
  const resultBox = document.getElementById("predict-result");
  resultBox.innerHTML = `<h2>Prediction Result</h2><p class="muted">Predicting…</p>`;

  try {
    const pred = await runPrediction(reading, model);
    const probBars = Object.entries(pred.class_probabilities)
      .map(([cls, p]) => `
        <div><span style="width:70px;">${cls}</span>
          <div class="prob-bar-track"><div class="prob-bar-fill" style="width:${p*100}%"></div></div>
          <span>${(p*100).toFixed(1)}%</span>
        </div>`).join("");

    resultBox.innerHTML = `
      <h2>Prediction Result</h2>
      <div class="result-risk">Risk Level: ${pred.risk_level.toUpperCase()}</div>
      <div class="result-prob">Probability: ${(pred.probability*100).toFixed(1)}% &nbsp;|&nbsp; Model: ${pred.model}</div>
      <div class="prob-bars">${probBars}</div>
      <p class="disclaimer" style="margin-top:10px;">${pred.risk_level} flood risk detected based on the provided environmental conditions. This is a prototype output, not a real emergency warning.</p>
    `;

    currentReading = reading;
    renderParamCards();
    renderRisk(pred.risk_level, pred.probability);
  } catch (err) {
    resultBox.innerHTML = `<h2>Prediction Result</h2><p class="muted">Error: ${err.message}</p>`;
  }
});

document.getElementById("lstm-demo-btn").addEventListener("click", async () => {
  const box = document.getElementById("lstm-result");
  box.innerHTML = `<p class="muted">Running LSTM sequence prediction…</p>`;
  const sequence = [
    { rainfall: 30, water_level: 2.0, soil_moisture: 40 },
    { rainfall: 40, water_level: 2.3, soil_moisture: 45 },
    { rainfall: 55, water_level: 2.8, soil_moisture: 52 },
    { rainfall: 70, water_level: 3.5, soil_moisture: 60 },
    { rainfall: 90, water_level: 4.2, soil_moisture: 68 },
    { rainfall: 110, water_level: 5.0, soil_moisture: 75 },
  ];
  try {
    const res = await fetch(`${API_BASE}/predict/timeseries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readings: sequence }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "LSTM prediction failed");
    box.innerHTML = `
      <p><strong>Predicted next-step risk:</strong> ${data.predicted_risk_level} (score ${data.predicted_risk_score})</p>
      <p class="disclaimer">${data.warning}</p>
    `;
  } catch (err) {
    box.innerHTML = `<p class="muted">Error: ${err.message}</p>`;
  }
});

// ---------------------------------------------------------------- Analytics charts
let chartsRendered = false;
function demoSeries(n, base, amp) {
  return Array.from({ length: n }, (_, i) => Math.max(0, base + amp * Math.sin(i / 2) + (Math.random() - 0.5) * amp * 0.4));
}

async function renderCharts() {
  if (chartsRendered) return;
  chartsRendered = true;
  const labels = Array.from({ length: 12 }, (_, i) => `T-${11 - i}`);

  new Chart(document.getElementById("chart-rainfall"), {
    type: "line",
    data: { labels, datasets: [{ label: "Rainfall (mm/hr) — demo data", data: demoSeries(12, 60, 40), borderColor: "#42d9ff", tension: 0.3 }] },
    options: chartOptions(),
  });
  new Chart(document.getElementById("chart-water"), {
    type: "line",
    data: { labels, datasets: [{ label: "Water Level (m) — demo data", data: demoSeries(12, 4, 2.5), borderColor: "#54e38e", tension: 0.3 }] },
    options: chartOptions(),
  });
  new Chart(document.getElementById("chart-soil"), {
    type: "line",
    data: { labels, datasets: [{ label: "Soil Moisture (%) — demo data", data: demoSeries(12, 55, 25), borderColor: "#ffb84d", tension: 0.3 }] },
    options: chartOptions(),
  });
  new Chart(document.getElementById("chart-risk"), {
    type: "line",
    data: { labels, datasets: [{ label: "Flood Risk Score — demo data", data: demoSeries(12, 0.4, 0.3), borderColor: "#ff5964", tension: 0.3 }] },
    options: chartOptions(),
  });

  try {
    const res = await fetch(`${API_BASE}/models/compare`);
    const data = await res.json();
    const names = Object.keys(data.metrics);
    new Chart(document.getElementById("chart-models"), {
      type: "bar",
      data: {
        labels: names,
        datasets: [
          { label: "Accuracy", data: names.map(n => data.metrics[n].accuracy), backgroundColor: "#42d9ff" },
          { label: "F1 Score", data: names.map(n => data.metrics[n].f1_score), backgroundColor: "#ffb84d" },
        ],
      },
      options: chartOptions(),
    });
  } catch (err) {
    document.getElementById("chart-models").parentElement.innerHTML += `<p class="muted">Could not load model metrics — is the backend running?</p>`;
  }
}

function chartOptions() {
  return {
    responsive: true,
    plugins: { legend: { labels: { color: "#cfe0ee" } } },
    scales: {
      x: { ticks: { color: "#8ca6bd" }, grid: { color: "#203a51" } },
      y: { ticks: { color: "#8ca6bd" }, grid: { color: "#203a51" } },
    },
  };
}

// ---------------------------------------------------------------- Map
let mapRendered = false;
async function renderMap() {
  if (mapRendered) return;
  mapRendered = true;
  const map = L.map("leaflet-map").setView([27.1, 94.6], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const riskColors = { Low: "#54e38e", Moderate: "#ffe066", High: "#ffb84d", Critical: "#ff4f5e" };

  try {
    const res = await fetch(`${API_BASE}/demo/locations`);
    const data = await res.json();
    data.locations.forEach(loc => {
      L.circleMarker([loc.lat, loc.lon], {
        radius: 12, color: riskColors[loc.risk_level] || "#ff4f5e", fillOpacity: 0.8,
      }).addTo(map).bindPopup(`
        <strong>${loc.name}</strong><br>
        Rainfall: ${loc.rainfall} mm/hr<br>
        Water Level: ${loc.water_level} m<br>
        Risk: ${loc.risk_level}<br>
        <em>Demo/simulated data</em>
      `);
    });
  } catch (err) {
    console.error(err);
  }
}

// ---------------------------------------------------------------- Models table
let modelsTableRendered = false;
async function renderModelsTable() {
  if (modelsTableRendered) return;
  modelsTableRendered = true;
  const tbody = document.querySelector("#models-table tbody");
  try {
    const res = await fetch(`${API_BASE}/models/compare`);
    const data = await res.json();
    tbody.innerHTML = Object.entries(data.metrics).map(([name, m]) => `
      <tr>
        <td>${name}</td>
        <td>${(m.accuracy*100).toFixed(2)}%</td>
        <td>${(m.precision*100).toFixed(2)}%</td>
        <td>${(m.recall*100).toFixed(2)}%</td>
        <td>${(m.f1_score*100).toFixed(2)}%</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Could not load metrics — is the backend running?</td></tr>`;
  }
}

// ---------------------------------------------------------------- Historical reference (real 2022 data)
let historicalRendered = false;
async function renderHistorical() {
  if (historicalRendered) return;
  historicalRendered = true;
  const metaBox = document.getElementById("historical-meta");
  const tbody = document.querySelector("#historical-table tbody");
  try {
    const res = await fetch(`${API_BASE}/historical/assam-2022`);
    const data = await res.json();
    metaBox.innerHTML = `
      <p><strong>${data.event}</strong></p>
      <p class="muted">Source: ${data.source} • ${data.satellite_data} • Issued ${data.date_of_issue} • Event ID: ${data.disaster_event_id}</p>
      <p class="muted">Total inundated area across listed districts: ${data.total_inundated_area_ha.toLocaleString()} ha</p>
      <p class="disclaimer" style="margin-top:8px;">${data.note}</p>
    `;
    tbody.innerHTML = data.districts.map(d => `
      <tr><td>${d.district.replace(/_/g, " ")}</td><td>${d.inundated_area_ha.toLocaleString()}</td></tr>
    `).join("");
  } catch (err) {
    metaBox.innerHTML = `<p class="muted">Could not load historical reference data — is the backend running?</p>`;
  }
}

// ---------------------------------------------------------------- init
renderParamCards();
checkBackend();
setInterval(checkBackend, 15000);
