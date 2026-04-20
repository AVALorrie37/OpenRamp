FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY top_300_metrics ./top_300_metrics

EXPOSE 8000

CMD ["sh", "-c", "uv=$(echo \"${LOG_LEVEL:-INFO}\" | tr '[:upper:]' '[:lower:]'); case \"$uv\" in warn) uv=warning ;; esac; exec uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --log-level \"$uv\""]
