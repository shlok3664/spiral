import pandas as pd

def load_table(path):
    """Read a .parquet or .csv file into a DataFrame."""
    path = str(path)
    if path.endswith(".parquet"):
        return pd.read_parquet(path)
    return pd.read_csv(path)

def to_binary(lables, normal_label):
    """1 where the label is not the normal class, else 0."""
    return (lables.astype(str) != normal_label).astype(int)

def split_xy(df, label_col, extra_drop =()):
    """Feature without the label columns, plus the raw label column."""
    X = df. drop(columns=[label_col, *extra_drop])
    return X, df[label_col]