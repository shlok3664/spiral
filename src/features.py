from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def build_preprocessor(X):
    """One-hot encode non-numeric columns, scale numeric ones."""
    cat_cols = X.select_dtypes(exclude="number").columns.tolist()
    num_cols = X.select_dtypes(include="number").columns.tolist()
    prep = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
        ("num", StandardScaler(), num_cols),
    ])
    return prep, cat_cols, num_cols


def select_feature_columns(X, preprocessor):
    """Validate and order input columns for a fitted preprocessor."""
    feature_names = list(preprocessor.feature_names_in_)
    missing = [name for name in feature_names if name not in X.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    return X.loc[:, feature_names]