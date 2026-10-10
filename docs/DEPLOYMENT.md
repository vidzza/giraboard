# Deploying Giraboard on your own server

*[Leer en español](DESPLIEGUE.md)*

Giraboard runs as a **systemd service**: it starts when the machine boots and restarts if anything fails. The database is a single SQLite file, so there's nothing else to install. HTTPS for your domain is handled by **Caddy**, which obtains and renews certificates automatically.

The examples below use `tasks.your-domain.com`. Replace it with your real subdomain.

## Where should it run?

| Option | Best for | Approx. cost |
|---|---|---|
| **A. VPS** (Hetzner, DigitalOcean, Vultr, Lightsail) with Ubuntu 24.04 | Simplest and most reliable. It has a fixed IP and doesn't depend on the office's internet or power. | ~$5–6 USD/month |
| **B. Raspberry Pi** 4 or 5 (2 GB+) with **64-bit** Raspberry Pi OS and a good SSD/SD card | Keeping it in the office | Just the hardware |

Requirements: Node.js 24+ (the installer sets it up), 1 GB RAM and access to your domain's DNS. Supported systems: Debian, Ubuntu and Raspberry Pi OS (64-bit).

## Step 1 · Get the code on the server

SSH into the server and clone the repository:

```bash
sudo apt-get install -y git && git clone https://github.com/vidzza/giraboard.git ~/giraboard
```

If you have local changes, you can copy your working folder instead:

```bash
rsync -av --exclude node_modules --exclude data --exclude dist --exclude .git ./ user@SERVER_IP:~/giraboard/
```

The server always starts with a clean database, without demo data.

## Step 2 · Install

Pick **one** of these modes.

### A. VPS (or a Raspberry Pi with ports 80/443 forwarded)

1. In your DNS provider, create an **A** record: name `tasks`, value = the server's public IP.
2. Wait until it resolves (`ping tasks.your-domain.com` shows the IP), then run:

```bash
cd ~/giraboard && sudo ./deploy/install.sh tasks.your-domain.com
```

For a Raspberry Pi in the office using this mode, forward ports **80 and 443** on the router to the Pi. You also need a fixed public IP or dynamic DNS. If your ISP doesn't give you a real public IP (CGNAT), use option B.

### B. Raspberry Pi behind Cloudflare Tunnel (no open ports)

This works even without a fixed IP. It requires your domain's DNS to be managed by Cloudflare (free plan is fine).

1. Install Giraboard without Caddy:
   ```bash
   cd ~/giraboard && sudo ./deploy/install.sh --tunel
   ```
2. In Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*). Install `cloudflared` following the Debian instructions on that page, then run the `sudo cloudflared service install …` command it gives you.
3. Add a **Public Hostname** to the tunnel: `tasks.your-domain.com` → service `HTTP` → `localhost:3000`.

### C. Office network only (no domain)

```bash
cd ~/giraboard && sudo ./deploy/install.sh --red-local
```

Open `http://SERVER_IP:3000` from any computer on the same network.

## Step 3 · First run

1. When the installer finishes it prints a **setup code** (e.g. `4405-8656`). You can show it again with `sudo giraboard codigo`.
2. Open `https://tasks.your-domain.com`. It asks for the setup code, your business name, a starter set of task types and the admin account. The time zone is taken from your browser and can be changed later in *Settings*.
3. In **Equipo y ajustes → Agregar persona** (Team & settings → Add person) create an account for each teammate. Giraboard generates a temporary password and a ready-to-send message. On first login, each person picks their own password.

The setup code prevents anyone on the internet from claiming the admin account of a fresh install before you do. It stops working once setup is complete.

## Accounts

- **Admin** can:
  - add people and give them a new password if they forget theirs
  - remove access
  - edit task types and the time zone
  - delete tasks and download data

  There can be several admins, but at least one must remain.
- **Team** members see and work on every task, and can only change their own profile and password.
- **Forgotten password**: an admin goes to *Team → Edit → "Darle una contraseña nueva"*. The person's sessions are closed and they choose a new password on next login.
- **Someone leaves**: uncheck *"Tiene acceso"*. Giraboard asks who should take over their open tasks; their history is preserved.
- **The only admin is locked out**: from the server's terminal (replace `ana` with the username):
  ```bash
  sudo giraboard restablecer ana
  ```
- Sessions last 30 days and renew themselves while in use. A button lets you sign out of all other devices.
- After 8 failed attempts, that username is locked for 15 minutes.

## Server commands

| Command | What it does |
|---|---|
| `sudo giraboard usuarios` | List people, whether they have access and their last login |
| `sudo giraboard restablecer <user>` | Set a temporary password |
| `sudo giraboard crear-admin <user> "Name"` | Create another admin |
| `sudo giraboard activar <user>` | Restore someone's access |
| `sudo giraboard respaldo` | Back up the database now |
| `sudo giraboard codigo` | Show the first-run setup code |
| `giraboard logs` | Follow the app logs (Ctrl+C to exit) |
| `giraboard estado` / `sudo giraboard reiniciar` | Service status / restart |

## Updating

Pull the new code and run the same install command again. It backs up the database first and never touches your data.

```bash
cd ~/giraboard && git pull && sudo ./deploy/install.sh tasks.your-domain.com
```

## Backups

- **Automatic**: one database backup per day in `/var/lib/giraboard/data/backups/` (the last 30 are kept).
- **From the app**: *Settings → "Descargar respaldo completo"* (full backup) and *"Descargar pendientes para Excel"* (CSV).
- **Off-site** (recommended weekly). This copies everything, including attachments:
  ```bash
  rsync -av root@SERVER_IP:/var/lib/giraboard/data/ ~/Backups/giraboard/
  ```

To **restore**:

1. `sudo systemctl stop giraboard`
2. Copy the backup over `/var/lib/giraboard/data/giraboard.db`.
3. Delete `giraboard.db-wal` and `giraboard.db-shm` if present.
4. `sudo chown giraboard: /var/lib/giraboard/data/giraboard.db`
5. `sudo systemctl start giraboard`

## Where things live

| What | Where |
|---|---|
| Code | `/opt/giraboard` |
| Data (database, files, backups) | `/var/lib/giraboard/data` |
| Configuration | `/etc/giraboard/giraboard.env` (then `sudo giraboard reiniciar`) |
| Service | `/etc/systemd/system/giraboard.service` |
| HTTPS | `/etc/caddy/Caddyfile` |

## Troubleshooting

- `giraboard logs`: app errors.
- `sudo journalctl -u caddy -n 50`: certificate problems. This is usually DNS not pointing to the server yet, or ports 80/443 closed.
- `curl http://127.0.0.1:3000/api/health` on the server should return `{"ok":true}`.

## Built-in security

- The app only listens on localhost; Caddy is the only thing exposed, always over HTTPS.
- Passwords are hashed with scrypt; sessions use HttpOnly cookies; failed logins are rate-limited.
- CSRF protection, security headers and a strict Content-Security-Policy.
- Uploaded files can't execute in the browser.
- The service runs as an unprivileged user that can only write to its data folder.
- The site asks search engines not to index it (`noindex`).
