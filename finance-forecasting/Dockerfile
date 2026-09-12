FROM ghcr.io/cids08/python311-ml:latest

LABEL maintainer="Financial Management System — Forecasting Service"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]