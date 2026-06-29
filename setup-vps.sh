#!/bin/bash
# Run this once on a fresh Ubuntu 22.04 VPS as root.
set -e

# Docker
apt-get update -y
apt-get install -y ca-certificates curl gnupg nginx git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Nginx config
cp /opt/mlie-billing/nginx.conf /etc/nginx/sites-available/mlie-billing
ln -sf /etc/nginx/sites-available/mlie-billing /etc/nginx/sites-enabled/mlie-billing
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "✓ VPS setup complete. Now:"
echo "  1. cd /opt/mlie-billing"
echo "  2. cp .env.example .env && nano .env  (fill in your values)"
echo "  3. BUILD_STANDALONE=1 docker compose up -d --build"