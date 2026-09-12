FROM ghcr.io/cids08/python311-ml:latest

LABEL maintainer="Financial Management System — AI Advisor Service"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]