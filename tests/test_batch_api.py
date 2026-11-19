import asyncio
import csv
import io
import time

import httpx
import pandas as pd
import pytest

from api import main
from api.main import (
    MAX_UPLOAD_BYTES,
    NSL_KDD_FEATURE_COLUMNS,
    app,
)
from src.inference import ROOT, load_model, prepare_features


KDD_TEST_PLUS = ROOT / "data" / "KDDTest+.txt"
TRAIN_DATA = ROOT / "data" / "KDDTrain.parquet"


def request(method, path, **kwargs):
    async def send():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def upload(filename, content, media_type="text/csv"):
    return request(
        "POST",
        "/api/predict/batch",
        files={"file": (filename, content, media_type)},
    )


def make_headerless_row(column_count: int) -> str:
    training = pd.read_parquet(TRAIN_DATA).iloc[0]
    values = []
    for column in NSL_KDD_FEATURE_COLUMNS:
        if column in training.index:
            values.append(str(training[column]))
        elif column in {"protocol_type", "service", "flag"}:
            values.append({"protocol_type": "tcp", "service": "http", "flag": "SF"}[column])
        else:
            values.append("0")
    if column_count >= 42:
        values.append("neptune")
    if column_count == 43:
        values.append("0")
    assert len(values) == column_count
    return ",".join(values)


