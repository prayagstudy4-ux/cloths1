# Deploying "Clothing Business Manager" — FULLY FREE (quick path)

> Total cost: **$0/month, forever.** Uses Oracle Cloud Always Free (free VPS) +
> DuckDNS (free domain) + Caddy (free HTTPS, already in this repo).

## 100% free stack
| Piece | Free service | Cost |
|---|---|---|
| Server (VPS) | Oracle Cloud **Always Free** (4 ARM cores / 24 GB / 200 GB) | $0 forever |
| Domain | **DuckDNS** free subdomain (`yourapp.duckdns.org`) | $0 |
| HTTPS certificate | **Caddy** + Let's Encrypt (automatic) | $0 |
| App runtime | Docker + this repo's `docker-compose.yml` | $0 |

## Steps (15–30 minutes)

1. **Sign up** — https://www.oracle.com/cloud/free/
   (card needed only to verify identity; Always Free stays $0).

2. **Create a Compute instance** — Ubuntu 22.04, shape **VM.Standard.A1.Flex**
   (Ampere A1 = the always-free one), 2 OCPU / 12 GB is plenty.
   Download your SSH key. Open ports 80 + 443 in the instance's **security list**.

3. **Free domain** — sign up at https://www.duckdns.org, create `yourapp`
   (you get `yourapp.duckdns.org` + a token). Its A record auto-points at your IP
   via the setup script below.

4. **Get the code onto the server** — push this project to a GitHub repo, then:
   ```bash
   ssh ubuntu@<SERVER_PUBLIC_IP>
   ```

5. **Run the one-shot installer** — edit 3 lines at the top of
   `deploy/free-vps-setup.sh` (`REPO_URL`, `DOMAIN`, `DUCKDNS_TOKEN`), then:
   ```bash
   sudo bash deploy/free-vps-setup.sh
   ```
   It installs Docker, clones the repo, keeps DuckDNS in sync, builds & starts
   the app + Caddy, and prints the command to create your first login.

6. **Create your login** (printed at the end):
   ```bash
   cd /opt/cbm
   docker compose exec app bun scripts/create-admin-user.ts admin "Your Name" "StrongPass!"
   ```

7. Open **https://yourapp.duckdns.org** 🎉

Details, backups and maintenance commands are below.

---

# Deploying "Clothing Business Manager" to a VPS (Option C)
# Deploying "Clothing Business Manager" to a VPS (Option C)

This guide deploys the app to a small cloud server (VPS) with Docker + Caddy so it
is **always online** with a real domain and **free automatic HTTPS**.

> Everything needed is already in this folder: `Dockerfile`, `docker-compose.yml`,
> `.env.production`, `deploy/Caddyfile`, `scripts/entrypoint.sh`,
> `scripts/create-admin-user.ts`.

---

## 1. Get a VPS and a domain

- **VPS** (pick any; Ubuntu 22.04/24.04 LTS works best): Hetzner, DigitalOcean,
  Vultr, Linode, or a free tier (Google Cloud / Oracle Cloud). A ~1–2 GB RAM /
  1 vCPU server is plenty for this app.
- **Domain** (e.g. from Namecheap, Cloudflare, Porkbun). You need one you can
  point DNS records for.

---

## 2. Point DNS to the server

In your DNS provider, create an **A record**:

| Type | Name  | Value (your VPS public IP) | TTL |
|------|-------|-----------------------------|-----|
| A    | app   | `203.0.113.10` (your IP)    | auto |

So `app.yourdomain.com` now points at your server. (Use your real IP and subdomain.)

---

## 3. Get the project onto the VPS

On your **local** machine, create a git repo of the project (`.env` and `db/` are
already git-ignored), push it to GitHub/GitLab, then on the server:

```bash
# on the VPS
sudo apt update && sudo apt install -y git curl
git clone https://github.com/YOU/cbm.git /opt/cbm
cd /opt/cbm
```

(No VPS handy yet? You can also `scp`/`rsync` the folder up, or use GitHub Codespaces.)

---

## 4. Install Docker on the VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then log out & back in (or use sudo docker)
sudo systemctl enable --now docker
```

---

## 5. Start the app (build + run)

```bash
cd /opt/cbm
DOMAIN=app.yourdomain.com docker compose up -d --build
```

- This **builds** the app, applies the DB schema at startup, and starts it behind
  Caddy on ports 80/443.
- First run downloads images and compiles — give it a couple of minutes.

Check it's healthy:

```bash
docker compose ps
docker compose logs -f app      # watch for "Ready"
docker compose logs -f caddy    # watch for the TLS certificate being issued
```

Once Caddy logs something like
`certificate obtained successfully`, open **https://app.yourdomain.com**.

---

## 6. Create your admin login

The DB starts empty, so create the first OWNER account. Because your dev DB import
already has no users either, run this **inside the running container**:

```bash
docker compose exec app bun scripts/create-admin-user.ts admin "Your Name" "YourStrongPass!"
```

Then log in at `https://app.yourdomain.com` with `admin` / the password you set.

---

## Everyday commands

```bash
docker compose ps                  # status
docker compose logs -f app         # app logs
docker compose logs -f caddy       # TLS / proxy logs
docker compose up -d --build       # rebuild after code changes
docker compose down                # stop (data persists in volumes)
docker compose down -v             # ⚠️ resets DB & certificates — avoid
```

---

## Data & backups

Everything important lives in Docker **named volumes**:

- `cbm-db`      → the SQLite database (`/app/db/custom.db`)
- `cbm-appdata` → the session-secret key (`/app/app-data/secret.key`)
- `caddy-data`  → your TLS certificates

Back up the db volume with:

```bash
docker run --rm -v cbm-db:/data -v $(pwd):/backup \
  alpine tar czf /backup/cbm-db.tgz -C /data .
```

Restore by removing the volume and re-running the same command in reverse.

---

## Updating the app

```bash
cd /opt/cbm
git pull
DOMAIN=app.yourdomain.com docker compose up -d --build
```

The entrypoint re-runs `prisma db push` on restart, so schema changes apply automatically.

---

## Optional: no-Docker alternative (plain install)

If you prefer not to use Docker, on the VPS:

```bash
# install bun: https://bun.sh
bun install
bunx prisma db push
DOMAIN context — put your domain in Caddyfile and install Caddy:
#   :443 and :80 reverse_proxy to 127.0.0.1:3000
bun run build
NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 bunx next start &   # or: nohup bun run start
```
