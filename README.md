# Flash Flood Prediction System — Prototype

A working prototype disaster-management dashboard for a college / SIH-style
demonstration: environmental readings → preprocessing → ML models → FastAPI
backend → interactive dashboard → risk visualization → alert.

> **This is a prototype built on SYNTHETIC, computer-generated demonstration
> data.** It is not connected to real weather stations, river gauges, or
> soil sensors, and must not be used for real flood decisions. See
> "Limitations" below.

---

## 1. Project overview

| Layer | Technology |
|---|---|
| ML training | scikit-learn, XGBoost, TensorFlow/Keras (LSTM) |
| Backend API | Python + FastAPI |
| Frontend | Vanilla HTML/CSS/JavaScript + Chart.js + Leaflet.js |

**Why vanilla JS instead of a React build?** The original brief listed
React.js *and* plain HTML/CSS/JS as acceptable frontend technologies. For a
laptop demo that needs to run reliably in ~5 minutes without `npm install`
/ build-tool issues, a dependency-free static frontend (loaded straight
from CDN libraries) is more robust. It talks to the same FastAPI backend
over the same JSON contract, so migrating to React later is a drop-in
replacement of the view layer only.

## 2. Problem statement

Flash floods in hilly/riverine districts (demo uses Assam districts) can
develop quickly. This prototype demonstrates how rainfall, river level,
soil moisture, temperature and humidity readings could feed a set of ML
classifiers to estimate flood risk (Low / Moderate / High / Critical) and
surface it on a live dashboard with map and alerting.

## 3. Features

- 6 tabular ML classifiers (Random Forest, XGBoost, Logistic Regression,
  SVM, Decision Tree, ANN) trained and evaluated for real — no hard-coded
  accuracy numbers.
- Separate LSTM time-series module for next-step risk trend prediction
  from a short sequence of past readings.
- FastAPI backend with input validation, `/predict`, `/predict/timeseries`,
  `/models/compare`, `/health`, and demo-data endpoints.
- Dashboard with live parameter cards, risk gauge, and alert banner.
- Prediction page with model selection.
- Analytics page with Chart.js trend charts and a model-comparison chart.
- Interactive Leaflet map of sample monitoring locations.
- Model comparison table driven by real evaluation metrics.
- "Simulate Live Data" button for the demo.

## 4. Architecture

```
Browser (frontend/) --fetch()--> FastAPI (backend/main.py) --> joblib/keras models
                                                              --> preprocessing pipeline
```

## 5. ML algorithms

- **Random Forest, XGBoost, Logistic Regression, SVM, Decision Tree, ANN
  (MLPClassifier)** — all tabular classifiers, trained on a single snapshot
  of environmental readings to classify current risk. These are directly
  comparable to each other (same task, same features).
- **LSTM** — a *different* task: given a short sequence of past readings,
  it predicts where risk is trending next. It is not "one more classifier
  in the comparison table" — comparing its metrics directly against the
  tabular classifiers would be misleading, since it solves a sequential
  regression-style problem, not single-snapshot classification.

## 6. Dataset

Two separate datasets are used, and the project is careful not to mix them up:

**a) ML training data — synthetic.** `backend/data/flood_data.csv`, generated
by `generate_dataset.py`: rainfall, water_level, soil_moisture, temperature,
humidity → flood_risk (Low/Moderate/High/Critical). The label is a weighted
combination of the features plus random noise (so classes overlap somewhat,
like a real problem), not a simple lookup table. **This is demonstration
data only.** For real deployment you must replace it with actual historical
sensor/weather data for your district.

**b) Geographic/historical reference data — real.**
`backend/data/assam_2022_historical_flood.csv` contains the actual
district-wise flood inundation figures (in hectares) from NRSC/ISRO's June
2022 Assam flood rapid-mapping report (Sentinel-1A SAR imagery, Disaster
Event ID `02-FL-2022-ASSAM`, issued 17 Jun 2022). This is real satellite-
derived data, but it is:
- from a **past event** (not live), and
- a **different measurement** (SAR-derived inundated area) than the
  rainfall/water-level/soil-moisture inputs the ML models use.

It's used for two things: (1) real district names + approximate coordinates
for the map's monitoring points (`GET /demo/locations` — the *readings* at
those points are still simulated), and (2) a dedicated "2022 Reference"
page (`GET /historical/assam-2022`) showing the real historical inundation
table, clearly labeled and cited. It is never blended into the ML training
data or presented as a live reading.

## 7. Preprocessing

- Duplicate rows dropped
- Missing values median-imputed
- Outliers clipped to physically plausible ranges
- Features standardized (StandardScaler)
- Same fitted pipeline (`models/preprocessor.joblib`) reused at inference
  time, so training and prediction see identical transformations

## 8. Model training & evaluation

`train_models.py` trains all 6 tabular models, evaluates them on a 20%
held-out stratified test split, and saves:
- `backend/models/*.joblib` — trained models + preprocessor + label encoder
- `backend/models/metrics.json` — real accuracy/precision/recall/F1/confusion
  matrix per model

