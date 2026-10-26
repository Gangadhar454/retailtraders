#!/usr/bin/env bash
set -euo pipefail

# Deployment script for Frontend VM (Next.js + Nginx Reverse Proxy + Let's Encrypt SSL)
# Usage:
#   ./infra/deploy_frontend.sh <BACKEND_PRIVATE_IP>

BACKEND_PRIVATE_IP="${1:-}"
DOMAIN="retailtraders.in"
INSTALL_DIR="/opt/netpnl"

if [ -z "$BACKEND_PRIVATE_IP" ]; then
    echo "Usage: $0 <BACKEND_PRIVATE_IP>"
    echo "Example: $0 10.0.1.25"
    exit 1
fi

echo "=== [1/6] Installing dependencies (Docker, Nginx, Certbot) ==="
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx curl git

if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER" || true
    rm get-docker.sh
fi

echo "=== [2/6] Syncing code in ${INSTALL_DIR} ==="
if [ ! -d "$INSTALL_DIR" ]; then
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown -R "$USER:$USER" "$INSTALL_DIR"
    git clone "https://github.com/Gangadhar454/retailtraders.git" "$INSTALL_DIR"
else
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main
fi

cd "$INSTALL_DIR"

echo "=== [3/5] Obtaining Let's Encrypt SSL Certificate ==="
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo "Acquiring new SSL certificate for ${DOMAIN}..."
    sudo systemctl stop nginx || true
    sudo certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email || {
        echo "Certbot standalone failed. Attempting with nginx..."
        sudo systemctl start nginx
        sudo certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email
    }
fi

echo "=== [4/5] Configuring Nginx ==="
sed "s/__BACKEND_PRIVATE_IP__/${BACKEND_PRIVATE_IP}/g" infra/frontend/nginx.conf.template | sudo tee /etc/nginx/sites-available/retailtraders > /dev/null
sudo ln -sf /etc/nginx/sites-available/retailtraders /etc/nginx/sites-enabled/retailtraders
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "=== [5/5] Building and running Next.js application ==="
docker compose -f infra/frontend/docker-compose.prod.yml down --remove-orphans || true
docker compose -f infra/frontend/docker-compose.prod.yml up -d --build

echo "=== Setup complete! Access your application at https://${DOMAIN} ==="

