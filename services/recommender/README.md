# Crop & Fertilizer Recommender API (AgriQNet v3 quantum-hybrid)

FastAPI service on port 8002, started by the platform launcher. By default it serves the **AgriQNet v3 quantum-hybrid
models** chosen by the full-budget nested-cross-validation study (`Capstone_v2_Akash-Sakala/Approach-v3`, Modal run
`full_seed42`). The quantum circuits run on an exact statevector simulator written in NumPy (the bundled `agriqnet`
package), so the service needs only the CPU and adds 5–100 ms per request.

| Endpoint | Body | Model used |
|---|---|---|
| `POST /api/crop_recommender/predict` | `{N, P, K, temperature, humidity, ph, rainfall}` | `models/v3/crop` |
| `POST /api/fertilizer_recommender/predict` | `{Nitrogen, Potassium, Phosphorous}` | `models/v3/fert_npk` |
| same, plus `temperature, humidity, moisture, soil_type, crop_type` | all eight inputs | `models/v3/fert_full8` |
| `GET /health` | – | status and the active models |
| `GET /api/models` | – | descriptions, chosen quantum features, nested-CV scores, self-test |

## Response

The response keeps the old `{prediction, details.confidence}` shape and adds more fields under `details`:

```json
{"prediction": "rice",
 "details": {"confidence": 0.9975,
             "top3": [{"label": "rice", "probability": 0.9975}, {"label": "jute", "probability": 0.0025}, …],
             "conformal_set": ["rice"], "conformal_level": 0.9,
             "model": {"id": "agriqnet-v3/crop", "name": "AgriQNet v3 quantum-hybrid", "qubits": 7, …}}}
```

- **`top3`**: the three most likely classes, with probabilities calibrated by temperature scaling.
- **`conformal_set`**: the classes that contain the right answer for about 90% of farms. It is estimated out of fold and always includes the top-1 prediction.
- **`model`**: which model answered, including the number of qubits used.

## The models

All three were refit with scikit-learn 1.7.2 on the same data as the study (checked with SHA-256), using the
configurations the study selected. For both fertilizer models, the refit predictions match the original run's model on
every training row.

| Folder | Model | Inputs | Nested-CV result (study) |
|---|---|---|---|
| `v3/crop` | Gaussian NB on the 7 readings + QUBO-selected quantum-circuit features (7 qubits) | 7 numbers | accuracy 99.41%, log-loss 0.0165 |
| `v3/fert_npk` | Soft vote of SVM + quantum features, quantum fidelity-kernel SVM (IQP circuit) and ExtraTrees + quantum features (3 qubits) | N, P, K | macro-F1 0.993, accuracy 99.6% |
| `v3/fert_full8` | ExtraTrees + QUBO-selected quantum features, including the entangled N–K correlator ⟨Y₃Y₄⟩ (6 qubits) | 8 inputs | macro-F1 0.995, accuracy 99.6% |

Two inputs to `v3/fert_full8` are mapped onto the training data's categories:
- `soil_type`: app names map as Red Soil → Red, Black Soil → Black, Clay Soil → Clayey, Sandy Soil → Sandy, Alluvial Soil → Loamy.
- `crop_type`: crops map to the training set's 11 groups, for example ragi → Millets, tur → Pulses, soybean → Oil seeds.

If a value can't be mapped, or any of the extra inputs is missing, the N/P/K model is used.

For crop, the study's overall pick was TabPFN + separable-circuit features (99.48%, log-loss 0.0129). It needs PyTorch, a large weight download and several seconds per request on a CPU, so the platform ships the best scikit-learn-only quantum hybrid instead; the two are statistically tied.

**Honest scope:** quantum-feature models are *non-inferior* to the best classical models here (no significant difference on any task). Their measured advantages are limited to low-data cases and kernel learners. See `RESULTS_FULL_RUN.md` in `Approach-v3`. All circuits are simulated classically.

## Fallback and versions

- The original v1 models (`models/crop_reco_best_artifacts.pkl`, `models/best_fertilizer_model.pkl`) are still loaded. They answer if a v3 model fails to load or fails its startup self-test. Set `RECOMMENDER_MODELS=legacy` in `.env` to force them.
- Each v3 folder holds `sample_input.csv` and `sample_proba.npy`. At startup the service checks the predictions match to within 1e-6, so a version mismatch shows up in `/health` → `v3_errors` instead of producing wrong answers silently.
- Requirements: `scikit-learn==1.7.2`, `numpy>=2`, `pandas`, `scipy`, `joblib`. PennyLane, Optuna and PyTorch are **not** needed at inference.
- To rebuild the models, run `export_platform_models.py` in `Approach-v3`, then copy its output folders into `models/v3/`.
