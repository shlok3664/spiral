import asyncio

import httpx
import pandas as pd
import pytest

from api.main import app
from src.inference import ROOT, load_model, prepare_features


KDD_TEST_PLUS = ROOT / "data" / "KDDTest+.txt"


def request(method, path, **kwargs):
    async def send():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_predict_matches_direct_model_for_kdd_test_plus_rows():
    if not KDD_TEST_PLUS.is_file():
        pytest.skip(
            "data/KDDTest+.txt is not present; download the NSL-KDD test file to run parity checks."
        )

    from api.main import NSL_KDD_COLUMNS

    rows = pd.read_csv(KDD_TEST_PLUS, header=None, names=NSL_KDD_COLUMNS).head(20)
    model = load_model()
    expected = model.predict(prepare_features(rows, model))

    actual = []
    for _, row in rows.iterrows():
        response = request("POST", "/api/predict", json={"features": row.to_dict()})
        assert response.status_code == 200, response.text
        actual.append(1 if response.json()["label"] == "attack" else 0)

    assert actual == expected.tolist()


def test_predict_matches_direct_model_for_available_parquet():
    parquet_path = ROOT / "data" / "KDDTest.parquet"
    if not parquet_path.is_file():
        pytest.skip("No KDDTest.parquet replay dataset is present.")

    rows = pd.read_parquet(parquet_path).head(20)
    model = load_model()
    expected = model.predict(prepare_features(rows, model))

    actual = []
    for _, row in rows.iterrows():
        response = request("POST", "/api/predict", json={"features": row.to_dict()})
        assert response.status_code == 200, response.text
        actual.append(1 if response.json()["label"] == "attack" else 0)

    assert actual == expected.tolist()


def test_dashboard_replay_is_labeled_and_data_driven():
    if not (ROOT / "data" / "KDDTest+.txt").is_file() and not (
        ROOT / "data" / "KDDTest.parquet"
    ).is_file():
        pytest.skip("No NSL-KDD test replay dataset is present.")

    response = request("GET", "/api/stats")
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "available"
    assert result["source"] == "Replay of NSL-KDD test set"
    assert result["total_flows"] == 22544
    assert {item["name"] for item in result["categories"]} == {
        "DoS", "Probe", "R2L", "U2R", "Normal"
    }
    detection = result["detection_by_category"]
    assert {item["name"] for item in detection} == {"DoS", "Probe", "R2L", "U2R"}
    assert all(item["caught"] + item["missed"] == item["total"] for item in detection)
    matrix = result["confusion_matrix"]
    assert matrix["labels"] == ["Normal", "Attack"]
    assert sum(sum(row) for row in matrix["values"]) == result["total_flows"]
    assert [item["name"] for item in result["class_metrics"]] == ["Normal", "Attack"]
    assert all(
        0 <= item[metric] <= 1
        for item in result["class_metrics"]
        for metric in ("precision", "recall", "f1")
    )


def test_alert_feed_includes_a_variety_of_replay_categories():
    if not (ROOT / "data" / "KDDTest+.txt").is_file() and not (
        ROOT / "data" / "KDDTest.parquet"
    ).is_file():
        pytest.skip("No NSL-KDD test replay dataset is present.")

    response = request("GET", "/api/alerts?limit=8")
    assert response.status_code == 200
    alerts = response.json()["alerts"]
    categories = {alert["category"] for alert in alerts}
    assert {"DoS", "Probe", "R2L", "U2R"}.issubset(categories)
    assert len({alert["service"] for alert in alerts}) >= 3
    assert any(alert["category"] == "Normal" for alert in alerts)


def test_metrics_identify_readme_as_source():
    response = request("GET", "/api/metrics")
    assert response.status_code == 200
    result = response.json()
    assert result["source"] == "README.md"
    assert [item["model"] for item in result["models"]] == [
        "Random Forest", "Logistic Regression", "XGBoost"
    ]


def test_predict_rejects_missing_model_features():
    response = request("POST", "/api/predict", json={"features": {"protocol_type": "tcp"}})
    assert response.status_code == 422
    assert "Missing columns" in response.json()["detail"]


def test_batch_prediction_returns_predictions_from_uploaded_csv():
    parquet_path = ROOT / "data" / "KDDTest.parquet"
    if not parquet_path.is_file():
        pytest.skip("No KDDTest.parquet dataset is present for batch prediction.")

    rows = pd.read_parquet(parquet_path).head(3)
    response = request(
        "POST",
        "/api/predict/batch",
        files={"file": ("flows.csv", rows.to_csv(index=False), "text/csv")},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["count"] == 3
    assert len(result["predictions"]) == 3
