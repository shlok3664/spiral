from functools import lru_cache
from io import BytesIO
import re
import threading
import time
import uuid

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

from src.inference import MODEL_PATH, ROOT, load_model, predict_rows


TEST_DATA_PATH = ROOT / "data" / "KDDTest.parquet"
TRAIN_DATA_PATH = ROOT / "data" / "KDDTrain.parquet"
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
NSL_KDD_FEATURE_COLUMNS = NSL_KDD_COLUMNS[:41]
CATEGORICAL_COLUMNS = ("protocol_type", "service", "flag")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_UPLOAD_ROWS = 50_000
MAX_RESULT_ROWS = 1_000
DOWNLOAD_TTL_SECONDS = 15 * 60
SAMPLE_DIR = ROOT / "sample"
SAMPLE_FILES = frozenset({"sample_connections.csv"})
DOWNLOADS: dict[str, tuple[float, bytes]] = {}
DOWNLOADS_LOCK = threading.Lock()

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
    allow_origins=["http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _raise_api_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


@app.exception_handler(HTTPException)
async def handle_http_error(_request: Request, error: HTTPException):
    detail = error.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        body = detail
    else:
        body = {"code": "request_failed", "message": str(detail)}
    return JSONResponse(status_code=error.status_code, content={"error": body})


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, _error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": "The request did not match the expected format.",
            }
        },
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


def _class_metrics(true_positive, false_positive, false_negative):
    precision = (
        true_positive / (true_positive + false_positive)
        if true_positive + false_positive
        else None
    )
    recall = (
        true_positive / (true_positive + false_negative)
        if true_positive + false_negative
        else None
    )
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall
        else None
    )
    return {"precision": precision, "recall": recall, "f1": f1}


@lru_cache(maxsize=1)
def _model_schema():
    model = load_model()
    preprocessor = model.named_steps["prep"]
    required = tuple(str(name) for name in preprocessor.feature_names_in_)
    numeric = tuple(
        str(column)
        for name, _transformer, columns in preprocessor.transformers_
        if name == "num"
        for column in columns
    )
    categorical = tuple(
        str(column)
        for name, _transformer, columns in preprocessor.transformers_
        if name == "cat"
        for column in columns
    )
    return model, preprocessor, required, numeric, categorical


def _safe_filename(filename: str | None) -> str:
    value = (filename or "uploaded.csv").replace("\\", "/").split("/")[-1]
    value = re.sub(r"[\x00-\x1f\x7f]", "", value).strip()
    return value[:180] or "uploaded.csv"


def _file_extension(filename: str | None) -> str:
    leaf = (filename or "").replace("\\", "/").split("/")[-1]
    return leaf.rsplit(".", 1)[-1].lower() if "." in leaf else ""


def _normalize_label(label: object) -> str | None:
    normalized = str(label).strip().lower().rstrip(".")
    category = _category_for_label(normalized)
    return category if category != "Other" else None


def _validate_feature_frame(frame: pd.DataFrame, has_header: bool = True) -> pd.DataFrame:
    _model, _preprocessor, required, numeric, categorical = _model_schema()
    missing = [column for column in required if column not in frame.columns]
    if missing:
        _raise_api_error(
            422,
            "missing_columns",
            f"Missing required feature columns: {', '.join(missing)}.",
        )

    numeric_columns = [
        column
        for column in NSL_KDD_FEATURE_COLUMNS
        if column in frame.columns and column not in CATEGORICAL_COLUMNS
    ]
    numeric_columns = list(dict.fromkeys([*numeric_columns, *numeric]))
    for column in numeric_columns:
        converted = pd.to_numeric(frame[column], errors="coerce")
        try:
            finite = np.isfinite(converted.to_numpy(dtype=float))
        except (TypeError, ValueError):
            finite = np.zeros(len(converted), dtype=bool)
        invalid = converted.isna().to_numpy() | ~finite
        if invalid.any():
            row_number = int(np.flatnonzero(invalid)[0]) + (2 if has_header else 1)
            _raise_api_error(
                422,
                "non_numeric",
                f"Column '{column}' must contain numeric values (invalid value on row {row_number}).",
            )
        frame[column] = converted

    for column in categorical:
        values = frame[column]
        empty = values.isna() | values.astype(str).str.strip().eq("")
        if empty.any():
            row_number = int(np.flatnonzero(empty.to_numpy())[0]) + (2 if has_header else 1)
            _raise_api_error(
                422,
                "empty_category",
                f"Column '{column}' must not be empty (row {row_number}).",
            )
        frame[column] = values.astype(str).str.strip()
    return frame


