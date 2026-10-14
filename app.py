"""
Emotion classifier web app (Flask).

Model   : Stacked Bidirectional GRU trained on dair-ai/emotion
Labels  : sadness, joy, love, anger, fear, surprise
Input   : Keras Tokenizer(num_words=10000) -> pad/truncate 'post' to length 50
"""

import logging
import os
from pathlib import Path

# Quieter, lighter TensorFlow (must be set BEFORE importing tensorflow)
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

import joblib
import numpy as np
from flask import Flask, jsonify, render_template, request

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
ARTIFACT_DIR = BASE_DIR / "Artifacts"

# Order must match the notebook: emotion_dataset['train'].features['label'].names
LABELS = ["sadness", "joy", "love", "anger", "fear", "surprise"]
MAX_LEN = 50          # same maxlen used in pad_sequences during training
MAX_CHARS = 500       # input limit for the UI / API

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("emotion-ai")

app = Flask(__name__)


# --------------------------------------------------------------------------
# Artifact loading
# --------------------------------------------------------------------------
def _find_artifact(kind: str):
    """Find the model / tokenizer file regardless of name or letter-case.

    Linux (Render) is case-sensitive: 'Model.pkl' != 'model.pkl'.
    Searching by keyword avoids that whole class of bug.
    """
    if not ARTIFACT_DIR.exists():
        return None
    files = sorted(p for p in ARTIFACT_DIR.iterdir() if p.is_file())

    if kind == "model":
        for p in files:                      # preferred: native Keras format
            if p.suffix.lower() in {".keras", ".h5"}:
                return p
        for p in files:                      # fallback: joblib/pickle
            if p.suffix.lower() == ".pkl" and "token" not in p.name.lower():
                return p
    else:
        for p in files:
            if p.suffix.lower() in {".pkl", ".joblib"} and "token" in p.name.lower():
                return p
    return None


def _load_model(path: Path):
    if path.suffix.lower() in {".keras", ".h5"}:
        from tensorflow.keras.models import load_model
        return load_model(path, compile=False)
    return joblib.load(path)                 # a Keras model that was joblib-dumped


def load_artifacts():
    model_path = _find_artifact("model")
    tok_path = _find_artifact("tokenizer")
    if model_path is None or tok_path is None:
        raise FileNotFoundError(
            f"Could not find model/tokenizer in {ARTIFACT_DIR}. "
            f"Found: {[p.name for p in ARTIFACT_DIR.glob('*')] if ARTIFACT_DIR.exists() else 'folder missing'}"
        )
    log.info("Loading model     : %s", model_path.name)
    model = _load_model(model_path)
    log.info("Loading tokenizer : %s", tok_path.name)
    tokenizer = joblib.load(tok_path)        # joblib.load also reads plain pickle files
    log.info("Artifacts ready.")
    return model, tokenizer


MODEL, TOKENIZER, LOAD_ERROR = None, None, None
try:
    MODEL, TOKENIZER = load_artifacts()
except Exception as exc:                     # keep the site up so /health can explain what's wrong
    LOAD_ERROR = f"{type(exc).__name__}: {exc}"
    log.exception("Failed to load artifacts")


# --------------------------------------------------------------------------
# Inference
# --------------------------------------------------------------------------
def predict_emotion(text: str) -> dict:
    # Equivalent to: texts_to_sequences + pad_sequences(maxlen=50, padding='post', truncating='post')
    seq = TOKENIZER.texts_to_sequences([text])[0][:MAX_LEN]
    x = np.zeros((1, MAX_LEN), dtype="int32")
    x[0, : len(seq)] = seq

    probs = np.asarray(MODEL.predict(x, verbose=0))[0]
    best = int(np.argmax(probs))
    return {
        "emotion": LABELS[best],
        "confidence": round(float(probs[best]), 4),
        "probabilities": {LABELS[i]: round(float(p), 4) for i, p in enumerate(probs)},
        "known_words": len(seq),
    }


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html", max_chars=MAX_CHARS)


@app.post("/predict")
def predict():
    if MODEL is None:
        return jsonify(error="The model isn't loaded on the server yet. Check /health for details."), 503

    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()

    if not text:
        return jsonify(error="Type a sentence first."), 400
    if len(text) > MAX_CHARS:
        return jsonify(error=f"Keep it under {MAX_CHARS} characters."), 400

    try:
        return jsonify(predict_emotion(text))
    except Exception:
        log.exception("Prediction failed")
        return jsonify(error="Something went wrong while reading that sentence. Try again."), 500


@app.get("/health")
def health():
    ok = MODEL is not None
    return jsonify(status="ok" if ok else "error", error=LOAD_ERROR), (200 if ok else 503)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
