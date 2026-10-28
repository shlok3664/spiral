FROM python:3.15-slim
WORKDIR /app
COPY requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt
COPY app.py .
COPY models/xgboost.joblib models/xgboost.joblib
COPY sample/ sample/
EXPOSE 8501
CMD ["python", "-m", "streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]