def _parse_batch_file(content: bytes, filename: str):
    if not content or not content.strip():
        _raise_api_error(400, "empty_file", "The uploaded file is empty.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        _raise_api_error(400, "invalid_file", "The uploaded file must be a UTF-8 CSV or text file.")

    extension = _file_extension(filename)
    first_line = next((line for line in text.splitlines() if line.strip()), "")
    delimiter = "\t" if extension == "tsv" or ("\t" in first_line and "," not in first_line) else ","
    try:
        first_row = pd.read_csv(
            BytesIO(content),
            sep=delimiter,
            header=None,
            nrows=1,
            dtype=str,
            keep_default_na=False,
            engine="python",
        )
    except (pd.errors.EmptyDataError, pd.errors.ParserError, ValueError):
        _raise_api_error(400, "invalid_file", "The file could not be parsed as a delimited table.")
    if first_row.empty:
        _raise_api_error(400, "empty_file", "The uploaded file does not contain any rows.")

    first_values = {
        str(value).strip().lower()
        for value in first_row.iloc[0].tolist()
    }
    has_header = bool(
        first_values.intersection(set(NSL_KDD_FEATURE_COLUMNS) | {"class", "classnum", "difficulty"})
    )

    try:
        if has_header:
            frame = pd.read_csv(BytesIO(content), sep=delimiter, header=0)
        else:
            column_count = len(first_row.columns)
            if column_count not in (41, 42, 43):
                _raise_api_error(
                    422,
                    "invalid_columns",
                    f"Expected 41, 42 or 43 columns, found {column_count}.",
                )
            headerless_columns = NSL_KDD_FEATURE_COLUMNS.copy()
            if column_count >= 42:
                headerless_columns.append("class")
            if column_count == 43:
                headerless_columns.append("difficulty")
            frame = pd.read_csv(
                BytesIO(content),
                sep=delimiter,
                header=None,
                names=headerless_columns,
            )
    except HTTPException:
        raise
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeDecodeError, ValueError):
        _raise_api_error(400, "invalid_file", "The file could not be parsed as a delimited table.")

    frame.columns = [str(column).strip().lower() for column in frame.columns]
    if frame.columns.duplicated().any():
        _raise_api_error(422, "invalid_columns", "The file contains duplicate column names.")
    if frame.empty:
        _raise_api_error(400, "empty_file", "The uploaded file does not contain any data rows.")
    if len(frame) > MAX_UPLOAD_ROWS:
        _raise_api_error(
            413,
            "too_many_rows",
            f"The file contains {len(frame):,} rows; the limit is {MAX_UPLOAD_ROWS:,}.",
        )

    frame = _validate_feature_frame(frame, has_header=has_header)

    has_labels = "class" in frame.columns
    label_categories: list[str] | None = None
    if has_labels:
        label_categories = []
        for index, value in enumerate(frame["class"]):
            category = _normalize_label(value)
            if category is None:
                _raise_api_error(
                    422,
                    "invalid_label",
                    f"Unrecognized label on data row {index + 1}; expected an NSL-KDD class label.",
                )
            label_categories.append(category)

    features = frame.drop(columns=["class", "classnum", "difficulty"], errors="ignore")
    return frame, features, label_categories, has_header


def _unseen_category_warnings(features: pd.DataFrame) -> list[str]:
    _model, preprocessor, _required, _numeric, categorical = _model_schema()
    encoder = preprocessor.named_transformers_["cat"]
    warnings = []
    for column, known_categories in zip(categorical, encoder.categories_):
        known = {str(value) for value in known_categories}
        unseen = ~features[column].astype(str).isin(known)
        count = int(unseen.sum())
        if count:
            warnings.append(
                f"Ignored {count} unseen value(s) in '{column}' using the fitted encoder."
            )
    return warnings


