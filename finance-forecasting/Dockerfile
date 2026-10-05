# Pinned by digest, not the :latest tag. A mutable tag let the base image
# change underneath the pinned requirements above without any visible diff.
FROM ghcr.io/cids08/python311-ml@sha256:4ae686a187b8b3f8d8a2cb8f6022fd3f1e940c23ff06d8873dbed5fe755e445b

LABEL maintainer="Financial Management System — Forecasting Service"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# Cap BLAS threading. With 12 visible cores OpenBLAS spawned a thread per
# core, and the resulting contention made statsmodels' optimizer roughly 100x
# slower than on an unthreaded run -- a 6-point ARIMA fit took 34.77s, well
# past Laravel's request timeout. The series are far too small to parallelise
# profitably, so a single thread is both correct and faster.
ENV OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]