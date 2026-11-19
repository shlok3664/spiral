from functools import lru_cache
from io import BytesIO

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.inference import ROOT, predict_rows


TEST_DATA_PATH = ROOT / "data" / "KDDTest.parquet"
NSL_KDD_COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins",
    "logged_in", "num_compromised", "root_shell", "su_attempted", "num_root",
    "num_file_creations", "num_shells", "num_access_files", "num_outbound_cmds",
    "is_host_login", "is_guest_login", "count", "srv_count", "serror_rate",
    "srv_serror_rate", "rerror_rate", "srv_rerror_rate", "same_srv_rate",
    "diff_srv_rate", "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
    "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate",
    "dst_host_serror_rate", "dst_host_srv_serror_rate", "dst_host_rerror_rate",
    "dst_host_srv_rerror_rate", "class", "classnum",
]

ATTACK_CATEGORIES = {
    "DoS": {
        "apache2", "back", "land", "mailbomb", "neptune", "pod", "processtable",
        "smurf", "teardrop", "udpstorm",
    },
    "Probe": {"ipsweep", "mscan", "nmap", "portsweep", "saint", "satan"},
    "R2L": {
        "ftp_write", "guess_passwd", "httptunnel", "imap", "multihop", "named",
        "phf", "sendmail", "snmpgetattack", "snmpguess", "spy", "warezclient",
        "warezmaster", "worm", "xlock", "xsnoop",
    },
    "U2R": {"buffer_overflow", "loadmodule", "perl", "ps", "rootkit", "sqlattack", "xterm"},
}

README_METRICS = [
    {
        "model": "Random Forest",
        "accuracy": 0.790,
        "attack_precision": 0.969,
        "attack_recall": 0.652,
        "missed_attacks": 4469,
        "false_alarms": 266,
    },
    {
        "model": "Logistic Regression",
        "accuracy": 0.752,
        "attack_precision": 0.916,
        "attack_recall": 0.621,
        "missed_attacks": 4863,
        "false_alarms": 734,
    },
    {
        "model": "XGBoost",
        "accuracy": 0.794,
        "attack_precision": 0.968,
        "attack_recall": 0.660,
        "missed_attacks": 4368,
        "false_alarms": 282,
    },
]


class PredictRequest(BaseModel):
    features: dict[str, object]


