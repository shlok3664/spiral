import joblib
import pandas as pd
import streamlit as st

st.set_page_config(page_title="spiral IDS", layout="wide")
st.title("spiral: network intrusion detection")
st.caption("NSL-KDD demo. A learning Project, not a production security tool.")

@st.cache_resource
def load_model():
    return joblib.load("models/xgboost.joblib")

model = load_model()

uploaded = st.file_uploader("Upload a CSV of connections", type='csv')
if uploaded is not None:
    df = pd.read_csv(uploaded)
else:
    df = pd.read_csv("sample/sample_connections.csv")
    st.info("Showing the built-in sample (500 test connection).")

truth = df["class"].astype(str) if "class" in df.columns else None
X = df.drop(columns=[c for c in ["class", "classnum"] if c in df.columns])

needed = list(model.named_steps["prep"].feature_names_in_)
missing = [c for c in needed if c not in X.columns]
if missing:
    st.error(f"Missing columns: {missing}")
    st.stop()
X = X[needed]

proba = model.predict_proba(X)[:, 1]
Cutoff = st.slider("Alert cutoff (lower flags more connection)", 0.01, 0.99, 0.5, 0.01)
flagged = proba >= Cutoff

c1, c2, c3 = st.columns(3)
c1.metric("Connections", len(df))
c2.metric("Flagged as attack", int(flagged.sum()))
c3.metric("Share flagged", f"{flagged.mean():.1%}")

out = df.copy()
out["attack_probability"] = proba.round(3)
out["flagged"] = flagged
if truth is not None:
    out["true_label"] = truth
st.dataframe(out.sort_values("attack_probability", ascending=False))