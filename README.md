<div align="center">

# 🌱 AgriQNet 2.0

### A farm assistant for Karnataka's farmers, with quantum-enhanced crop and fertilizer recommendations

Recommends the right crop and fertilizer from a soil test · identifies pests from a photo and warns nearby farmers by SMS · answers questions from trusted farm books with page citations · gives district weather alerts — in **ಕನ್ನಡ · हिंदी · తెలుగు · English**.

`React` · `Node.js / Express` · `FastAPI` · `MongoDB` · `scikit-learn` · `quantum circuit simulation` · `YOLOv8` · `RAG` · `Gemini / Groq`

<img src="docs/demo_assets/03-home-desktop.png" width="820" alt="AgriQNet home screen">

<sub>The farmer's home screen: district weather, pest alerts nearby, and six picture tiles for every feature.</sub>

</div>

---

## At a glance

**The problem.** Small farmers rarely get advice that fits *their* soil, *their* district and *their* language. When a new district or crop has only a handful of soil tests, standard machine-learning models also struggle to learn.

**What I built.** A full-stack platform of seven services that starts with one command:

| | Feature | How it works |
|---|---|---|
| 🌾 | **Crop & fertilizer recommendations** | Quantum-hybrid models: soil readings are turned into quantum-circuit features, the useful ones are picked by an optimisation step (QUBO), then a classical model decides |
| 🐛 | **Pest photo → SMS warning** | YOLOv8 names the pest (102 types); a confident report texts farmers in nearby districts, found by a breadth-first search over the district map |
| 📚 | **Farmer Library** | Retrieval-augmented generation (RAG) over ICAR/UAS books; every answer cites the page it came from |
| 🌦️ | **Weather & weekly advice** | 16-day forecast turned into farm alerts (heavy rain, heat, wind) and AI advice for the district |
| 💬 | **Ask anything** | A district-aware assistant with voice input and read-aloud |

**Key results** (classically simulated circuits, measured on farms the models never saw):

- **Fertilizer, 8 inputs:** adding quantum features lifted an SVM from **0.45 to 0.73** macro-F1 with 64 training farms (**+29 points**).
- **Crop:** both quantum upgrades beat the classical SVM with **2–16 farms per crop** (up to **+3.4 points**).
- **Fertilizer, NPK:** the quantum-kernel SVM matched its classical twin, which was already near-perfect (0.98).

**Engineering highlights**

- **Fair quantum-vs-classical comparison:** every quantum model is tested against its classical twin on the same farms, with a leak-free pipeline, nested cross-validation and corrected statistical tests.
- **Fast, dependency-light inference:** a custom NumPy simulator computes the circuit features in 5–100 ms on a CPU, with no quantum SDK or GPU needed in production.
- **Safe alerting:** reports are sent automatically only when the photo model is ≥ 60% sure or a second farmer confirms; otherwise an officer reviews them. Demo users are never texted.
- **Trustworthy answers:** the Farmer Library builds one search index per book, combines meaning-based and keyword search with a reranker, and blocks duplicate and non-farming uploads.
- **Built for farmers:** language chosen on the first screen, district instead of GPS, picture buttons, read-aloud on every card, and SMS for family members on basic phones.

---

## Contents

