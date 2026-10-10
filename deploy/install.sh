#!/usr/bin/env bash
# Instala o actualiza Giraboard como servicio del sistema (systemd).
# Probado para Ubuntu/Debian y Raspberry Pi OS de 64 bits.
#
# Uso (desde la carpeta del proyecto, en el servidor):
#   sudo ./deploy/install.sh pendientes.tu-dominio.com   # VPS o Raspberry con puertos abiertos: HTTPS con Caddy
#   sudo ./deploy/install.sh --tunel                  # Raspberry con Cloudflare Tunnel (sin abrir puertos)
#   sudo ./deploy/install.sh --red-local              # Solo dentro de la oficina: http://IP-del-equipo:3000
#
# Volver a correrlo con el código nuevo = actualizar. Los datos no se tocan.
set -euo pipefail

APP_DIR=/opt/giraboard
DATA_ROOT=/var/lib/giraboard
ENV_DIR=/etc/giraboard
ENV_FILE=$ENV_DIR/giraboard.env
SERVICE=giraboard
APP_USER=giraboard
PORT=3000
NODE_MAJOR=24

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Corre este script con sudo."
[ $# -eq 1 ] || die "Indica el dominio (ej. pendientes.tu-dominio.com), --tunel o --red-local."

MODE=caddy
DOMAIN=""
case "$1" in
  --tunel) MODE=tunel ;;
  --red-local) MODE=lan ;;
  -*) die "Opción desconocida: $1" ;;
  *) DOMAIN="$1" ;;
esac
if [ "$MODE" = caddy ] && ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
  die "«$DOMAIN» no parece un dominio válido."
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SRC_DIR/server/index.ts" ] || die "No encuentro el código en $SRC_DIR"
command -v apt-get >/dev/null || die "Este script es para Debian, Ubuntu o Raspberry Pi OS."

export DEBIAN_FRONTEND=noninteractive

# ---------- Paquetes base ----------
say "Revisando paquetes del sistema"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync >/dev/null

# ---------- Node.js ----------
node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' || echo 0; }
if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
  say "Instalando Node.js $NODE_MAJOR (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN="$(command -v node)"
say "Node.js $($NODE_BIN -v) en $NODE_BIN"

# ---------- Caddy (HTTPS automático) ----------
if [ "$MODE" = caddy ] && ! command -v caddy >/dev/null; then
  say "Instalando Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---------- Usuario y carpetas ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  say "Creando el usuario de sistema «$APP_USER»"
  useradd --system --home-dir "$DATA_ROOT" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR" "$DATA_ROOT/data" "$ENV_DIR"
chown "$APP_USER:$APP_USER" "$DATA_ROOT" "$DATA_ROOT/data"
chmod 750 "$DATA_ROOT" "$DATA_ROOT/data"

# Respaldo antes de actualizar
if [ -f "$DATA_ROOT/data/giraboard.db" ] && [ -f "$APP_DIR/server/cli.ts" ]; then
  say "Respaldando la base de datos antes de actualizar"
  runuser -u "$APP_USER" -- env DATA_DIR="$DATA_ROOT/data" "$NODE_BIN" --disable-warning=ExperimentalWarning "$APP_DIR/server/cli.ts" respaldo || true
fi

# ---------- Código ----------
say "Copiando el código a $APP_DIR"
rsync -a --delete \
  --exclude node_modules --exclude dist --exclude data --exclude .git --exclude .claude \
  --exclude '*.log' --exclude .DS_Store \
  "$SRC_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

say "Instalando dependencias y compilando la interfaz (puede tardar unos minutos)"
runuser -u "$APP_USER" -- env HOME="$DATA_ROOT" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent && npm prune --omit=dev --no-audit --no-fund --loglevel=error"

# ---------- Configuración ----------
if [ "$MODE" = lan ]; then HOST=0.0.0.0; else HOST=127.0.0.1; fi
if [ "$MODE" = lan ]; then TRUST=0; else TRUST=1; fi
if [ ! -f "$ENV_FILE" ]; then
  say "Creando $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
