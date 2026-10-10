# Deploying Giraboard on your own server

*[Leer en español](DESPLIEGUE.md)*

Giraboard runs as a **systemd service**: it **starts by itself when the machine boots** (no login needed) and restarts within 3 seconds if anything fails. You don't need to keep a terminal open. The database is a single SQLite file, so there's nothing else to install. HTTPS for your domain is handled by **Caddy**, which obtains and renews certificates automatically.

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

Open `http://SERVER_IP:3000` or `http://raspberrypi.local:3000` from any computer or phone on the same network (the installer prints both).

If you were trying it with `npm run probar` in a terminal, stop that first with **Ctrl+C**; the service replaces it. To keep what you entered while testing, add `--importar-datos ~/giraboard/data` the first time (it only imports into an empty board).

## Several boards on one machine

One Raspberry Pi can host several **independent** boards, each with its own accounts, tasks and backups, on its own port (e.g. two businesses or two branches).

```bash
cd ~/giraboard && sudo ./deploy/install.sh --red-local --nombre ventas --puerto 3001
```

- `--nombre` (name): lowercase letters, digits and dashes. The first board you install is called **principal**.
- `--puerto` (port): optional; if omitted the next free port is used (3001, 3002…). The installer refuses ports used by another board or program.
- Works with a domain or tunnel too: `sudo ./deploy/install.sh sales.your-domain.com --nombre ventas`.
- All boards share the same code, so updating updates and restarts all of them.

| To | Command |
|---|---|
| List boards, their port and status | `sudo ./deploy/install.sh --lista` or `sudo giraboard tableros` |
| Run the commands below on another board | add `-t NAME`, e.g. `sudo giraboard -t ventas usuarios` |
| Remove a board (its data is kept) | `sudo ./deploy/install.sh --quitar ventas` |

## Step 3 · First run

1. When the installer finishes it prints a **setup code** (e.g. `4405-8656`). You can show it again with `sudo giraboard codigo`.
2. Open `https://tasks.your-domain.com`. It asks for the setup code, your business name, a starter set of task types and the admin account. The time zone is taken from your browser and can be changed later in *Settings*.
3. In **Equipo y ajustes → Agregar persona** (Team & settings → Add person) create an account for each teammate. Giraboard generates a temporary password and a ready-to-send message. On first login, each person picks their own password.

The setup code prevents anyone on the internet from claiming the admin account of a fresh install before you do. It stops working once setup is complete.

## Accounts

There are three roles, enforced by the server on every request (not just hidden in the UI).

| | Admin | Coordinación (manager) | Equipo (team) |
|---|:-:|:-:|:-:|
| See their own tasks, the ones they requested and the ones they're copied on | ✅ | ✅ | ✅ |
| See everyone's tasks and the "Por asignar" (unassigned) inbox | ✅ | ✅ | — |
| Assign tasks to other people | ✅ | ✅ | if the admin allows it |
| See the dashboard and team activity | ✅ | ✅ | — |
| Archive tasks | ✅ | ✅ | the ones they created |
| Delete tasks | ✅ | — | — |
| Manage people, roles, settings and backups | ✅ | — | — |

- A task can have **several assignees** (it shows up for all of them and any of them can complete it) and **followers** who see it and get notifications.
- Tasks created **without an assignee** go to the **"Por asignar"** inbox, visible only to admins, managers and whoever created them; leads are notified.
- Anyone can delete their own note or file within 15 minutes; after that only an admin can.
- There can be several admins, but at least one must remain.
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
| `sudo giraboard tableros` | List installed boards, their port and status |
| `sudo giraboard usuarios` | List people, whether they have access and their last login |
| `sudo giraboard restablecer <user>` | Set a temporary password |
| `sudo giraboard crear-admin <user> "Name"` | Create another admin |
| `sudo giraboard activar <user>` | Restore someone's access |
| `sudo giraboard respaldo` | Back up the database now |
| `sudo giraboard codigo` | Show the first-run setup code |
| `giraboard logs` | Follow the app logs (Ctrl+C to exit) |
| `giraboard estado` / `sudo giraboard reiniciar` | Service status / restart |

With several boards, add `-t NAME` right after `giraboard` (e.g. `giraboard -t ventas logs`).

## Updating

One command updates every board on the machine. It backs up each database first and never touches your data or settings:

```bash
cd ~/giraboard && git pull && sudo ./deploy/install.sh --actualizar
```

(Re-running your original install command also updates.) Anyone with the app open sees "Hay una versión nueva" with a reload button.

## Backups

- **Automatic**: one database backup per day in `/var/lib/giraboard/data/backups/` (the last 30 are kept). Other boards: `/var/lib/giraboard/tableros/NAME/backups/`.
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
| Data (database, files, backups) | `/var/lib/giraboard/data` (other boards: `/var/lib/giraboard/tableros/NAME`) |
| Configuration | `/etc/giraboard/giraboard.env` (others: `/etc/giraboard/NAME.env`), then `sudo giraboard reiniciar` |
| Service | `giraboard.service` (others: `giraboard-NAME.service`) in `/etc/systemd/system/` |
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