1. [Product tour](#1-product-tour)
2. [System architecture](#2-system-architecture)
3. [The quantum machine-learning models](#3-the-quantum-machine-learning-models)
4. [How each service works](#4-how-each-service-works)
5. [Run it locally](#5-run-it-locally)
6. [Configuration](#6-configuration)
7. [Project structure](#7-project-structure)

---

## 1. Product tour

**1 · Pick a language, sign in, land on Home**

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/01-language-choice-phone.jpg" width="190"><br><sub>Language is the first choice</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/02-login-phone.jpg" width="190"><br><sub>Phone login + demo accounts</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/04-home-phone.jpg" width="190"><br><sub>Home for the farmer's district</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/06-home-kannada-phone.jpg" width="190"><br><sub>Same screen in Kannada</sub></td>
</tr>
</table>

**2 · Get a crop or fertilizer recommendation from the quantum-hybrid models**

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/09-crop-model-inputs-phone.jpg" width="190"><br><sub>Enter soil and weather readings</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/10-crop-result-phone.jpg" width="190"><br><sub>Rice, 99.7% · 7 simulated qubits</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/11-fertilizer-genai-phone.jpg" width="190"><br><sub>Fertilizer calculator</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/12-fertilizer-result-phone.jpg" width="190"><br><sub>Urea · 3 simulated qubits</sub></td>
</tr>
</table>

**3 · Photograph a pest, get advice, warn neighbours**

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/14-pest-detected-phone.jpg" width="190"><br><sub>YOLOv8 names the pest</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/15-pest-advice-phone.jpg" width="190"><br><sub>Confidence + what to do now</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/16-pest-warn-severity-phone.jpg" width="190"><br><sub>How bad is it?</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/17-pest-warn-send-phone.jpg" width="190"><br><sub>Which districts get the SMS</sub></td>
</tr>
</table>

**4 · Officers watch outbreaks spread on the Alert Network**

<p align="center"><img src="docs/demo_assets/20-alert-network-map-desktop.png" width="760"><br><sub>Red zone where the pest was reported, orange for neighbouring districts, with district details on the right.</sub></p>

**5 · Ask the Farmer Library — answers cite the page**

<table>
<tr>
<td align="center" width="50%"><img src="docs/demo_assets/22-farmer-library-desktop.png" width="400"><br><sub>A shelf of ICAR, UAS and TNAU books</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/23-library-chat-citations-desktop.png" width="400"><br><sub>An answer from one book, with citation [1]</sub></td>
</tr>
</table>

<details>
<summary><b>More screens</b> — weather, alerts, officer view, assistant</summary>

<table>
<tr>
<td align="center" width="50%"><img src="docs/demo_assets/07-weather-station-desktop.png" width="400"><br><sub>Weather station for the district</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/08-weather-forecast-desktop.png" width="400"><br><sub>AI farm decisions + 16-day forecast</sub></td>
</tr>
<tr>
<td align="center" width="50%"><img src="docs/demo_assets/21-officer-alert-history-desktop.png" width="400"><br><sub>Officer dashboard and alert history</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/24-ask-assistant-desktop.png" width="400"><br><sub>District-aware farming assistant</sub></td>
</tr>
</table>

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/05-home-tiles-phone.jpg" width="190"><br><sub>Six picture tiles with read-aloud</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/13-pest-photo-start-phone.jpg" width="190"><br><sub>Take or choose a pest photo</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/18-alerts-farmer-phone.jpg" width="190"><br><sub>Alerts for my district</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/19-alerts-weather-sms-phone.jpg" width="190"><br><sub>Weather alerts · SMS for basic phones</sub></td>
</tr>
</table>

</details>

All screenshots, with titles and captions in story order, are in [`docs/demo_assets/`](docs/demo_assets) ([`manifest.json`](docs/demo_assets/manifest.json)). Diagrams use icons from [Phosphor](https://phosphoricons.com) (the icon set used in the app); their Mermaid sources and build script are in [`docs/diagrams/`](docs/diagrams).

---

## 2. System architecture

The browser talks to a single **API gateway**. The gateway owns users, alerts and SMS, keeps every API key on the server, and forwards specialist work to three Python services.

<p align="center"><img src="docs/diagrams/01-architecture.png" width="780" alt="AgriQNet architecture: browser apps, API gateway, local services and external APIs"></p>

| Service | Port | Built with | Responsibility |
|---|---|---|---|
| AgriQNet app (`apps/web`) | 3000 | React 19, Vite, Motion, d3-geo | Farmer and officer screens, Alert Network map |
| Weather station (`apps/weather`) | 5175 | React, Tailwind | Weather, 16-day forecast, farm alerts |
| API gateway (`services/api`) | 5000 | Node.js, Express, Mongoose | Login, OTP, SMS, pest alerts, AI calls, routing |
| MongoDB | 27017 | Embedded MongoDB 7 | Users, farmers, districts, alerts, SMS log |
| Pest detector (`services/pest-detector`) | 8001 | FastAPI, YOLOv8 | Identify 102 pest types from a photo |
| Recommender (`services/recommender`) | 8002 | FastAPI, scikit-learn, NumPy | Quantum-hybrid crop and fertilizer models |
| Farmer Library (`services/agri-rag`) | 8003 | FastAPI, PyMuPDF, multilingual-e5, BM25 | Add books, search them, answer with citations |

A launcher script (`npm start`) installs everything on the first run, starts the services in the right order, waits for each health check, and shuts them all down cleanly on **Ctrl+C**.

**Example: what happens when a farmer asks "Which crop?"**

<p align="center"><img src="docs/diagrams/02-request-sequence.png" width="900" alt="Sequence of a crop recommendation request"></p>

<details>
<summary><b>Data model</b> (MongoDB collections)</summary>

<p align="center"><img src="docs/diagrams/03-data-model.png" width="760" alt="MongoDB data model"></p>

Also stored: one-time passwords (hashed), an SMS outbox, weekly advice cached per district and language, and ID counters.

</details>

---

## 3. The quantum machine-learning models

> **In one sentence:** small quantum circuits turn each farm's soil readings into new features that capture *combinations* of nutrients, and these features let a classical model learn more from fewer farms than its purely classical twin.
>
> The circuits (3–7 qubits) are simulated on a normal computer.

### 3.1 The research question

*Can quantum computing help a classical model pick the right crop or fertilizer from only a handful of farm examples?*

To keep the test fair, I took one standard model, the **support vector machine (SVM)**, as the classical twin and built two quantum-upgraded versions of it. All three learn from exactly the same farms and are scored only on farms they have never seen. Any difference therefore comes from the quantum part alone.

| Dataset | Farms | Inputs | Predicts |
|---|---|---|---|
| Crop | 2,200 (100 per crop) | N, P, K, temperature, humidity, pH, rainfall | 1 of 22 crops |
| Fertilizer · NPK | 99 | N, P, K | 1 of 7 fertilizers |
| Fertilizer · 8 inputs | 99 | N, P, K, temperature, humidity, moisture, soil type, crop type | 1 of 7 fertilizers |

### 3.2 Turning a soil test into quantum features

| Step | What happens | Why |
|---|---|---|
| **Scale** | Each reading is scaled to between −1 and +1 | A qubit can only be *turned*, so every number must become an angle |
| **Turn** | `RY(s · x)` rotates one qubit per reading | The strength `s` sets how much a change in the reading matters (0.5–2 were tried) |
| **Link** | CNOT gates connect the qubits in a ring (N → K → P → N) | The result now depends on *combinations* like N-with-K, not just each nutrient alone |
| **Measure** | Average values ⟨X⟩, ⟨Y⟩, ⟨Z⟩ per qubit and ⟨XX⟩, ⟨YY⟩, ⟨ZZ⟩ per pair | Each average becomes one new feature |

### 3.3 Two ways to upgrade the SVM

<p align="center"><img src="docs/diagrams/04-quantum-upgrades.png" width="640" alt="Classical SVM and its two quantum upgrades"></p>

- **Upgrade 1 — Q-SVM (a new sense of "similar").** Each farm becomes a quantum *fingerprint*. The SVM treats two farms as alike when their fingerprints overlap, instead of when their numbers are close.
- **Upgrade 2 — SVM + quantum features (better inputs).** Fifteen fixed circuits, from five designs at several strengths, turn every farm into hundreds of new features: 1,008 for crop, 234 for NPK fertilizer and 765 for 8-input fertilizer.

| Circuit design | What it does |
|---|---|
| Separable | Turns each qubit, no links |
| Angle + CNOT | Turns, then links neighbours |
| IQP | Links every pair (N talks directly to K) |
| Heisenberg | Qubits interact step by step |
| Re-uploading | Feeds the readings in three times for richer patterns |

**Choosing features with QUBO.** With only 99 fertilizer farms, hundreds of features would make the model memorise noise. QUBO (quadratic unconstrained binary optimisation) makes a yes/no choice for every feature. It rewards features that point to the right answer and penalises pairs that say the same thing, then keeps 1–8 features for fertilizer or 2–14 for crop. I also tried QAOA, a quantum algorithm built for this kind of problem. It got close (98–99% of the best score) but rarely found the very best set, so a classical solver does the actual picking. The most popular fertilizer feature was an entangled **N-with-K** measurement, chosen in 83% of runs.

### 3.4 Training and testing

<p align="center"><img src="docs/diagrams/05-training-pipeline.png" width="900" alt="Eight-step training pipeline"></p>

- **The circuits are fixed; only the classical model learns.** Trainable circuits are slow and often get stuck, and fixed ones keep the comparison fair.
- **No data leakage.** Scaling, filling missing values, building features and QUBO selection all run inside one scikit-learn pipeline, fitted on training farms only.
- **Tuning.** Optuna tries 30 (crop) or 40 (fertilizer) settings — the number of features, the circuit strength and how strict the SVM is — scored on inner practice splits.
- **Statistics.** Differences are checked with corrected t-tests (Holm correction) and paired sign tests.
- **Scale.** The full study ran on Modal in 53 minutes across 861 parallel jobs, with no failures.

**The few-example test.** Pick a few farms at random (for example 2 per crop), train all three SVMs on exactly those farms and test on every other farm. Repeat 20 times (crop) or 40 times (fertilizer), average the scores, then add more farms. All settings were fixed in advance.

### 3.5 Results

<p align="center"><img src="docs/images/results/results-1-edge-qsvm.png" width="840" alt="Crop learning curves"><br><sub><b>Crop.</b> Both quantum upgrades beat the classical SVM with 2–16 farms per crop. With 1 farm per crop the Q-SVM is best, and by 32 per crop all three reach about 98%.</sub></p>

<p align="center"><img src="docs/images/results/results-2-edge-qubo.png" width="840" alt="Fertilizer learning curves"><br><sub><b>Fertilizer (8 inputs).</b> Quantum features lift the SVM from 0.45 to 0.73 macro-F1 at 64 farms. Weather, soil type and crop type drown out the nutrients for a plain SVM; nutrient-based quantum features bring the focus back.</sub></p>

<p align="center"><img src="docs/images/results/results-3-verdict.png" width="840" alt="Takeaway"><br><sub><b>Takeaway.</b> Quantum upgrades beat the classical twin on 2 of 3 datasets, with the biggest gains when examples are few. On the simple NPK data the classical SVM was already near-perfect, and the Q-SVM matched it.</sub></p>

---

## 4. How each service works

### 4.1 Recommender

Picks the 8-input fertilizer model when all inputs are present, and otherwise uses the N/P/K model. The circuits run on a small NumPy simulator bundled with the service, so a prediction takes 5–100 ms on a CPU.

<p align="center"><img src="docs/diagrams/06-recommender-service.png" width="860" alt="Recommender service flow"></p>

### 4.2 Pest detection and the alert network

A farmer's photo goes to YOLOv8. If the farmer chooses to warn others, the server decides whether to send at once or wait for an officer.

<p align="center"><img src="docs/diagrams/07-pest-alert-sequence.png" width="900" alt="Pest photo to SMS alert sequence"></p>

**Who gets the SMS?** The 31 Karnataka districts and their 71 borders form a graph. A breadth-first search from the reported district finds everyone in range, and each farmer is placed in a zone by distance:

<p align="center"><img src="docs/diagrams/08-alert-zones.png" width="560" alt="Alert zones by hop distance"></p>

| Severity chosen by the farmer | How far it spreads |
|---|---|
| 🔴 Very bad | The district, its neighbours and their neighbours |
| 🟠 Spreading | The district and its neighbours |
| 🟡 A few pests | The district only |

Each farmer gets the SMS in their own language. Only officers can approve, reject or cancel alerts, or see phone numbers.

### 4.3 Farmer Library (RAG)

**Adding a book:** uploads are checked for duplicates (same file, same text or a near-copy), read page by page (old Kannada fonts are converted to Unicode), checked to be about farming, then indexed. **Answering a question:** the question is rewritten in English, searched by meaning and by keywords, reranked, and answered by an LLM using only the 8 best passages, with a citation after each fact.

<table>
<tr>
<th width="58%">Adding a book</th>
<th width="42%">Answering a question</th>
</tr>
<tr>
<td align="center" valign="top"><img src="docs/diagrams/09-rag-ingestion.png" width="400" alt="Book ingestion pipeline"></td>
<td align="center" valign="top"><img src="docs/diagrams/10-rag-question.png" width="280" alt="Question answering pipeline"></td>
</tr>
</table>

Each book has its own index, so "Ask this book" can only ever see that book, and adding or hiding a book never touches the others. Full write-up: [`services/agri-rag/docs/HOW-AGRIRAG-WORKS.md`](services/agri-rag/docs/HOW-AGRIRAG-WORKS.md).

### 4.4 Weather and weekly advice

<p align="center"><img src="docs/diagrams/11-weather-advice.png" width="860" alt="Weather alerts and weekly advice flow"></p>

Alert thresholds follow Indian Meteorological Department rain categories: 35.5 mm (yellow), 64.5 mm (orange) and 115.6 mm (red), plus heat (40 °C / 45 °C), cold (≤ 8 °C) and wind gusts (50 / 70 km/h).

<details>
<summary><b>API reference</b> (gateway, <code>http://localhost:5000/api</code>)</summary>

| Area | Endpoints |
|---|---|
| Accounts | `POST /auth/register`, `/auth/login`, `/auth/check-user` · `PUT /auth/profile` |
| OTP & SMS | `POST /otp/send`, `/otp/verify`, `/sms/send` · `GET /sms/log`, `/sms/status` |
| Pest alerts | `GET/POST /alerts`, `/districts`, `/farmers`, `/subscriptions`, `/pests` · officer: `POST /alerts/:id/approve`, `/alerts/:id/reject`, `PUT /alerts/:id/cancel` |
| Detection | `POST /pest/detect` (multipart `image`) |
| Recommendations | `POST /recommend/crop`, `/recommend/fertilizer` |
| Farmer Library | `GET /library/books` · `POST /library/upload`, `/library/url`, `/library/chat` |
| Weather & advice | `GET /weather/now`, `/weather/forecast`, `/weather/alerts`, `/advice` |
| AI helpers | `POST /ai/chat`, `/ai/crops`, `/ai/fertilizer`, `/ai/translate`, `/tts` |
| Health | `GET /health` |

</details>

---

## 5. Run it locally

**You need:** Node.js 18.17 or newer, Python 3.10–3.13 and about 3 GB of free disk. MongoDB, PyTorch and the models are installed for you.

```bash
git clone https://github.com/Akash-Sakala/AgriQNet-2.0.git
cd AgriQNet-2.0
cp .env.example .env       # Windows PowerShell: Copy-Item .env.example .env
                           # then add your API keys (see Configuration)
npm start                  # first run installs everything (≈10–15 min), then starts all services
```

Open **http://localhost:3000**, pick a language, and press **Try demo** (farmer) or **Officer demo**.

| Demo account | Phone | Password |
|---|---|---|
| Farmer (Bengaluru Urban) | `+91 0000000000` | `demo1234` |
| Agriculture officer | `+91 0000000001` | `officer123` |
| Second farmer, Lakshmi | `+91 0000000002` | `demo1234` |

| Command | What it does |
|---|---|
| `npm start` | Install if needed, then start everything |
| `npm run demo` | Start with clean demo data and no pest alerts (for a live demo) |
| `npm run reseed` | Reset the demo data, including sample alerts |
| `npm run status` | Show the health of every service |
| `npm start -- --only=api,web` | Start only some services |
| `npm run build` | Production build of both frontends |

Press **Ctrl+C** once to stop everything; your data is kept. A step-by-step live-demo script is in [`demo-photos/README.md`](demo-photos/README.md), and older detailed notes (Twilio trial setup, translations) are in [`docs/platform-notes.md`](docs/platform-notes.md).

<details>
<summary><b>Troubleshooting</b></summary>

- **"Port already in use"** — another copy is running; close it or change the port in `.env`.
- **The first start is slow** — PyTorch, YOLO and the search models download once.
- **Logs** — `%LOCALAPPDATA%\AgriQNet\logs` on Windows, `~/.agriqnet/logs` elsewhere.
- **Start with a fresh database** — stop the app, delete the `mongo-data` folder next to the logs, run `npm start`.
- **Books process slowly** — set `RAG_EMBED_MODEL=intfloat/multilingual-e5-small` in `.env`.

</details>

---

## 6. Configuration

Everything is configured in one `.env` file at the project root (template: `.env.example`). Never commit `.env`.

| Setting | Used for | Required? |
|---|---|---|
| `GEMINI_API_KEY` | Assistant, GenAI plans, pest advice, weekly advice, translation | Recommended |
| `GROQ_API_KEY` | Farmer Library answers (Gemini is the fallback) | Recommended |
| `VITE_OPENWEATHER_API_KEY` | Current weather and 5-day forecast | Recommended |
| `SMS_MODE`, `TWILIO_*` | OTP and alert SMS; `simulate` records messages without sending | Optional |
| `SARVAM_API_KEY` | Natural Kannada/Telugu/Hindi read-aloud | Optional |
| `AUTO_ALERT_CONFIDENCE` | How sure the photo model must be to send without an officer (default 0.6) | Optional |
| `RECOMMENDER_MODELS` | `v3` quantum-hybrid models (default) or `legacy` | Optional |
| `MONGO_URI` | Leave empty for the built-in database | Optional |

Without any keys, the recommenders, pest detection, alerts and maps still work; only the AI-written text features need keys.

---

## 7. Project structure

```
agriqnet-platform/
├── apps/
│   ├── web/              # Main app: farmer & officer screens, Alert Network map
│   └── weather/          # Weather station
├── services/
│   ├── api/              # Gateway: accounts, alerts, SMS, AI, database models, seed data
│   ├── recommender/      # Quantum-hybrid models + NumPy circuit simulator
│   ├── pest-detector/    # YOLOv8 pest model
│   └── agri-rag/         # Farmer Library (RAG)
├── scripts/              # One-command launcher, health check, translation tool
├── demo-photos/          # Sample pest photos + live-demo script
├── docs/
│   ├── demo_assets/      # Screenshots + manifest.json
│   ├── diagrams/         # Diagram images, Mermaid sources (src/) and build script
│   └── images/results/   # Model result figures
└── .env.example          # Configuration template
```

---

<div align="center"><sub>AgriQNet 2.0 · B.E. capstone project in AI & Machine Learning, BMS College of Engineering, Bengaluru</sub></div>