def _json_scalar(value):
    if pd.isna(value):
        return None
    if isinstance(value, np.generic):
        return value.item()
    return value


def _safe_csv_cell(value):
    if value is None or pd.isna(value):
        return ""
    text = str(value)
    if text.lstrip(" \t\r\n")[:1] in ("=", "+", "-", "@"):
        return "'" + text
    return value.item() if isinstance(value, np.generic) else value


def _purge_expired_downloads(now: float | None = None) -> None:
    current_time = time.monotonic() if now is None else now
    with DOWNLOADS_LOCK:
        expired = [
            download_id
            for download_id, (expires_at, _content) in DOWNLOADS.items()
            if expires_at <= current_time
        ]
        for download_id in expired:
            DOWNLOADS.pop(download_id, None)


def _training_profile(rows: pd.DataFrame, columns: tuple[str, ...]) -> dict[str, object]:
    profile: dict[str, object] = {}
    for column in columns:
        if column not in rows.columns or rows.empty:
            continue
        values = rows[column].dropna()
        if values.empty:
            continue
        if column in CATEGORICAL_COLUMNS:
            modes = values.astype(str).mode()
            if not modes.empty:
                profile[column] = str(modes.iloc[0])
        else:
            profile[column] = _json_scalar(values.median())
    return profile


@lru_cache(maxsize=1)
def _defaults_response() -> dict[str, object]:
    _model, preprocessor, required, numeric, categorical = _model_schema()
    train = pd.read_parquet(TRAIN_DATA_PATH) if TRAIN_DATA_PATH.is_file() else None
    if train is not None:
        defaults = _training_profile(train, required)
        ranges = {}
        for column in numeric:
            if column in train.columns and not train[column].empty:
                ranges[column] = {
                    "min": _json_scalar(train[column].min()),
                    "max": _json_scalar(train[column].max()),
                }
            else:
                ranges[column] = None
        source = TRAIN_DATA_PATH.name
    else:
        defaults = {}
        ranges = {column: None for column in numeric}
        for column, value in zip(numeric, preprocessor.named_transformers_["num"].mean_):
            defaults[column] = float(value)
        encoder = preprocessor.named_transformers_["cat"]
        for column, values in zip(categorical, encoder.categories_):
            if len(values):
                defaults[column] = str(values[0])
        source = "saved preprocessing artifact"

    for column in required:
        if column not in defaults:
            if column in categorical:
                encoder = preprocessor.named_transformers_["cat"]
                categories = encoder.categories_[categorical.index(column)]
                if len(categories):
                    defaults[column] = str(categories[0])

    options = {
        column: [str(value) for value in values]
        for column, values in zip(
            categorical,
            preprocessor.named_transformers_["cat"].categories_,
        )
    }
    presets: dict[str, dict[str, object]] = {}
    if train is not None and "class" in train.columns:
        labels = train["class"].astype(str).str.strip().str.lower().str.rstrip(".")
        normal_rows = train.loc[labels == "normal"]
        dos_labels = {label for label in ATTACK_CATEGORIES["DoS"]}
        dos_rows = train.loc[labels.isin(dos_labels)]
        for name, subset in (("normal", normal_rows), ("dos", dos_rows)):
            profile = _training_profile(subset, required)
            if profile:
                presets[name] = profile

    return {
        "model_name": "XGBoost",
        "model_file": str(MODEL_PATH.relative_to(ROOT)).replace("\\", "/"),
        "feature_columns": list(required),
        "numeric_columns": list(numeric),
        "categorical_columns": list(categorical),
        "defaults": defaults,
        "ranges": ranges,
        "options": options,
        "presets": presets,
        "defaults_source": source,
    }


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
            "confusion_matrix": None,
            "class_metrics": [],
        }

    rows = replay["rows"]
    attacks = [row for row in rows if row["label"] == "attack"]
    true_attacks = [row for row in rows if row["true_label"] != "normal"]
    true_normals = [row for row in rows if row["true_label"] == "normal"]
    caught_attacks = sum(row["label"] == "attack" for row in true_attacks)
    false_alarms = sum(row["label"] == "attack" for row in true_normals)
    missed_attacks = len(true_attacks) - caught_attacks
    true_negatives = len(true_normals) - false_alarms
    confusion_matrix = [
        [true_negatives, false_alarms],
        [missed_attacks, caught_attacks],
    ]
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
        "confusion_matrix": {
            "labels": ["Normal", "Attack"],
            "values": confusion_matrix,
        },
        "class_metrics": [
            {
                "name": "Normal",
                **_class_metrics(true_negatives, missed_attacks, false_alarms),
            },
            {
                "name": "Attack",
                **_class_metrics(caught_attacks, false_alarms, missed_attacks),
            },
        ],
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
    candidates = [row for row in replay["rows"] if row["label"] == "attack"]
    alerts = []
    while len(alerts) < limit:
        if not candidates:
            break
        next_index = min(
            range(len(candidates)),
            key=lambda index: (
                sum(row["category"] == candidates[index]["category"] for row in alerts),
                sum(row["service"] == candidates[index]["service"] for row in alerts),
                -candidates[index]["attack_probability"],
                candidates[index]["row"],
            ),
        )
        alerts.append(candidates.pop(next_index))

    return {
        "status": "available",
        "source": _dataset_source(replay),
        "alerts": alerts[:limit],
    }