# Configuración de Giraboard. Después de cambiarla: sudo systemctl restart $SERVICE
NODE_ENV=production
PORT=$PORT
HOST=$HOST
DATA_DIR=$DATA_ROOT/data
# 1 = la app está detrás de Caddy o de Cloudflare Tunnel (confía en la IP que ellos reportan)
TRUST_PROXY=$TRUST
EOF
else
  sed -i "s/^HOST=.*/HOST=$HOST/; s/^TRUST_PROXY=.*/TRUST_PROXY=$TRUST/" "$ENV_FILE"
fi
chmod 640 "$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE"

# ---------- Servicio systemd ----------
say "Configurando el servicio $SERVICE"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=Giraboard - tablero de pendientes
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN --disable-warning=ExperimentalWarning server/index.ts
Restart=always
RestartSec=3
TimeoutStopSec=15

# Protecciones: la app solo puede escribir en su carpeta de datos
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ReadWritePaths=$DATA_ROOT
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

# Comando «giraboard» para administrar desde la terminal
cat > /usr/local/bin/giraboard <<EOF
#!/bin/sh
# Administración de Giraboard. Ejemplos: giraboard usuarios · giraboard restablecer ana · giraboard logs
case "\$1" in
  logs) exec journalctl -u $SERVICE -f -n 100 ;;
  estado) exec systemctl status $SERVICE ;;
  reiniciar) exec systemctl restart $SERVICE ;;
esac
[ "\$(id -u)" -eq 0 ] || { echo "Usa: sudo giraboard \$*"; exit 1; }
set -a; . $ENV_FILE; set +a
cd $APP_DIR || exit 1
exec runuser -u $APP_USER -- env DATA_DIR="\$DATA_DIR" NODE_ENV=production $NODE_BIN --disable-warning=ExperimentalWarning server/cli.ts "\$@"
EOF
chmod 755 /usr/local/bin/giraboard

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

# ---------- Caddy ----------
if [ "$MODE" = caddy ]; then
  CADDYFILE=/etc/caddy/Caddyfile
  BLOCK="$DOMAIN {
	# Comprimir todo menos el canal de tiempo real
	@notEvents not path /api/events
	encode @notEvents zstd gzip

	request_body {
		max_size 30MB
	}

	reverse_proxy 127.0.0.1:$PORT {
		# Entregar los avisos en tiempo real sin esperar
		flush_interval -1
	}
}"
  if [ -f "$CADDYFILE" ] && grep -q "^$DOMAIN " "$CADDYFILE"; then
    say "Caddy ya tiene configurado $DOMAIN"
  elif [ ! -f "$CADDYFILE" ] || grep -q '^:80' "$CADDYFILE"; then
    say "Configurando Caddy para https://$DOMAIN"
    [ -f "$CADDYFILE" ] && cp "$CADDYFILE" "$CADDYFILE.original"
    printf '%s\n' "$BLOCK" > "$CADDYFILE"
  else
    say "Agregando $DOMAIN al Caddyfile existente"
    printf '\n%s\n' "$BLOCK" >> "$CADDYFILE"
  fi
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 || die "La configuración de Caddy tiene un error: revisa $CADDYFILE"
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
    ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
  fi
fi

# ---------- Verificación ----------
say "Esperando a que arranque"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
[ "${OK:-0}" = 1 ] || die "El servicio no respondió. Revisa: journalctl -u $SERVICE -n 50"

echo
echo "  ✅ Giraboard está corriendo."
case "$MODE" in
  caddy) echo "  Abre: https://$DOMAIN  (el certificado HTTPS puede tardar un minuto la primera vez)" ;;
  tunel) echo "  Apunta el túnel de Cloudflare a http://localhost:$PORT (ver docs/DESPLIEGUE.md)" ;;
  lan) echo "  Abre desde la oficina: http://$(hostname -I | awk '{print $1}'):$PORT" ;;
esac
CODE_LINE="$(/usr/local/bin/giraboard codigo 2>/dev/null || true)"
case "$CODE_LINE" in
  *"Código de configuración"*) echo "  Primera vez → $CODE_LINE (te lo pedirá la página para crear la cuenta de admin)" ;;
esac
echo
echo "  Comandos útiles: sudo giraboard usuarios · sudo giraboard restablecer <usuario> · giraboard logs"
echo