@pytest.mark.parametrize("column_count", [41, 42, 43])
def test_headerless_nsl_kdd_column_counts(column_count):
    response = upload(
        "flows.txt",
        (make_headerless_row(column_count) + "\n").encode(),
        "text/plain",
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["rows_received"] == result["rows_scored"] == 1
    assert result["rows_skipped"] == 0
    assert (result["metrics"] is not None) is (column_count >= 42)


def test_header_csv_and_tsv_are_accepted():
    sample = pd.read_csv(ROOT / "sample" / "sample_connections.csv")
    for filename, delimiter, media_type in (
        ("flows.csv", ",", "text/csv"),
        ("flows.tsv", "\t", "text/tab-separated-values"),
    ):
        response = upload(
            filename,
            sample.head(2).to_csv(index=False, sep=delimiter).encode(),
            media_type,
        )
        assert response.status_code == 200, response.text
        assert response.json()["rows_scored"] == 2


@pytest.mark.parametrize(
    ("filename", "content", "expected_status", "expected_code"),
    [
        ("flows.exe", b"data", 415, "unsupported_media_type"),
        ("empty.csv", b"", 400, "empty_file"),
        ("binary.csv", b"\xff\x00\xfe", 400, "invalid_file"),
        ("wrong-width.csv", b"a,b,c\n1,2,3\n", 422, "invalid_columns"),
    ],
)
def test_batch_upload_rejections(filename, content, expected_status, expected_code):
    response = upload(filename, content)

    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == expected_code


def test_batch_rejects_upload_over_10mb():
    response = upload("large.csv", b"x" * (MAX_UPLOAD_BYTES + 1))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert "10 MB" in response.json()["error"]["message"]


def test_batch_rejects_more_than_50000_rows():
    sample = pd.read_csv(ROOT / "sample" / "sample_connections.csv").head(1)
    lines = sample.to_csv(index=False).splitlines()
    content = (lines[0] + "\n" + "\n".join([lines[1]] * 50_001) + "\n").encode()
    assert len(content) < MAX_UPLOAD_BYTES

    response = upload("too-many.csv", content)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "too_many_rows"


def test_batch_rejects_missing_columns_and_non_numeric_values():
    sample = pd.read_csv(ROOT / "sample" / "sample_connections.csv")
    missing = upload("missing.csv", sample.drop(columns=["duration"]).to_csv(index=False).encode())
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "missing_columns"
    assert "duration" in missing.json()["error"]["message"]

    non_numeric_sample = sample.copy()
    non_numeric_sample["src_bytes"] = non_numeric_sample["src_bytes"].astype(object)
    non_numeric_sample.loc[0, "src_bytes"] = "not-a-number"
    non_numeric = upload(
        "bad-number.csv",
        non_numeric_sample.to_csv(index=False).encode(),
    )
    assert non_numeric.status_code == 422
    assert non_numeric.json()["error"]["code"] == "non_numeric"
    assert "src_bytes" in non_numeric.json()["error"]["message"]

    empty_category_sample = sample.copy()
    empty_category_sample.loc[0, "service"] = " "
    empty_category = upload(
        "empty-category.csv",
        empty_category_sample.to_csv(index=False).encode(),
    )
    assert empty_category.status_code == 422
    assert empty_category.json()["error"]["code"] == "empty_category"


def test_batch_warns_about_unseen_categories_without_failing():
    sample = pd.read_csv(ROOT / "sample" / "sample_connections.csv").head(1)
    sample.loc[0, "service"] = "not-a-training-service"
    response = upload("unseen.csv", sample.to_csv(index=False).encode())

    assert response.status_code == 200
    assert any("unseen value" in warning for warning in response.json()["warnings"])


def test_batch_csv_download_neutralizes_formula_cells_and_expires():
    sample = pd.read_csv(ROOT / "sample" / "sample_connections.csv").head(1)
    sample.loc[0, "service"] = '=HYPERLINK("https://example.invalid")'
    response = upload("formula.csv", sample.to_csv(index=False).encode())
    assert response.status_code == 200, response.text
    download_id = response.json()["download_id"]

    downloaded = request("GET", f"/api/predict/batch/{download_id}/csv")
    assert downloaded.status_code == 200
    parsed = next(csv.DictReader(io.StringIO(downloaded.text)))
    assert parsed["service"].startswith("'=")
    assert parsed["prediction"] in {"Attack", "Normal"}
    assert "confidence" in parsed

    main.DOWNLOADS[download_id] = (time.monotonic() - 1, b"expired")
    expired = request("GET", f"/api/predict/batch/{download_id}/csv")
    assert expired.status_code == 404
    assert expired.json()["error"]["code"] == "download_expired"


def test_sample_health_and_defaults_endpoints():
    samples = request("GET", "/api/samples")
    assert samples.status_code == 200
    assert [item["name"] for item in samples.json()["samples"]] == ["sample_connections.csv"]
    assert request("GET", "/api/samples/..%2FREADME.md").status_code == 404
    assert request("GET", "/api/samples/sample_connections.csv").status_code == 200

    health = request("GET", "/api/health")
    assert health.status_code == 200
    assert health.json()["model_file"] == "models/xgboost.joblib"
    assert health.json()["number_of_features"] == 36

    defaults = request("GET", "/api/defaults")
    assert defaults.status_code == 200
    assert set(defaults.json()["categorical_columns"]) == {"protocol_type", "service", "flag"}
    assert defaults.json()["defaults_source"] == "KDDTrain.parquet"
    assert {"normal", "dos"}.issubset(defaults.json()["presets"])


def test_single_predict_returns_global_explanation_and_unseen_category_warning():
    sample = pd.read_csv(ROOT / "sample" / "sample_connections.csv").iloc[0].to_dict()
    sample["service"] = "not-a-training-service"
    response = request("POST", "/api/predict", json={"features": sample})

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["explanation_type"] == "global"
    assert result["top_features"]
    assert result["warnings"]


def test_batch_predictions_match_direct_model_for_20_test_rows():
    if not KDD_TEST_PLUS.is_file():
        pytest.skip(
            "data/KDDTest+.txt is not present; download the NSL-KDD test file to run batch parity."
        )

    from api.main import NSL_KDD_COLUMNS

    rows = pd.read_csv(KDD_TEST_PLUS, header=None, names=NSL_KDD_COLUMNS).head(20)
    model = load_model()
    expected = model.predict(prepare_features(rows, model))
    response = upload(
        "KDDTest+.txt",
        rows.to_csv(index=False, header=False).encode(),
        "text/plain",
    )
    assert response.status_code == 200, response.text
    actual = [1 if item["prediction"] == "Attack" else 0 for item in response.json()["results"]]
    assert actual == expected.tolist()


def test_batch_parquet_rows_are_scored_in_one_model_call(monkeypatch):
    rows = pd.read_parquet(ROOT / "data" / "KDDTest.parquet").head(20)
    calls = 0
    predict = main.predict_rows

    def counted_predict(frame):
        nonlocal calls
        calls += 1
        return predict(frame)

    monkeypatch.setattr(main, "predict_rows", counted_predict)
    response = upload("flows.csv", rows.to_csv(index=False).encode())

    assert response.status_code == 200, response.text
    assert response.json()["rows_scored"] == 20
    assert calls == 1