@app.post("/api/predict")
def predict(request: PredictRequest):
    try:
        features = pd.DataFrame([request.features])
        features.columns = [str(column).strip().lower() for column in features.columns]
        features = _validate_feature_frame(features)
        result = predict_rows(features)[0]
        result["explanation_type"] = "global"
        result["warnings"] = _unseen_category_warnings(features)
        return result
    except HTTPException:
        raise
    except (ValueError, KeyError):
        _raise_api_error(
            422,
            "invalid_features",
            "The supplied feature values could not be scored by the fitted model.",
        )


@app.post("/api/predict/batch")
async def predict_batch(file: UploadFile = File(...)):
    extension = _file_extension(file.filename)
    if extension not in {"csv", "txt", "tsv"}:
        await file.close()
        _raise_api_error(415, "unsupported_media_type", "Upload a .csv, .txt, or .tsv file.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        _raise_api_error(
            413,
            "file_too_large",
            f"The file exceeds the 10 MB limit ({MAX_UPLOAD_BYTES:,} bytes).",
        )

    try:
        frame, features, label_categories, _has_header = _parse_batch_file(
            content,
            file.filename or "uploaded.csv",
        )
        warnings = _unseen_category_warnings(features)
        predictions = predict_rows(features)
    except HTTPException:
        raise
    except (ValueError, KeyError):
        _raise_api_error(
            422,
            "invalid_features",
            "The supplied feature values could not be scored by the fitted model.",
        )

    prediction_labels = [
        "Attack" if prediction["label"] == "attack" else "Normal"
        for prediction in predictions
    ]
    metrics = None
    if label_categories is not None:
        true_binary = np.asarray([category != "Normal" for category in label_categories], dtype=int)
        predicted_binary = np.asarray([label == "Attack" for label in prediction_labels], dtype=int)
        precision, recall, f1, _ = precision_recall_fscore_support(
            true_binary,
            predicted_binary,
            average="binary",
            zero_division=0,
        )
        metrics = {
            "accuracy": float(accuracy_score(true_binary, predicted_binary)),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "confusion_matrix": confusion_matrix(
                true_binary,
                predicted_binary,
                labels=[0, 1],
            ).tolist(),
        }

    category_counts: dict[str, int] = {}
    if label_categories is not None:
        category_counts = {name: 0 for name in ("Normal", "DoS", "Probe", "R2L", "U2R")}
        for category in label_categories:
            category_counts[category] += 1
    else:
        category_counts = {
            "Attack": prediction_labels.count("Attack"),
            "Normal": prediction_labels.count("Normal"),
        }

    result_rows = []
    for index, prediction in enumerate(predictions[:MAX_RESULT_ROWS]):
        features_for_row = {
            str(column): _json_scalar(value)
            for column, value in features.iloc[index].items()
        }
        source_row = frame.iloc[index]
        result_rows.append(
            {
                "row": index + 1,
                "prediction": prediction_labels[index],
                "category": label_categories[index] if label_categories is not None else None,
                "true_label": label_categories[index] if label_categories is not None else None,
                "is_false_positive": (
                    label_categories[index] == "Normal"
                    and prediction_labels[index] == "Attack"
                    if label_categories is not None
                    else None
                ),
                "confidence": float(prediction["confidence"]),
                "protocol": str(source_row["protocol_type"]),
                "service": str(source_row["service"]),
                "src_bytes": _json_scalar(source_row["src_bytes"]),
                "dst_bytes": _json_scalar(source_row["dst_bytes"]),
                "features": features_for_row,
                "top_features": prediction["top_features"],
                "explanation_type": "global",
            }
        )

    export_frame = frame.copy()
    export_frame["prediction"] = prediction_labels
    export_frame["confidence"] = [prediction["confidence"] for prediction in predictions]
    for column in export_frame.columns:
        export_frame[column] = export_frame[column].map(_safe_csv_cell)
    csv_content = export_frame.to_csv(index=False).encode("utf-8")
    _purge_expired_downloads()
    download_id = str(uuid.uuid4())
    with DOWNLOADS_LOCK:
        DOWNLOADS[download_id] = (
            time.monotonic() + DOWNLOAD_TTL_SECONDS,
            csv_content,
        )

    return {
        "filename": _safe_filename(file.filename),
        "rows_received": len(frame),
        "rows_scored": len(predictions),
        "rows_skipped": 0,
        "warnings": warnings,
        "summary": {
            "attacks_flagged": prediction_labels.count("Attack"),
            "normal": prediction_labels.count("Normal"),
            "flag_rate": prediction_labels.count("Attack") / len(predictions),
            "mean_confidence": float(np.mean([item["confidence"] for item in predictions])),
        },
        "metrics": metrics,
        "category_counts": category_counts,
        "results": result_rows,
        "results_truncated": len(predictions) > MAX_RESULT_ROWS,
        "download_id": download_id,
    }


