from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

def get_models(seed=42):
    return {
        "Random Forest": RandomForestClassifier(n_estimators=100, random_state=seed, n_jobs=-1),
        "Logistic Regression": LogisticRegression(max_iter=1000),
        "XGBoost": XGBClassifier(n_estimators=200, random_state=seed, n_jobs=-1),
    }

def fit_all(models, preprocessor, X, y, sample_weight=None):
    fitted = {}
    for name, clf in models.items():
        pipe = Pipeline([("prep", clone(preprocessor)), ("clf", clone(clf))])
        if sample_weight is None:
            pipe.fit(X, y)
        else:
            pipe.fit(X, y, clf__sample_weight=sample_weight)
        fitted[name] = pipe
    return fitted