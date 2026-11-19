from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from src.features import select_feature_columns


ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "xgboost.joblib"
LABEL_COLUMNS = ("class", "classnum")


@lru_cache(maxsize=1)
def load_model():
    """Load the saved XGBoost pipeline, including its fitted preprocessing."""
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Model artifact not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def prepare_features(rows, model=None):
    """Drop labels and order columns for the pipeline's fitted preprocessor."""
    fitted_model = model or load_model()
    preprocessor = fitted_model.named_steps["prep"]
    features = rows.drop(columns=[name for name in LABEL_COLUMNS if name in rows], errors="ignore")
    return select_feature_columns(features, preprocessor)


def predict_rows(rows, model=None):
    fitted_model = model or load_model()
    features = prepare_features(rows, fitted_model)
    class_labels = np.asarray(fitted_model.predict(features))
    probabilities = np.asarray(fitted_model.predict_proba(features))
    classes = list(fitted_model.classes_)
    positive_index = classes.index(1)
    attack_probabilities = probabilities[:, positive_index]
    classifier = fitted_model.named_steps["clf"]
    preprocessor = fitted_model.named_steps["prep"]
    transformed_names = preprocessor.get_feature_names_out()
    importances = getattr(classifier, "feature_importances_", None)
    top_features = []
    if importances is not None and len(importances) == len(transformed_names):
        order = np.argsort(importances)[::-1][:10]
        top_features = [
            {"feature": str(transformed_names[index]), "importance": float(importances[index])}
            for index in order
        ]

    return [
        {
            "label": "attack" if label == 1 else "normal",
            "confidence": float(max(probabilities[index])),
            "attack_probability": float(attack_probabilities[index]),
            "top_features": top_features,
            "explanation_type": "global_importance",
        }
        for index, label in enumerate(class_labels)
    ]
