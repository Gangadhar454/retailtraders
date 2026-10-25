#!/usr/bin/env bash
set -euo pipefail

# Deployment script for Backend VM (FastAPI + Alembic migrations to Oracle MySQL)
REPO_URL="https://github.com/Gangadhar454/retailtraders.git"
INSTALL_DIR="/opt/netpnl"

echo "=== [1/5] Checking Docker & Docker Compose installation ==="
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER" || true
    rm get-docker.sh
fi

if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

echo "=== [2/5] Setting up repository in ${INSTALL_DIR} ==="
if [ ! -d "$INSTALL_DIR" ]; then
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown -R "$USER:$USER" "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
else
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main
fi

cd "$INSTALL_DIR"

echo "=== [3/5] Verifying environment configuration ==="
if [ ! -f "infra/backend/.env" ]; then
    echo "ERROR: infra/backend/.env is missing!"
    echo "Please copy infra/backend/.env.example to infra/backend/.env and configure your MySQL credentials."
    exit 1
fi

echo "=== [4/5] Building and starting Backend container & running migrations ==="
docker compose -f infra/backend/docker-compose.prod.yml down --remove-orphans || true
docker compose -f infra/backend/docker-compose.prod.yml up -d --build

echo "=== [5/5] Health check ==="
echo "Waiting for backend API to initialize..."
for i in {1..20}; do
    if curl -fsS http://127.0.0.1:8000/health > /dev/null 2>&1; then
        echo "SUCCESS: Backend is healthy and connected to MySQL on port 8000!"
        exit 0
    fi
    echo "Waiting... ($i/20)"
    sleep 3
done

echo "WARNING: Backend health check timed out. Checking container logs:"
docker compose -f infra/backend/docker-compose.prod.yml logs --tail 30
exit 1

