# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Build tools for the wheels that still need compiling, removed in the same
# layer so they never ship inside the image.
RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so application edits do not invalidate the wheel cache.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Run as a non-root user.
RUN useradd --create-home --shell /usr/sbin/nologin netpnl \
    && chown -R netpnl:netpnl /app
USER netpnl

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