app = FastAPI(title="Spiral IDS API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_replay_data():
    plus_path = ROOT / "data" / "KDDTest+.txt"
    if plus_path.is_file():
        return pd.read_csv(plus_path, header=None, names=NSL_KDD_COLUMNS), plus_path.name
    if TEST_DATA_PATH.is_file():
        return pd.read_parquet(TEST_DATA_PATH), TEST_DATA_PATH.name
    return None, None


def _category_for_label(label):
    normalized = str(label).strip().lower().rstrip(".")
    if normalized == "normal":
        return "Normal"
    for category, labels in ATTACK_CATEGORIES.items():
        if normalized in labels:
            return category
    return "Other"


@lru_cache(maxsize=1)
def _replay():
    rows, filename = _read_replay_data()
    if rows is None:
        return None

    predictions = predict_rows(rows)
    if "class" not in rows:
        raise ValueError(f"Replay dataset {filename} has no 'class' column")
    normalized_labels = rows["class"].astype(str).str.strip().str.lower().str.rstrip(".")
    replay_rows = []
    for index, prediction in enumerate(predictions):
        row = rows.iloc[index]
        replay_rows.append({
            "row": index + 1,
            "protocol": str(row.get("protocol_type", "unknown")),
            "service": str(row.get("service", "unknown")),
            "src_bytes": int(row.get("src_bytes", 0)),
            "dst_bytes": int(row.get("dst_bytes", 0)),
            "label": prediction["label"],
            "confidence": prediction["confidence"],
            "attack_probability": prediction["attack_probability"],
            "true_label": normalized_labels.iloc[index],
            "category": _category_for_label(normalized_labels.iloc[index]),
        })

    return {"filename": filename, "rows": replay_rows}


def _dataset_source(replay):
    return "Replay of NSL-KDD test set" if replay is not None else "Unavailable"


@app.get("/api/stats")
def get_stats():
    replay = _replay()
    if replay is None:
        return {
            "status": "unavailable",
            "source": "Unavailable",
            "total_flows": None,
            "attacks_detected": None,
            "detection_rate": None,
            "false_positive_rate": None,
            "traffic": [],
            "categories": [],
            "detection_by_category": [],
        }

    rows = replay["rows"]
    attacks = [row for row in rows if row["label"] == "attack"]
    true_attacks = [row for row in rows if row["true_label"] != "normal"]
    true_normals = [row for row in rows if row["true_label"] == "normal"]
    caught_attacks = sum(row["label"] == "attack" for row in true_attacks)
    false_alarms = sum(row["label"] == "attack" for row in true_normals)
    category_counts = {}
    for row in rows:
        category = row["category"]
        category_counts[category] = category_counts.get(category, 0) + 1
    category_detection = {
        name: {"name": name, "caught": 0, "missed": 0, "total": 0}
        for name in ("DoS", "Probe", "R2L", "U2R")
    }
    for row in rows:
        category = category_detection.get(row["category"])
        if category is None:
            continue
        category["total"] += 1
        category["caught" if row["label"] == "attack" else "missed"] += 1

    bucket_count = min(24, max(1, len(rows)))
    traffic = []
    for bucket_index in range(bucket_count):
        start = bucket_index * len(rows) // bucket_count
        end = (bucket_index + 1) * len(rows) // bucket_count
        batch = rows[start:end]
        traffic.append({
            "bucket": bucket_index + 1,
            "flows": len(batch),
            "attacks": sum(row["label"] == "attack" for row in batch),
        })

    return {
        "status": "available",
        "source": _dataset_source(replay),
        "dataset_file": replay["filename"],
        "total_flows": len(rows),
        "attacks_detected": len(attacks),
        "detection_rate": caught_attacks / len(true_attacks) if true_attacks else None,
        "false_positive_rate": false_alarms / len(true_normals) if true_normals else None,
        "traffic": traffic,
        "categories": [
            {"name": name, "value": category_counts.get(name, 0)}
            for name in ("DoS", "Probe", "R2L", "U2R", "Normal")
        ],
        "detection_by_category": list(category_detection.values()),
    }


@app.get("/api/alerts")
def get_alerts(limit: int = Query(default=10, ge=1, le=100)):
    replay = _replay()
    if replay is None:
        return {"status": "unavailable", "source": "Unavailable", "alerts": []}
    alerts_by_category = {name: [] for name in ("DoS", "Probe", "R2L", "U2R", "Normal", "Other")}
    for row in replay["rows"]:
        if row["label"] == "attack":
            alerts_by_category[row["category"]].append(row)
    for category_alerts in alerts_by_category.values():
        category_alerts.sort(key=lambda row: row["attack_probability"], reverse=True)

    alerts = []
    category_order = tuple(alerts_by_category)
    while len(alerts) < limit:
        added = False
        for category in category_order:
            category_alerts = alerts_by_category[category]
            if category_alerts:
                alerts.append(category_alerts.pop(0))
                added = True
                if len(alerts) == limit:
                    break
        if not added:
            break

    return {
        "status": "available",
        "source": _dataset_source(replay),
        "alerts": alerts[:limit],
    }


@app.post("/api/predict")
def predict(request: PredictRequest):
    try:
        return predict_rows(pd.DataFrame([request.features]))[0]
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/predict/batch")
async def predict_batch(file: UploadFile = File(...)):
    content = await file.read()
    try:
        rows = pd.read_csv(BytesIO(content))
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {error}") from error
    try:
        predictions = predict_rows(rows)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"count": len(predictions), "predictions": predictions}


@app.get("/api/metrics")
def get_metrics():
    return {
        "source": "README.md",
        "status": "available",
        "threshold": 0.5,
        "models": README_METRICS,
    }
