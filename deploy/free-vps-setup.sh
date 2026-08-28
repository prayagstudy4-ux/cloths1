#!/usr/bin/env bash
#
# One-shot FREE deployment for "Clothing Business Manager" on a fresh VPS
# (Oracle Cloud Always Free / any Ubuntu 22.04+ box).
#
# What it does:
#   1. Installs Docker + Docker Compose
#   2. Clones your project from a git repo (or you place it manually)
#   3. Sets up free DuckDNS domain updates (keeps DNS in sync with your IP)
#   4. Builds and starts the app + Caddy (free automatic HTTPS)
#   5. Prints the command to create your first admin login
#
# Usage — fill in the three variables, then run as root:
#   sudo bash deploy/free-vps-setup.sh
#
set -euo pipefail

# ===================== EDIT THESE =====================
REPO_URL="https://github.com/YOUR_USER/cbm.git"     # your private/public repo
DOMAIN="yourapp.duckdns.org"                        # your free DuckDNS domain
DUCKDNS_TOKEN=""                                    # token from duckdns.org (optional; blank = skip)
INSTALL_DIR="/opt/cbm"
# ======================================================

if [ "$(id -u)" -ne 0 ]; then echo "Run as root: sudo bash $0"; exit 1; fi

echo "==> [1/5] Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker --version

echo "==> [2/5] Getting the code into ${INSTALL_DIR}..."
if [ ! -d "${INSTALL_DIR}/.git" ]; then
  if [ -n "${REPO_URL}" ] && [[ "${REPO_URL}" != *"YOUR_USER"* ]]; then
    apt-get update -y && apt-get install -y git
    git clone "${REPO_URL}" "${INSTALL_DIR}"
  else
    echo "   REPO_URL not set. Place the project at ${INSTALL_DIR} yourself,"
    echo "   then re-run this script."
    exit 1
  fi
fi
cd "${INSTALL_DIR}"

echo "==> [3/5] DuckDNS updater (keeps ${DOMAIN} pointing at this server)..."
if [ -n "${DUCKDNS_TOKEN}" ]; then
  SUBDOMAIN="${DOMAIN%%.*}"
  mkdir -p /opt/duckdns
  (crontab -l 2>/dev/null; \
   echo "*/5 * * * * curl -s \"https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=\" > /opt/duckdns/duck.log") | crontab -
  echo -n "DuckDNS response: "
  curl -s "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip="; echo "  (should print OK)"
else
  echo "   Skipped (no DUCKDNS_TOKEN). Make sure ${DOMAIN} -> this server's public IP yourself."
fi

echo "==> [4/5] Building & starting app + Caddy (free HTTPS)..."
export DOMAIN
docker compose up -d --build

echo "==> [5/5] Waiting for the app to come up..."
sleep 10
docker compose ps
curl -s -o /dev/null -w "App status via Caddy: HTTP %{http_code}\n" "http://localhost" || true

IP=$(curl -s ifconfig.me || echo "<your-public-ip>")
cat <<EOF

===============================================================
  DONE — Clothing Business Manager is deploying.

  1. Wait ~1-2 min, then open:  https://${DOMAIN}
     (Caddy is fetching a free Let's Encrypt certificate)

  2. Create your first OWNER login:
     cd ${INSTALL_DIR}
     docker compose exec app bun scripts/create-admin-user.ts admin "Your Name" "StrongPass!"

  3. Useful commands:
     docker compose logs -f app      # app logs
     docker compose logs -f caddy    # certificate progress
     docker compose up -d --build    # redeploy after code changes

  Public IP of this server: ${IP}
  (DNS A record for ${DOMAIN} must point to it)
===============================================================
EOF