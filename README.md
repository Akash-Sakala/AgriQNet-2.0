<div align="center">

# 🌱 AgriQNet 2.0

**A multilingual farm assistant with quantum-hybrid crop and fertilizer recommenders, YOLOv8 pest detection, a district-level pest-alert SMS network, a citation-backed farm library (RAG) and agro-weather alerts — all started with one command.**

`React + Vite` · `Node/Express gateway` · `FastAPI micro-services` · `MongoDB` · `scikit-learn + NumPy statevector simulator` · `YOLOv8` · `multilingual RAG`

ಕನ್ನಡ · हिंदी · తెలుగు · English

</div>

<p align="center">
  <img src="docs/demo_assets/03-home-desktop.png" width="820" alt="AgriQNet home screen on desktop">
  <br><sub><b>Figure 1.</b> Farmer home: district weather, nearby pest alerts and six picture tiles.</sub>
</p>

---

## Contents

1. [What AgriQNet does](#1-what-agriqnet-does)
2. [System architecture](#2-system-architecture)
3. [How the quantum-hybrid models were trained](#3-how-the-quantum-hybrid-models-were-trained)
4. [Components and services](#4-components-and-services)
5. [The web app in screenshots](#5-the-web-app-in-screenshots)
6. [Set up and run](#6-set-up-and-run)
7. [Configuration](#7-configuration)
8. [Repository layout](#8-repository-layout)
9. [Publish to GitHub](#9-publish-to-github)

---

## 1. What AgriQNet does

| Farmer need | AgriQNet feature | Powered by |
|---|---|---|
| *"Which crop suits my soil?"* | **Which crop?** – soil and weather readings in, crop out, with confidence | AgriQNet v3 quantum-hybrid model (7 simulated qubits) |
| *"Which fertilizer, how much?"* | **Fertilizer** – N/P/K (or 8 inputs) in, fertilizer out; GenAI plan with dosage | Quantum-hybrid model (3 or 6 qubits) + Gemini |
| *"What is eating my crop?"* | **Pest photo** – photo → pest name → what to do → warn neighbours | YOLOv8 trained on IP102 (102 pests) |
| *"Is something coming my way?"* | **Alerts** and the officer's **Alert Network** map, SMS in the farmer's language | District graph + breadth-first search + Twilio |
| *"Will it rain? Can I spray?"* | **Weather** – district weather, 16-day forecast, rule-based farm alerts | OpenWeather + Open-Meteo |
| *"What does ICAR say about this?"* | **Farmer Library** – ask one book or the whole shelf; answers cite pages | AgriRAG: hybrid search + reranker + Groq/Gemini |
| *"Just tell me"* | **Ask** – district-aware chat, voice input and read-aloud | Gemini → Groq fallback, Sarvam TTS |

Designed for farmers first: language picked on the first screen, district instead of GPS, picture buttons with plain words, a **🔊 Listen** button on every card, a phone bottom bar, and SMS for family members on basic phones.

---

## 2. System architecture

### 2.1 Big picture

```mermaid
flowchart TB
  classDef ui fill:#F7F4EC,stroke:#1F4D3A,color:#13261E
  classDef gw fill:#1F4D3A,stroke:#1F4D3A,color:#ffffff
  classDef py fill:#ECE7FB,stroke:#5B3FD0,color:#13261E
  classDef db fill:#FBF0DC,stroke:#C9A227,color:#13261E
  classDef ext fill:#ffffff,stroke:#8A958C,color:#4A574F,stroke-dasharray:4 3

  subgraph Browser["Browser · phone or PC"]
    direction LR
    WEB["AgriQNet app<br/>React + Vite · :3000"]:::ui
    WX["Weather station<br/>React + Vite · :5175"]:::ui
  end

  API["API gateway<br/>Node + Express · :5000<br/>auth · OTP/SMS · alerts · AI proxy"]:::gw

  subgraph Local["Local services (started by npm start)"]
    direction TB
    DB[("MongoDB 7 · :27017<br/>embedded, persistent")]:::db
    YOLO["Pest detector<br/>FastAPI + YOLOv8 · :8001"]:::py
    REC["Recommender<br/>FastAPI + quantum-hybrid v3 · :8002"]:::py
    RAG["Farmer Library / AgriRAG<br/>FastAPI · :8003"]:::py
  end

  subgraph Cloud["External APIs (keys in .env)"]
    direction TB
    GEM["Gemini · Groq<br/>LLM answers & advice"]:::ext
    TW["Twilio<br/>OTP & alert SMS"]:::ext
    WXAPI["Open-Meteo · OpenWeather<br/>weather forecasts"]:::ext
    SV["Sarvam<br/>read-aloud voice"]:::ext
  end

  WEB -. "embeds" .-> WX
  Browser -- "/api (Vite proxy)" --> API
  API -- "HTTP / Mongo driver" --> Local
  API -. "AI · SMS · forecasts · voice" .-> Cloud
  Local -. "RAG answers" .-> Cloud

  style Browser fill:#FBF8F0,stroke:#DCD4BF
  style Local fill:#F6F4FB,stroke:#C9BFEF
  style Cloud fill:#FFFFFF,stroke:#DCD4BF,stroke-dasharray:4 3
```

| Service | Folder | Port | Tech | Role |
|---|---|---|---|---|
| AgriQNet app | `apps/web` | 3000 | React 19, Vite 6, Motion, d3-geo | Farmer + officer UI, Alert Network map |
| Weather station | `apps/weather` | 5175 | React, Tailwind, Vite | Weather, 16-day forecast, farm alerts |
| API gateway | `services/api` | 5000 | Node 18+, Express, Mongoose | One front door: auth, OTP, SMS, alerts, AI, proxies |
| MongoDB | `services/api/src/mongo-server.js` | 27017 | mongodb-memory-server (persistent) | Users, farmers, districts, alerts, SMS log |
| Pest detector | `services/pest-detector` | 8001 | FastAPI, Ultralytics YOLOv8 | 102-class IP102 pest detection |
| Recommender | `services/recommender` | 8002 | FastAPI, scikit-learn 1.7.2, NumPy | Quantum-hybrid crop & fertilizer models |
| Farmer Library | `services/agri-rag` | 8003 | FastAPI, PyMuPDF, multilingual-e5, BM25 | Book ingestion, per-book index, cited answers |

A single launcher (`scripts/launcher.mjs`) installs dependencies on first run, starts the services in order (MongoDB → API → Python services → frontends), waits for their health checks, and stops everything cleanly on **Ctrl+C**.

### 2.2 One request, end to end

```mermaid
sequenceDiagram
  autonumber
  actor F as Farmer (phone)
  participant W as Web app :3000
  participant A as API gateway :5000
  participant R as Recommender :8002
  participant G as Gemini / Groq
  F->>W: Which crop? → enters N, P, K, pH, rainfall…
  W->>A: POST /api/recommend/crop
  A->>R: POST /api/crop_recommender/predict
  R->>R: scale → 7-qubit circuit features → QUBO-selected columns → model
  R-->>A: prediction, calibrated top-3, 90% conformal set, model info
  A-->>W: JSON (+ source: local | hosted fallback)
  W-->>F: "Rice · 99.7%" card + 🔊 Listen (in the farmer's language)
  opt GenAI Advisor tab
    W->>A: POST /api/ai/crops
    A->>G: prompt with district, season, soil
    G-->>A: plan
    A-->>W: plan (translated & cached per language)
  end
```

### 2.3 Data model (MongoDB)

```mermaid
erDiagram
  USER ||--o| FARMER : "subscribes as"
  DISTRICT ||--o{ EDGE : "borders"
  DISTRICT ||--o{ FARMER : "home of"
  DISTRICT ||--o{ ALERT : "reported in"
  ALERT ||--o{ ALERT_RECIPIENT : "fans out to"
  FARMER ||--o{ ALERT_RECIPIENT : "receives"
  PEST ||--o{ ALERT : "names"
  USER {
    string phone
    string passwordHash
    string role "farmer | officer"
    string lang "en | hi | kn | te"
    string districtId
    array crops
  }
  FARMER {
    string id
    string phone
    string districtId
    string lang
    bool isDemo "never texted"
  }
  DISTRICT {
    string id
    string name
    object geo
    array majorCrops
  }
  ALERT {
    string id
    string pestType
    string severity "RED | ORANGE | YELLOW"
    string status "PENDING | ACTIVE | REJECTED"
    string reason "confident | corroborated | approved"
    object detection
  }
  ALERT_RECIPIENT {
    string alertId
    string farmerId
    string zone
    int hops
    string smsStatus
  }
```

Other collections: `Otp` (hashed, rate-limited codes), `SmsLog` (outbox), `Advice` (weekly district tips cached per day and language), `Counter` (atomic IDs).

---

## 3. How the quantum-hybrid models were trained

> This section follows the project presentation *AgriQNet: Hybrid Quantum ML for Farmers*. All circuits are **classically simulated** (3–7 qubits); no quantum computational advantage is claimed.

### 3.1 The question

New districts and new crops start with very few soil tests. AgriQNet asks: **can quantum computing help a classical model pick the right crop or fertilizer from only a handful of farm examples?**

The test is deliberately narrow and fair: take one standard model — the **support vector machine (SVM)** — build two quantum-upgraded versions, give all three exactly the same farms, and score them only on farms they have never seen.

| Dataset | Farms | Inputs | Predicts |
|---|---|---|---|
| Crop | 2,200 (100 per crop) | N, P, K, temperature, humidity, pH, rainfall | 1 of 22 crops |
| Fertilizer · NPK | 99 | N, P, K | 1 of 7 fertilizers |
| Fertilizer · 8 inputs | 99 | N, P, K, temperature, humidity, moisture, soil type, crop type | 1 of 7 fertilizers |

### 3.2 From soil readings to qubits

1. **Scale** each reading to between −1 and +1 (fitted on training farms only).
2. **Turn** a qubit by that value: `RY(s · x)`. The *bandwidth* `s` controls how strongly a change in the reading turns the qubit (small `s`: farms look alike; large `s`: small differences look big). Values 0.5–2 are explored.
3. **Link** qubits with CNOT gates in a ring (N → K → P → N), so the state depends on *combinations* of nutrients, not just each one alone.
4. **Measure** expectation values ⟨X⟩, ⟨Y⟩, ⟨Z⟩ on each qubit and ⟨XX⟩, ⟨YY⟩, ⟨ZZ⟩ on pairs — each average becomes one feature.

### 3.3 Two quantum upgrades for the classical SVM

```mermaid
flowchart TB
  classDef raw fill:#F7F4EC,stroke:#8A958C,color:#13261E
  classDef q fill:#ECE7FB,stroke:#5B3FD0,color:#13261E
  classDef m fill:#DCEBDD,stroke:#2A7040,color:#13261E
  classDef base fill:#FBF0DC,stroke:#C27A1A,color:#13261E

  IN["Farm readings<br/>N, P, K, weather…"]:::raw
  IN --> C0["Classical SVM<br/>'alike' = close numbers"]:::base

  IN --> FP["Upgrade 1 · one fixed circuit<br/>angle encoding + CNOT ring, s = 1.5"]:::q
  FP --> K["Fidelity kernel<br/>similarity = overlap of quantum fingerprints"]:::q
  K --> QSVM["Q-SVM"]:::m

  IN --> BANK["Upgrade 2 · feature bank<br/>15 fixed circuits → hundreds of features"]:::q
  BANK --> QUBO["QUBO selection<br/>keep useful, non-repeating features"]:::q
  QUBO --> QF["SVM + quantum features<br/>raw readings + selected features"]:::m
```

**Upgrade 1 – Q-SVM (quantum similarity).** Every farm passes through the same small circuit and comes out as a quantum *fingerprint*. The SVM judges how alike two farms are by how much their fingerprints overlap (the *kernel matrix*). Only the meaning of "similar" changes; the SVM itself is unchanged.

**Upgrade 2 – SVM + quantum features (better inputs).** A **feature bank** of 15 fixed, never-trained circuits views each farm in different ways:

| Circuit design | Strengths `s` | What it does |
|---|---|---|
| Separable | 0.5, 1, 1.5, 2 | Turns only, no links |
| Angle + CNOT | 1, 1.5 | Turns, then links neighbours |
| IQP | 0.5, 1, 1.5 | Links every pair (N with K directly) |
| Heisenberg | 0.5, 1, 2 | Qubits interact step by step |
| Re-uploading | 0.5, 1, 1.5 | Readings fed in three times |

That gives **1,008** features per crop farm (7 qubits), **234** per NPK farm (3) and **765** per 8-input farm (6). With only 99 fertilizer farms, using them all would memorise noise, so a **QUBO** (quadratic unconstrained binary optimisation) makes a yes/no choice for each feature that rewards *relevance to the answer* and penalises *pairs that say the same thing* (Mücke et al. relevance–redundancy objective). It keeps 1–8 features for fertilizer and 2–14 for crop.

QAOA, a quantum algorithm for QUBO, was tested too: it came close (approximation ratio 0.98–0.99) but rarely found the exact optimum, so a classical solver (exact search / simulated annealing) does the selection. The most frequently chosen fertilizer feature was an entangled **N-with-K correlator ⟨Y₃Y₄⟩**, picked in 83% of folds.

### 3.4 Training pipeline

```mermaid
flowchart TB
  classDef s fill:#F7F4EC,stroke:#8A958C,color:#13261E
  classDef q fill:#ECE7FB,stroke:#5B3FD0,color:#13261E
  classDef out fill:#DCEBDD,stroke:#2A7040,color:#13261E

  subgraph Row1[" "]
    direction LR
    A["1 · Soil test<br/>N, P, K, weather,<br/>soil & crop type"]:::s --> B["2 · Clean & scale<br/>impute gaps, scale to ±1<br/>fit on training folds only"]:::s
    B --> C["3 · Quantum circuits<br/>fingerprints for Q-SVM<br/>15-circuit feature bank"]:::q
    C --> D["4 · QUBO selection<br/>relevance − redundancy"]:::q
  end
  subgraph Row2[" "]
    direction RL
    E["5 · Models<br/>classical SVM · Q-SVM · SVM+QF<br/>+ tuned model zoo"]:::s --> F["6 · Fair test<br/>nested CV · Optuna<br/>scored on unseen farms"]:::s
    F --> G["7 · Confidence<br/>temperature calibration<br/>top-3 · 90% conformal set"]:::s
    G --> H["8 · Serve<br/>joblib pipeline + manifest<br/>in the app, 4 languages"]:::out
  end
  D --> E
  style Row1 fill:none,stroke:none
  style Row2 fill:none,stroke:none
```

- **Circuits stay fixed; only the classical model learns.** Trainable circuits are slow and often get stuck; fixed ones keep the comparison fair.
- **Nothing leaks.** Scaling, imputation, feature building and QUBO selection all live inside one scikit-learn `Pipeline`, fitted inside each training fold.
- **Tuning.** Optuna tries 30 (crop) or 40 (fertilizer) combinations — number of features, circuit strength `s`, SVM strictness — scored on inner practice splits.
- **Statistics.** Nadeau–Bengio corrected t-tests with Holm correction against raw features of the same learner; Wilcoxon/sign tests over paired learning-curve runs.
- **Full study.** Ran on Modal (parallel CPU containers + GPUs for TabPFN): 861 work units, 52.6 min, 0 failures.

**The few-example test (how the results below were measured).** Pick a few farms at random (for example 2 per crop), train all three SVMs on exactly those farms, test on every farm they did not see, repeat 20 times (crop) or 40 times (fertilizer), average, then add more farms. All settings were fixed in advance so no SVM gets an unfair edge.

### 3.5 Results

<p align="center">
  <img src="docs/images/results/results-1-edge-qsvm.png" width="860" alt="Crop learning curves: Q-SVM and SVM with quantum features beat the classical SVM from 2 to 16 farms per crop">
  <br><sub><b>Figure 2.</b> Crop: both quantum upgrades beat the classical SVM when farms are few (2–16 per crop); all meet near 98% at 32 per crop.</sub>
</p>

<p align="center">
  <img src="docs/images/results/results-2-edge-qubo.png" width="860" alt="Fertilizer 8-input learning curves: SVM with quantum features reaches 0.73 macro-F1 versus 0.45 for the classical SVM">
  <br><sub><b>Figure 3.</b> Fertilizer (8 inputs): QUBO-selected quantum features lift the SVM from 0.45 to 0.73 macro-F1 at 64 farms (+28.6 points).</sub>
</p>

<p align="center">
  <img src="docs/images/results/results-3-verdict.png" width="860" alt="Takeaway: quantum upgraded the classical SVM on 2 of 3 datasets">
  <br><sub><b>Figure 4.</b> Takeaway: quantum upgrades help on 2 of 3 datasets, and only when examples are few.</sub>
</p>

**Why it works:** the circuits give the SVM a richer sense of which farms are alike, including combinations such as N with K. On the 8-input fertilizer data, weather, soil type and crop type say little about the right bag and drown out the nutrients for a distance-based SVM; nutrient-derived quantum features put the focus back. **When it matters:** with few examples. With plenty of data the classical model catches up.

**Honest scope (full-data nested CV):** at full data no quantum arm was significantly better than raw features of the same learner (21 comparisons, all non-significant), and separable (no-entanglement) circuits did as well as or better than entangled ones — the useful ingredient is the structured, bandwidth-limited trigonometric encoding, which is classically simulable.

### 3.6 What the app actually serves

The platform ships the best **quantum-hybrid** pipeline from the full-budget study for each task (non-inferior to the best classical model, 99.5–100% out of fold):

| Task | Served model | Qubits | Nested-CV result |
|---|---|---|---|
| Crop (`models/v3/crop`) | Gaussian NB on the 7 readings + QUBO-selected circuit features | 7 | accuracy 99.41%, log-loss 0.0165 |
| Fertilizer NPK (`models/v3/fert_npk`) | Soft vote: SVM + quantum features, quantum fidelity-kernel SVM (IQP), ExtraTrees + quantum features | 3 | macro-F1 0.993 |
| Fertilizer 8 inputs (`models/v3/fert_full8`) | ExtraTrees + QUBO-selected features incl. ⟨Y₃Y₄⟩ | 6 | macro-F1 0.995 |

Every response carries a calibrated **top-3**, a **90% conformal set** and the model ID. At start-up each model re-predicts a stored sample and must match to within 1e-6, otherwise the service falls back to the v1 models and reports it on `/health`.

---

## 4. Components and services

### 4.1 Recommender service (`:8002`)

```mermaid
flowchart LR
  classDef q fill:#ECE7FB,stroke:#5B3FD0,color:#13261E
  classDef s fill:#F7F4EC,stroke:#8A958C,color:#13261E
  classDef d fill:#FBF0DC,stroke:#C27A1A,color:#13261E

  REQ["POST /recommend/fertilizer<br/>N, P, K (+ temp, humidity,<br/>moisture, soil, crop)"]:::s --> CHK{"all 8 inputs<br/>and mappable?"}:::d
  CHK -- yes --> M8["fert_full8 pipeline<br/>6 qubits"]:::q
  CHK -- no --> M3["fert_npk pipeline<br/>3 qubits"]:::q
  M8 --> OUT
  M3 --> OUT["prediction · top-3 ·<br/>conformal set · model info"]:::s
  M8 -. "load or self-test failed" .-> LEG["v1 legacy models"]:::d
  M3 -.-> LEG
```

Inside each pipeline: imputer → scaler → **NumPy statevector simulator** (bundled `agriqnet` package, exact expectation values, 5–100 ms per request) → selected quantum columns → classifier → temperature calibration → conformal set. No PennyLane, GPU or PyTorch is needed at inference. App soil names map to the training categories (e.g. *Red Soil → Red*, *ragi → Millets*).

### 4.2 Pest detection and the pest-alert network

```mermaid
sequenceDiagram
  autonumber
  actor F as Farmer
  participant W as Web app
  participant A as API gateway
  participant Y as YOLOv8 :8001
  participant DB as MongoDB
  participant S as Twilio SMS
  actor O as Officer
  F->>W: Pest photo (camera or gallery)
  W->>A: POST /api/pest/detect (multipart image)
  A->>Y: POST /detect
  Y-->>A: pest, confidence, boxes (top 5)
  A-->>W: local pest name, host crop, IPM tips (+ AI advice)
  F->>W: "Yes, warn nearby farmers" + severity
  W->>A: POST /api/alerts
  alt confidence ≥ 0.6 or a 2nd farmer reported it within 72 h
    A->>DB: BFS over district graph → zone per farmer
    A->>S: SMS in each farmer's language
    A-->>W: "Warning sent to N farmers in M districts"
  else needs review
    A->>DB: Alert PENDING
    O->>A: Approve & send (or reject)
    A->>DB: BFS → recipients
    A->>S: SMS
  end
  Note over W,O: Alert Network map polls every 4 s → ripple + toast on the new zone
```

**Zones by graph distance.** The 31 Karnataka districts and 71 borders form a graph. Severity sets how far the warning spreads; hop distance sets each farmer's zone.

```mermaid
flowchart LR
  classDef red fill:#C0392B,stroke:#8E2A1F,color:#fff
  classDef orange fill:#E38B2C,stroke:#B5651D,color:#fff
  classDef yellow fill:#E9C93B,stroke:#B89A1E,color:#13261E
  R0["Reported district<br/>0 hops → RED"]:::red --- O1["Neighbour<br/>1 hop → ORANGE"]:::orange --- Y2["Neighbour's neighbour<br/>2 hops → YELLOW"]:::yellow
  R0 --- O2["Neighbour<br/>1 hop → ORANGE"]:::orange
```

| Severity chosen | Spread (BFS depth) | Who is texted |
|---|---|---|
| 🔴 Very bad | 2 hops | Reported district, neighbours and their neighbours |
| 🟠 Spreading | 1 hop | Reported district and neighbours |
| 🟡 A few pests | 0 hops | Reported district only |

Seeded demo farmers are flagged `isDemo` and are never texted; `SMS_MODE=simulate` records messages without sending. Only officers can approve, reject or cancel alerts and see phone numbers.

### 4.3 Farmer Library — AgriRAG (`:8003`)

```mermaid
flowchart TB
  classDef step fill:#EAF2EC,stroke:#1F4D3A,color:#13261E
  classDef stop fill:#FBE9E7,stroke:#B23A2E,color:#5A1A12
  classDef dup fill:#FBF3DC,stroke:#C9A227,color:#13261E
  classDef done fill:#1F4D3A,stroke:#1F4D3A,color:#ffffff

  U["Upload a PDF or paste a link"]:::step --> CK{"Duplicate?<br/>file SHA-256 · text hash ·<br/>MinHash Jaccard ≥ 0.85"}:::dup
  CK -- yes --> OPEN["Open the existing book's chat"]:::dup
  CK -- no --> RD["Read<br/>PyMuPDF text per page · headings ·<br/>Nudi/Baraha Kannada → Unicode"]:::step
  RD -- "no text layer" --> X1["Rejected: scanned pages"]:::stop
  RD --> TP["Topic check (1 LLM call)<br/>title, summary, questions in 4 languages"]:::step
  TP -- "not farming" --> X2["Rejected: not agriculture"]:::stop
  TP --> IX["Index<br/>~1,100-char page-aware chunks →<br/>multilingual-e5 vectors + BM25 (one index per book)"]:::step
  IX --> CV["Cover"]:::step --> OK["Ready on the shelf"]:::done
```

```mermaid
flowchart LR
  classDef llm fill:#F3EEF7,stroke:#6B4C8A,color:#13261E
  classDef srch fill:#EAF2EC,stroke:#1F4D3A,color:#13261E
  classDef out fill:#FBF3DC,stroke:#C9A227,color:#13261E

  Q["Question in any language<br/>scope: one book or whole library"]:::out --> U["Rewrite (fast LLM)<br/>English query + keywords"]:::llm
  U --> D["Dense search<br/>multilingual-e5"]:::srch
  U --> B["Keyword search<br/>BM25"]:::srch
  D --> F["Fuse (RRF)<br/>top 40"]:::srch
  B --> F
  F --> R["Rerank<br/>multilingual cross-encoder → 8"]:::srch
  R --> A["Answer (Groq, Gemini fallback)<br/>only from the 8 passages, cites [n]"]:::llm
  A --> O["Answer + 🔊 + source cards<br/>tap [n] → PDF opens at that page"]:::out
```

Why one index per book: *Ask this book* can only ever see that book, hiding or adding a book never rewrites another index, and a laptop-sized library fits in memory for exact search. More detail: [`services/agri-rag/docs/HOW-AGRIRAG-WORKS.md`](services/agri-rag/docs/HOW-AGRIRAG-WORKS.md).

### 4.4 Weather service and weekly district advice

```mermaid
flowchart LR
  classDef src fill:#ffffff,stroke:#8A958C,color:#4A574F,stroke-dasharray:4 3
  classDef s fill:#EAF2F8,stroke:#2E6DA4,color:#13261E
  classDef out fill:#F7F4EC,stroke:#1F4D3A,color:#13261E

  OW["OpenWeather<br/>current · 5-day · search · map layers"]:::src --> WX["Weather station :5175"]:::s
  OM["Open-Meteo<br/>16-day daily forecast (no key)"]:::src --> RULES["Rule engine (API)<br/>IMD rain categories · heat · cold ·<br/>wind gusts · thunderstorm codes"]:::s
  RULES --> WA["Farm weather alerts<br/>RED / ORANGE / YELLOW, 4 languages"]:::out
  RULES --> ADV
  ALERTS["Active pest alerts<br/>reaching the district (BFS)"]:::src --> ADV["Weekly advice<br/>district + season + crops + forecast<br/>(Gemini, cached per day & language)"]:::s
  ADV --> HOME["'This week in {district}' on Home"]:::out
  WA --> WX
  WA --> SMS["Optional SMS<br/>POST /weather/alerts/notify"]:::out
```

Thresholds: rain ≥ 35.5 mm (yellow), ≥ 64.5 mm (orange), ≥ 115.6 mm (red); max temperature ≥ 40 °C (orange), ≥ 45 °C (red); min ≤ 8 °C; gusts ≥ 50 / ≥ 70 km/h.

### 4.5 API gateway (`:5000`)

| Area | Endpoints |
|---|---|
| Accounts | `POST /auth/check-user`, `/auth/register`, `/auth/login` · `PUT /auth/profile` (bcrypt passwords, signed tokens) |
| OTP & SMS | `POST /otp/send`, `/otp/verify`, `/sms/send` · `GET /sms/log`, `/sms/status` |
| Pest alerts | `GET/POST /districts`, `/districts/edges`, `/farmers`, `/alerts`, `/subscriptions`, `/pests` · officer: `POST /alerts/:id/approve`, `/alerts/:id/reject`, `PUT /alerts/:id/cancel` |
| Detection | `POST /pest/detect` (multipart `image`; `?fallback=gemini`) |
| Recommenders | `POST /recommend/crop`, `/recommend/fertilizer` |
| Farmer Library | `GET /library/books`, `POST /library/upload`, `/library/url`, `/library/chat` |
| Weather | `GET /weather/now`, `/weather/forecast`, `/weather/alerts` · `POST /weather/alerts/notify` |
| Helpers | `GET /advice`, `POST /ai/translate`, `POST /tts`, `POST /ai/*` (Gemini → Groq) |
| Health | `GET /health` (or `npm run status`) |

All AI keys stay on the server; the browser never sees them.

---

## 5. The web app in screenshots

Captured from the running app at `http://localhost:3000`. The images, their titles and captions are in [`docs/demo_assets/`](docs/demo_assets) with a [`manifest.json`](docs/demo_assets/manifest.json) in story order, ready to reuse as demo-video scenes; PNG renders of every diagram in this README are in [`docs/diagrams/`](docs/diagrams).

### Getting started

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/01-language-choice-phone.jpg" width="200"><br><sub><b>Fig. 5</b> Choose your language</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/02-login-phone.jpg" width="200"><br><sub><b>Fig. 6</b> Login and demo accounts</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/04-home-phone.jpg" width="200"><br><sub><b>Fig. 7</b> Farmer home (phone)</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/06-home-kannada-phone.jpg" width="200"><br><sub><b>Fig. 8</b> Instant switch to Kannada</sub></td>
</tr>
</table>

### Crop and fertilizer recommenders (quantum-hybrid)

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/09-crop-model-inputs-phone.jpg" width="200"><br><sub><b>Fig. 9</b> Crop model inputs</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/10-crop-result-phone.jpg" width="200"><br><sub><b>Fig. 10</b> Rice · 99.7% · 7 simulated qubits</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/11-fertilizer-genai-phone.jpg" width="200"><br><sub><b>Fig. 11</b> Fertilizer calculator</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/12-fertilizer-result-phone.jpg" width="200"><br><sub><b>Fig. 12</b> Urea · 3 simulated qubits</sub></td>
</tr>
</table>

### Pest photo → warning

<table>
<tr>
<td align="center" width="20%"><img src="docs/demo_assets/13-pest-photo-start-phone.jpg" width="170"><br><sub><b>Fig. 13</b> Take or choose a photo</sub></td>
<td align="center" width="20%"><img src="docs/demo_assets/14-pest-detected-phone.jpg" width="170"><br><sub><b>Fig. 14</b> YOLOv8 names the pest</sub></td>
<td align="center" width="20%"><img src="docs/demo_assets/15-pest-advice-phone.jpg" width="170"><br><sub><b>Fig. 15</b> What to do now</sub></td>
<td align="center" width="20%"><img src="docs/demo_assets/16-pest-warn-severity-phone.jpg" width="170"><br><sub><b>Fig. 16</b> How bad is it?</sub></td>
<td align="center" width="20%"><img src="docs/demo_assets/17-pest-warn-send-phone.jpg" width="170"><br><sub><b>Fig. 17</b> Districts that get the SMS</sub></td>
</tr>
</table>

### Alerts and the Alert Network

<table>
<tr>
<td align="center" width="25%"><img src="docs/demo_assets/18-alerts-farmer-phone.jpg" width="200"><br><sub><b>Fig. 18</b> Alerts for my district</sub></td>
<td align="center" width="25%"><img src="docs/demo_assets/19-alerts-weather-sms-phone.jpg" width="200"><br><sub><b>Fig. 19</b> Weather alerts · SMS for basic phones</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/20-alert-network-map-desktop.png" width="420"><br><sub><b>Fig. 20</b> Alert Network: red/orange zones around an outbreak</sub></td>
</tr>
</table>

<p align="center"><img src="docs/demo_assets/21-officer-alert-history-desktop.png" width="700"><br><sub><b>Fig. 21</b> Officer view: districts, registered farmers, active alerts and history</sub></p>

### Weather

<table>
<tr>
<td align="center" width="50%"><img src="docs/demo_assets/07-weather-station-desktop.png" width="420"><br><sub><b>Fig. 22</b> Weather station for the farmer's district</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/08-weather-forecast-desktop.png" width="420"><br><sub><b>Fig. 23</b> AI farm decisions + 16-day forecast</sub></td>
</tr>
</table>

### Farmer Library and Ask

<table>
<tr>
<td align="center" width="50%"><img src="docs/demo_assets/22-farmer-library-desktop.png" width="420"><br><sub><b>Fig. 24</b> Farmer Library shelf</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/23-library-chat-citations-desktop.png" width="420"><br><sub><b>Fig. 25</b> Ask a book — answers cite pages</sub></td>
</tr>
<tr>
<td align="center" width="50%"><img src="docs/demo_assets/24-ask-assistant-desktop.png" width="420"><br><sub><b>Fig. 26</b> Ask anything (district-aware assistant)</sub></td>
<td align="center" width="50%"><img src="docs/demo_assets/05-home-tiles-phone.jpg" width="200"><br><sub><b>Fig. 27</b> Six picture tiles with read-aloud</sub></td>
</tr>
</table>

---

## 6. Set up and run

**Prerequisites:** Node.js ≥ 18.17 (LTS), Python 3.10–3.13, Git, about 3 GB free disk. MongoDB, PyTorch and the models are installed by the launcher.

```bash
# 1. Get the code
git clone https://github.com/Akash-Sakala/AgriQNet-2.0.git
cd AgriQNet-2.0

# 2. Configure (the launcher also creates .env from .env.example on first run)
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
#    then add GEMINI_API_KEY, GROQ_API_KEY and VITE_OPENWEATHER_API_KEY (see §7)

# 3. Install everything and start all services
npm start                       # first run ≈ 10–15 min (npm, Python venv, PyTorch CPU, models)

# 4. Open the app
#    http://localhost:3000   → choose a language → "Try demo" or "Officer demo"
```

| Demo account | Phone | Password |
|---|---|---|
| Farmer (Bengaluru Urban) | `+91 0000000000` | `demo1234` |
| Agriculture officer | `+91 0000000001` | `officer123` |
| Second farmer, Lakshmi | `+91 0000000002` | `demo1234` |

Everyday commands:

```bash
npm start                         # set up if needed, then start everything
npm start -- --open               # …and open the browser
npm start -- --only=api,web       # start only some services (MongoDB is added automatically)
npm start -- --skip=rag,weather   # start everything except some services
npm run demo                      # clean demo data with zero pest alerts (live demo)
npm run demo:reset                # reset demo data while running
npm run reseed                    # wipe and reseed demo data (with sample alerts), then start
npm run status                    # health of every service
npm run build                     # production builds of both frontends
npm run i18n && npm run i18n:check   # fill / verify Hindi, Kannada, Telugu strings
```

Live-demo script (an outbreak filling the Karnataka map): [`demo-photos/README.md`](demo-photos/README.md). Twilio trial setup and translation workflow: [`docs/platform-notes.md`](docs/platform-notes.md).

Press **Ctrl+C** once to stop everything; MongoDB shuts down cleanly and data is kept. Runtime files (venv, MongoDB data, logs, Farmer Library) live outside the repo in `%LOCALAPPDATA%\AgriQNet` (Windows) or `~/.agriqnet` (macOS/Linux); override with `AGRIQNET_HOME`.

<details>
<summary><b>Troubleshooting</b></summary>

- **Port already in use** — an old copy is still running; close it or change the port in `.env`.
- **First start is slow** — the Python services download PyTorch, YOLO and the embedding models once.
- **Logs** — `%LOCALAPPDATA%\AgriQNet\logs\<service>.log`.
- **Fresh database** — stop, delete `%LOCALAPPDATA%\AgriQNet\mongo-data`, `npm start`.
- **Reinstall Python packages** — delete `%LOCALAPPDATA%\AgriQNet\venv`, `npm start`.
- **Slow book processing** — set `RAG_EMBED_MODEL=intfloat/multilingual-e5-small`.
- **Gemini free tier exhausted** — the API falls back to other Gemini models, then Groq (text features).

</details>

---

## 7. Configuration

One `.env` at the repository root configures every service (template: `.env.example`). **Never commit `.env`** — it is in `.gitignore`.

| Key | Needed for |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Ask, GenAI crop/fertilizer plans, pest advice, weekly advice, translation |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FAST_MODEL` | Farmer Library answers and query rewriting (Gemini fallback) |
| `VITE_OPENWEATHER_API_KEY` | Weather station current weather, 5-day forecast, search, map layers |
| `SMS_MODE` (`auto` / `simulate`), `TWILIO_*` | OTP and pest/weather SMS (a Twilio trial texts verified numbers only) |
| `SARVAM_API_KEY` | Natural Kannada/Telugu/Hindi read-aloud when the device has no voice |
| `AUTO_ALERT_CONFIDENCE` (0.6) | Photo confidence needed to send a farmer's report without an officer |
| `RECOMMENDER_MODELS` (`v3` / `legacy`) | Quantum-hybrid v3 models (default) or the original v1 models |
| `RAG_EMBED_MODEL`, `RAG_RERANK_MODEL`, `HF_TOKEN`, `LIBRARY_*` | Farmer Library models, covers, autoseed and crawl schedule |
| `MONGO_URI` | Leave empty for the embedded MongoDB, or point to Atlas/your server |
| `*_PORT`, `AGRIQNET_HOME` | Ports and the runtime folder |

---

## 8. Repository layout

```
agriqnet-platform/
├── apps/
│   ├── web/                 # AgriQNet app (React + Vite) — farmer & officer UI, Alert Network
│   ├── weather/             # Weather station (React + Tailwind)
│   └── pest-dashboard/      # legacy dashboard (replaced by Alert Network; not started)
├── services/
│   ├── api/                 # Express gateway, Mongo models, seed data, i18n, alert engine
│   ├── pest-detector/       # FastAPI + YOLOv8 (best.pt, IP102)
│   ├── recommender/         # FastAPI + quantum-hybrid v3 models + bundled `agriqnet` simulator
│   ├── agri-rag/            # Farmer Library (AgriRAG) + docs/HOW-AGRIRAG-WORKS.md
│   └── requirements.txt     # shared Python requirements
├── scripts/                 # launcher, status check, i18n translator
├── demo-photos/             # sample pest photos + live-demo script
├── docs/
│   ├── images/results/      # model result figures
│   ├── diagrams/            # PNG renders of the Mermaid diagrams in this README
│   ├── demo_assets/         # app screenshots + manifest.json (video scenes)
│   └── platform-notes.md    # previous detailed platform notes (live-demo script, Twilio, i18n)
├── .env.example
└── package.json             # npm start / demo / status / build
```

---

## 9. Publish to GitHub

Run these from the project folder (PowerShell or Git Bash). The remote repository `Akash-Sakala/AgriQNet-2.0` should already exist on GitHub and be empty.

```bash
# 1. Go to the project
cd "C:\Users\akash\OneDrive\Desktop\capstone\Final_Components\agriqnet-platform"

# 2. (optional) keep the stray root PDF out of the repo — it duplicates library-sources/
Add-Content .gitignore "ANNUAL HIGHLIGHTS 2025-26.pdf"     # Git Bash: echo "ANNUAL HIGHLIGHTS 2025-26.pdf" >> .gitignore

# 3. Create the repository on the main branch
git init
git branch -M main

# 4. Stage everything, then check that .env, node_modules/ and library-sources/ are NOT listed
git add .
git status

# 5. Commit
git commit -m "AgriQNet 2.0: platform, quantum-hybrid recommenders, docs and demo assets"

# 6. Connect the GitHub remote and push
git remote add origin https://github.com/Akash-Sakala/AgriQNet-2.0.git
git push -u origin main
```

If `git commit` asks who you are, set it once with `git config --global user.name "Akash Sakala"` and `git config --global user.email "<your GitHub email>"`. If the remote already has a README or licence, run `git pull --rebase origin main` before pushing. The YOLO weights (`services/pest-detector/best.pt`, ~37 MB) are under GitHub's 100 MB file limit, so no Git LFS is needed.

---

<sub>AgriQNet 2.0 · B.E. AI & ML capstone, BMS College of Engineering, Bengaluru. Quantum circuits are simulated classically; results are a benchmark, not a quantum-advantage claim.</sub>
