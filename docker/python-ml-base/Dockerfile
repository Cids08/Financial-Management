# =============================================================================
# docker/python-ml-base/Dockerfile
# Base image: python:3.11-slim + FastAPI/uvicorn + scientific stack
# (numpy, pandas, scipy, statsmodels) + httpx. The slow pip step lives here
# (built once on GitHub Actions), so HostForge microservice builds finish in
# seconds instead of timing out at ~20 minutes on pip install + layer export.
#
# Pinned so that EVERY microservice's requirements.txt is "already satisfied":
#   - finance-forecasting: fastapi>=0.110,<1  uvicorn>=0.28,<1  pydantic>=2.6,<3
#                          numpy>=1.26,<2  pandas>=2.2,<3  scipy>=1.12,<2  statsmodels>=0.14,<1
#   - finance-aiservice:   fastapi==0.115.0  uvicorn[standard]==0.30.6  pydantic==2.9.2
#                          httpx==0.27.2  python-dotenv==1.2.3
# =============================================================================
FROM python:3.11-slim

LABEL maintainer="Financial Management System"
LABEL description="python:3.11-slim with FastAPI/uvicorn + numpy/pandas/scipy/statsmodels + httpx"

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt \
    && rm -rf /root/.cache/pip