@app.get("/api/predict/batch/{download_id}/csv")
def download_batch_csv(download_id: str):
    _purge_expired_downloads()
    with DOWNLOADS_LOCK:
        entry = DOWNLOADS.get(download_id)
    if entry is None:
        _raise_api_error(404, "download_expired", "This results download has expired or does not exist.")
    _expires_at, content = entry
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="spiral_predictions.csv"'},
    )


@app.get("/api/health")
def get_health():
    try:
        _model, _preprocessor, required, _numeric, _categorical = _model_schema()
    except FileNotFoundError:
        _raise_api_error(503, "model_unavailable", "The XGBoost model artifact is not available.")
    return {
        "model_name": "XGBoost",
        "model_file": str(MODEL_PATH.relative_to(ROOT)).replace("\\", "/"),
        "number_of_features": len(required),
        "kddtest_plus_available": (ROOT / "data" / "KDDTest+.txt").is_file(),
    }


@app.get("/api/defaults")
def get_defaults():
    try:
        return _defaults_response()
    except FileNotFoundError:
        _raise_api_error(503, "model_unavailable", "The XGBoost model artifact is not available.")
    except (OSError, ValueError):
        _raise_api_error(503, "defaults_unavailable", "Training-set defaults are unavailable.")


@app.get("/api/samples")
def get_samples():
    samples = []
    for name in sorted(SAMPLE_FILES):
        sample_path = SAMPLE_DIR / name
        if sample_path.is_file():
            samples.append({"name": name, "size_bytes": sample_path.stat().st_size})
    return {"samples": samples}


@app.get("/api/samples/{name}")
def get_sample(name: str):
    if name not in SAMPLE_FILES:
        _raise_api_error(404, "sample_not_found", "That sample file is not available.")
    sample_path = SAMPLE_DIR / name
    if not sample_path.is_file():
        _raise_api_error(404, "sample_not_found", "That sample file is not available.")
    return FileResponse(sample_path, media_type="text/csv", filename=name)


@app.get("/api/metrics")
def get_metrics():
    return {
        "source": "README.md",
        "status": "available",
        "threshold": 0.5,
        "models": README_METRICS,
    }
