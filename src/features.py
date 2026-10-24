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