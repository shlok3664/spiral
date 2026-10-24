import pandas as pd
from sklearn.metrics import (
    confusion_matrix, accuracy_score, precision_score, recall_score, f1_score,
)


def score(name, y_true, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    return {
        "model": name,
        "accuracy": round(accuracy_score(y_true, y_pred), 3),
        "attack_precision": round(precision_score(y_true, y_pred), 3),
        "attack_recall": round(recall_score(y_true, y_pred), 3),
        "attack_f1": round(f1_score(y_true, y_pred), 3),
        "missed_attacks": fn,
        "false_alarms": fp,
    }


def compare(fitted, X, y):
    rows = [score(name, y, pipe.predict(X)) for name, pipe in fitted.items()]
    return pd.DataFrame(rows)


def cutoff_table(name, y_true, proba, thresholds=(0.5, 0.2, 0.1, 0.05)):
    rows = [score(f"{name} @ {t}", y_true, (proba >= t).astype(int)) for t in thresholds]
    return pd.DataFrame(rows)