No model is automatically declared "best" — the script just prints the
comparison table; you decide what "best" means for your use case (accuracy
vs. recall on High/Critical, interpretability, inference speed, etc.).

## 9. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 10. Frontend setup

No install needed — it's static files loaded via CDN libraries
(Chart.js, Leaflet). Any static file server works.

## 11. How to run (full demo)

```bash
# 1. From backend/, generate the synthetic dataset
cd backend
python3 generate_dataset.py

# 2. Train the tabular models
python3 train_models.py

# 3. Train the LSTM (optional but recommended for the demo)
python3 lstm_model.py

# 4. Start the backend API
uvicorn main:app --reload --port 8000

# 5. In a second terminal, serve the frontend
cd ../frontend
python3 -m http.server 5500

# 6. Open the dashboard
# http://localhost:5500/index.html
```

The frontend expects the backend at `http://localhost:8000` (see
`API_BASE` at the top of `frontend/app.js` — change it if you deploy the
backend elsewhere).

## 12. API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check, lists loaded models |
| GET | `/models` | Which trained models are available |
| GET | `/models/compare` | Real evaluation metrics for all tabular models |
| POST | `/predict` | Single-snapshot risk prediction. Body: `{rainfall, water_level, soil_moisture, temperature, humidity, model}` |
| POST | `/predict/timeseries` | LSTM next-step prediction. Body: `{readings: [{rainfall, water_level, soil_moisture}, ...]}` (must match the trained sequence length, default 6) |
| GET | `/demo/locations` | Real Assam districts (from the 2022 NRSC report) with simulated readings (DEMO DATA readings, real geography) |
| POST | `/demo/simulate` | One simulated reading set for "Simulate Live Data" |
| GET | `/historical/assam-2022` | Real historical flood inundation data by district, June 2022 (NRSC/ISRO) |

Example:
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"rainfall":120,"water_level":7.5,"soil_moisture":82,"temperature":27,"humidity":90,"model":"random_forest"}'
```

## 13. Demo instructions (~5 minutes)

1. Open the Dashboard — show the environmental parameter cards.
2. Go to Prediction — enter/adjust values, pick a model, click **Predict
   Flood Risk** — show the risk level, probability, and per-class
   probabilities.
3. Go to Analytics — show the trend charts and the model comparison chart.
4. Go to Map — show the sample monitoring locations colored by risk.
5. Go to Models — show the real accuracy/precision/recall/F1 table.
6. Back on Dashboard, click **Simulate Live Data** a few times — show the
   cards and risk gauge updating, and the alert banner appearing when risk
   is High/Critical.
7. On Prediction, click **Run LSTM Demo Sequence** — show the time-series
   prediction and its explicit data-sufficiency warning.

## 14. Limitations

- All data (training set, map locations, "simulated" live readings) is
  synthetic/demo data, not real sensors.
- Test-set accuracy (typically ~55-65% across models on this synthetic
  data) reflects the difficulty of the deliberately-noisy synthetic
  labels, not a benchmark for real flood prediction.
- The LSTM is trained on a small synthetic sequence set (1,500 sequences)
  and is a proof-of-concept only — the code and API both flag this
  explicitly (`data_sufficiency_warning`).
- No real-time sensor integration, no SMS/email alerting, no
  authentication — out of scope for this prototype.
- CORS is fully open (`allow_origins=["*"]`) for local demo convenience;
  restrict this before any real deployment.

## 15. Future scope

- Connect to real IMD/CWC rainfall and river-gauge APIs.
- Replace synthetic labels with historical flood-event ground truth.
- Add authentication, SMS/email alerting, and role-based access for
  district disaster-management officers.
- Retrain the LSTM on real multi-year sequential sensor data.
- Migrate the frontend to React if a component-based codebase is needed
  for a larger team.

## 16. Troubleshooting

- **`ModuleNotFoundError`** → make sure the virtual environment is
  activated and `pip install -r requirements.txt` completed without
  errors.
- **`/predict` returns 503** → you haven't run `train_models.py` yet (no
  models on disk).
- **`/predict/timeseries` returns 503** → you haven't run `lstm_model.py`
  yet, or TensorFlow failed to install (see below).
- **TensorFlow install is slow / fails** → `tensorflow-cpu` is a large
  package (few hundred MB); a slow connection can make `pip install` take
  several minutes. The LSTM module is optional for the demo — everything
  else works without it.
- **Frontend shows "Backend offline"** → confirm `uvicorn` is running on
  port 8000 and that nothing else is using that port
  (`lsof -i :8000` / `netstat -ano | findstr 8000`).
- **CORS errors in the browser console** → confirm you're loading the
  frontend via `http://localhost:5500/...` (not `file://`), and that the
  backend is running — CORS is already set to allow all origins.
- **Port already in use** → change `--port 8000` (backend) or
  `5500` (frontend, `python3 -m http.server <port>`), and update
  `API_BASE` in `frontend/app.js` to match.
