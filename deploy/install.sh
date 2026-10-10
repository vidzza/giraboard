#!/usr/bin/env bash
# Instala o actualiza Giraboard como servicio del sistema (systemd): arranca solo al prender
# el equipo y se reinicia si algo falla. Probado en Ubuntu/Debian y Raspberry Pi OS de 64 bits.
#
# Uso (desde la carpeta del proyecto, en el servidor):
#   sudo ./deploy/install.sh --red-local                  # Solo en la oficina: http://IP-del-equipo:3000
#   sudo ./deploy/install.sh pendientes.tu-dominio.com    # VPS o Raspberry con puertos abiertos: HTTPS con Caddy
#   sudo ./deploy/install.sh --tunel                      # Raspberry con Cloudflare Tunnel (sin abrir puertos)
#
# Varios tableros en el mismo equipo (cada uno con sus cuentas y sus datos, en su propio puerto):
#   sudo ./deploy/install.sh --red-local --nombre ventas --puerto 3001
#
# Mantenimiento:
#   sudo ./deploy/install.sh --actualizar       # Pone el código nuevo en TODOS los tableros (no toca datos ni ajustes)
#   sudo ./deploy/install.sh --lista            # Muestra los tableros instalados, su puerto y si están corriendo
#   sudo ./deploy/install.sh --quitar ventas    # Detiene y quita un tablero (sus datos se conservan)
#
# Opción extra al crear un tablero:
#   --importar-datos CARPETA   Copia la base de datos y archivos de otra instalación (ej. ~/giraboard/data)
#
# Volver a correr el mismo comando = actualizar. Antes se respaldan las bases de datos; los datos no se tocan.
set -euo pipefail

APP_DIR=/opt/giraboard
DATA_ROOT=/var/lib/giraboard
ENV_DIR=/etc/giraboard
APP_USER=giraboard
DEFAULT_PORT=3000
NODE_MAJOR=24

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mAviso:\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "Corre este script con sudo."
[ $# -ge 1 ] || usage

# ---------- Opciones ----------
ACTION=install
MODE=""
DOMAIN=""
NAME=principal
PORT_ARG=""
IMPORT_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --red-local) MODE=lan ;;
    --tunel) MODE=tunel ;;
    --actualizar) ACTION=update ;;
    --lista) ACTION=list ;;
    --quitar)
      ACTION=remove
      NAME="${2:-}"
      [ -n "$NAME" ] || die "Indica qué tablero quitar, ej. --quitar ventas"
      shift
      ;;
    --nombre)
      NAME="${2:-}"
      shift
      ;;
    --puerto)
      PORT_ARG="${2:-}"
      shift
      ;;
    --importar-datos)
      IMPORT_DIR="${2:-}"
      shift
      ;;
    -h | --ayuda | --help) usage ;;
    -*) die "Opción desconocida: $1 (usa --ayuda)" ;;
    *)
      MODE=caddy
      DOMAIN="$1"
      ;;
  esac
  shift
done

# ---------- Tableros (instancias) ----------
# El tablero «principal» conserva las rutas de siempre; los demás llevan su nombre.
instance_vars() {
  local name="$1"
  case "$name" in
    principal | giraboard | "")
      INSTANCE=principal
      SERVICE=giraboard
      ENV_FILE="$ENV_DIR/giraboard.env"
      DATA_DIR="$DATA_ROOT/data"
      ;;
    *)
      [[ "$name" =~ ^[a-z0-9][a-z0-9-]{0,29}$ ]] || die "El nombre «${name}» solo puede tener minúsculas, números y guiones (ej. ventas, oficina-2)."
      INSTANCE="$name"
      SERVICE="giraboard-$name"
      ENV_FILE="$ENV_DIR/$name.env"
      DATA_DIR="$DATA_ROOT/tableros/$name"
      ;;
  esac
}

env_value() { # env_value ARCHIVO CLAVE → valor (vacío si no existe el archivo o la clave)
  [ -f "$1" ] || return 0
  sed -n "s/^$2=//p" "$1" | tail -n 1
}

# Lista de nombres de tableros instalados (uno por línea).
installed_instances() {
  local f base
  [ -d "$ENV_DIR" ] || return 0
  [ -f "$ENV_DIR/giraboard.env" ] && echo principal
  for f in "$ENV_DIR"/*.env; do
    [ -f "$f" ] || continue
    base="$(basename "$f" .env)"
    [ "$base" = giraboard ] || echo "$base"
  done
}

port_in_use() { # port_in_use PUERTO → 0 si alguien escucha en ese puerto
  if command -v ss >/dev/null; then
    [ -n "$(ss -ltnH "sport = :$1" 2>/dev/null)" ]
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

port_owner() { # Nombre del tablero que usa ese puerto (vacío si ninguno)
  local i
  for i in $(installed_instances); do
    instance_vars "$i"
    if [ "$(env_value "$ENV_FILE" PORT)" = "$1" ]; then
      echo "$i"
      return
    fi
  done
}

lan_ip() { hostname -I 2>/dev/null | awk '{print $1}'; }

instance_url() { # URL para abrir el tablero
  local mode domain port
  mode="$(env_value "$ENV_FILE" GIRABOARD_MODE)"
  domain="$(env_value "$ENV_FILE" GIRABOARD_DOMAIN)"
  port="$(env_value "$ENV_FILE" PORT)"
  if [ -z "$mode" ]; then
    if [ "$(env_value "$ENV_FILE" HOST)" = 0.0.0.0 ]; then mode=lan; else mode=caddy; fi
  fi
  case "$mode" in
    lan) echo "http://$(lan_ip):$port   (o http://$(hostname).local:$port)" ;;
    caddy) if [ -n "$domain" ]; then echo "https://$domain"; else echo "detrás de Caddy, puerto $port"; fi ;;
    tunel) echo "por Cloudflare Tunnel → http://localhost:$port" ;;
  esac
}

print_list() (
  any=0
  for i in $(installed_instances); do
    any=1
    instance_vars "$i"
    printf '  %-14s puerto %-6s %-10s %s\n' "$INSTANCE" "$(env_value "$ENV_FILE" PORT)" "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" "$(instance_url)"
  done
  [ "$any" = 1 ] || echo "  (todavía no hay tableros instalados)"
)

if [ "$ACTION" = list ]; then
  echo
  echo "Tableros de Giraboard en este equipo:"
  print_list
  echo
  exit 0
fi

if [ "$ACTION" = remove ]; then
  instance_vars "$NAME"
  [ -f "$ENV_FILE" ] || die "No existe el tablero «${NAME}». Usa --lista para ver los que hay."
  say "Deteniendo y quitando el tablero «${INSTANCE}»"
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$SERVICE.service" "$ENV_FILE"
  systemctl daemon-reload
  echo
  echo "  Listo. Sus datos siguen en $DATA_DIR (bórralos a mano solo si estás seguro)."
  echo
  exit 0
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SRC_DIR/server/index.ts" ] || die "No encuentro el código en $SRC_DIR"
command -v apt-get >/dev/null || die "Este script es para Debian, Ubuntu o Raspberry Pi OS."

if [ "$ACTION" = update ]; then
  [ -n "$(installed_instances)" ] || die "No hay tableros instalados todavía. Instala uno primero, ej.: sudo ./deploy/install.sh --red-local"
else
  [ -n "$MODE" ] || die "Indica cómo se va a usar: --red-local, --tunel o un dominio (ej. pendientes.tu-dominio.com)."
  if [ "$MODE" = caddy ] && ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    die "«${DOMAIN}» no parece un dominio válido."
  fi
  instance_vars "$NAME"
  CURRENT_PORT="$(env_value "$ENV_FILE" PORT)"
  if [ -n "$PORT_ARG" ]; then
    [[ "$PORT_ARG" =~ ^[0-9]+$ ]] && [ "$PORT_ARG" -ge 1024 ] && [ "$PORT_ARG" -le 65535 ] || die "El puerto debe ser un número entre 1024 y 65535."
    PORT="$PORT_ARG"
  elif [ -n "$CURRENT_PORT" ]; then
    PORT="$CURRENT_PORT"
  elif [ "$INSTANCE" = principal ]; then
    PORT="$DEFAULT_PORT"
  else
    PORT=$((DEFAULT_PORT + 1))
    while [ -n "$(port_owner "$PORT")" ] || port_in_use "$PORT"; do PORT=$((PORT + 1)); done
    instance_vars "$NAME"
  fi
  OWNER="$(port_owner "$PORT")"
  instance_vars "$NAME"
  if [ -n "$OWNER" ] && [ "$OWNER" != "$INSTANCE" ]; then
    die "El puerto $PORT ya lo usa el tablero «${OWNER}». Elige otro con --puerto."
  fi
  if [ "$PORT" != "$CURRENT_PORT" ] && port_in_use "$PORT"; then
    die "Otro programa ya usa el puerto $PORT (¿quedó abierto «npm run probar» en una terminal? ciérralo con Ctrl+C). Elige otro con --puerto."
  fi
  if [ -n "$IMPORT_DIR" ]; then
    [ -f "$IMPORT_DIR/giraboard.db" ] || die "No encuentro $IMPORT_DIR/giraboard.db para importar."
    [ ! -f "$DATA_DIR/giraboard.db" ] || die "El tablero «${INSTANCE}» ya tiene datos; no se importa encima para no perder nada."
  fi
fi

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
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---------- Usuario y carpetas ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  say "Creando el usuario de sistema «${APP_USER}»"
  useradd --system --home-dir "$DATA_ROOT" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR" "$DATA_ROOT" "$ENV_DIR"
chown "$APP_USER:$APP_USER" "$DATA_ROOT"
chmod 750 "$DATA_ROOT"
if [ "$ACTION" = install ]; then
  mkdir -p "$DATA_DIR"
  [ "$INSTANCE" = principal ] || { mkdir -p "$DATA_ROOT/tableros" && chown "$APP_USER:$APP_USER" "$DATA_ROOT/tableros"; }
  chown "$APP_USER:$APP_USER" "$DATA_DIR"
  chmod 750 "$DATA_DIR"
fi

# ---------- Respaldo antes de actualizar ----------
# (Los recorridos por todos los tableros van entre paréntesis para no cambiar el tablero que se está instalando.)
if [ -f "$APP_DIR/server/cli.ts" ]; then
  (
    for i in $(installed_instances); do
      instance_vars "$i"
      d="$(env_value "$ENV_FILE" DATA_DIR)"
      if [ -n "$d" ] && [ -f "$d/giraboard.db" ]; then
        say "Respaldando la base de datos del tablero «${i}»"
        runuser -u "$APP_USER" -- env DATA_DIR="$d" "$NODE_BIN" --disable-warning=ExperimentalWarning "$APP_DIR/server/cli.ts" respaldo || warn "no se pudo respaldar «${i}» (se continúa)"
      fi
    done
  )
fi

# ---------- Código (uno solo para todos los tableros) ----------
say "Copiando el código a $APP_DIR"
rsync -a --delete \
  --exclude node_modules --exclude dist --exclude data --exclude .git --exclude .claude \
  --exclude '*.log' --exclude .DS_Store \
  "$SRC_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

say "Instalando dependencias y compilando la interfaz (en una Raspberry puede tardar unos minutos)"
runuser -u "$APP_USER" -- env HOME="$DATA_ROOT" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent && npm prune --omit=dev --no-audit --no-fund --loglevel=error"

# ---------- Importar datos de otra instalación ----------
if [ "$ACTION" = install ] && [ -n "$IMPORT_DIR" ]; then
  say "Importando datos de $IMPORT_DIR"
  # Copia consistente aunque la otra instalación siga abierta (VACUUM INTO lee también lo pendiente del WAL).
  SRC_DB="$IMPORT_DIR/giraboard.db" DEST_DB="$DATA_DIR/giraboard.db" "$NODE_BIN" --disable-warning=ExperimentalWarning --input-type=module -e "
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.env.SRC_DB);
    db.exec(\"VACUUM INTO '\" + process.env.DEST_DB.replace(/'/g, \"''\") + \"'\");
    db.close();
  "
  if [ -d "$IMPORT_DIR/uploads" ]; then
    mkdir -p "$DATA_DIR/uploads"
    cp -a "$IMPORT_DIR/uploads/." "$DATA_DIR/uploads/"
  fi
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
fi

# ---------- Configuración del tablero ----------
if [ "$ACTION" = install ]; then
  if [ "$MODE" = lan ]; then HOST=0.0.0.0 TRUST=0; else HOST=127.0.0.1 TRUST=1; fi
  if [ ! -s "$ENV_FILE" ]; then
    say "Creando $ENV_FILE"
    cat >"$ENV_FILE" <<EOF
# Configuración del tablero «${INSTANCE}» de Giraboard. Después de cambiarla: sudo systemctl restart $SERVICE
# TRUST_PROXY=1 significa que la app está detrás de Caddy o de Cloudflare Tunnel (confía en la IP que ellos reportan).
EOF
  fi
  # Se asegura cada clave (así también se repara un archivo que quedó a medias).
  for kv in NODE_ENV=production "PORT=$PORT" "HOST=$HOST" "DATA_DIR=$DATA_DIR" "TRUST_PROXY=$TRUST" \
    "GIRABOARD_NAME=$INSTANCE" "GIRABOARD_MODE=$MODE" "GIRABOARD_DOMAIN=$DOMAIN"; do
    key="${kv%%=*}"
    if grep -q "^$key=" "$ENV_FILE"; then sed -i "s|^$key=.*|$kv|" "$ENV_FILE"; else echo "$kv" >>"$ENV_FILE"; fi
  done
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
fi

# ---------- Servicios systemd (uno por tablero) ----------
write_unit() {
  cat >"/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Giraboard - tablero «${INSTANCE}»
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
}

say "Configurando el arranque automático (systemd)"
(
  for i in $(installed_instances); do
    instance_vars "$i"
    write_unit
  done
)

# Comando «giraboard» para administrar desde la terminal
cat >/usr/local/bin/giraboard <<EOF
#!/bin/sh
# Administración de Giraboard.
#   sudo giraboard tableros                  Lista los tableros instalados
#   sudo giraboard usuarios                  Personas del tablero principal
#   sudo giraboard -t ventas usuarios        Lo mismo en otro tablero
#   giraboard logs | estado · sudo giraboard reiniciar   (agrega -t NOMBRE para otro tablero)
NAME=principal
if [ "\$1" = "-t" ] || [ "\$1" = "--tablero" ]; then NAME="\$2"; shift 2; fi
case "\$NAME" in
  principal|giraboard|"") SERVICE=giraboard; ENV_FILE=$ENV_DIR/giraboard.env ;;
  *) SERVICE="giraboard-\$NAME"; ENV_FILE="$ENV_DIR/\$NAME.env" ;;
esac
case "\$1" in
  tableros)
    for f in $ENV_DIR/*.env; do
      [ -r "\$f" ] || { echo "Usa: sudo giraboard tableros"; exit 1; }
      n=\$(basename "\$f" .env); [ "\$n" = giraboard ] && n=principal
      s=giraboard; [ "\$n" = principal ] || s="giraboard-\$n"
      printf '  %-14s puerto %-6s %s\n' "\$n" "\$(sed -n 's/^PORT=//p' "\$f")" "\$(systemctl is-active "\$s")"
    done
    exit 0 ;;
  logs) exec journalctl -u "\$SERVICE" -f -n 100 ;;
  estado) exec systemctl status "\$SERVICE" ;;
  reiniciar) exec systemctl restart "\$SERVICE" ;;
esac
[ "\$(id -u)" -eq 0 ] || { echo "Usa: sudo giraboard \$*"; exit 1; }
[ -f "\$ENV_FILE" ] || { echo "No existe el tablero «\${NAME}». Usa: sudo giraboard tableros"; exit 1; }
set -a; . "\$ENV_FILE"; set +a
cd $APP_DIR || exit 1
exec runuser -u $APP_USER -- env DATA_DIR="\$DATA_DIR" NODE_ENV=production $NODE_BIN --disable-warning=ExperimentalWarning server/cli.ts "\$@"
EOF
chmod 755 /usr/local/bin/giraboard

systemctl daemon-reload
# Todos los tableros comparten el código: al actualizarlo se reinician todos.
(
  for i in $(installed_instances); do
    instance_vars "$i"
    systemctl enable "$SERVICE" >/dev/null 2>&1
    systemctl restart "$SERVICE"
  done
)

# ---------- Caddy ----------
if [ "$ACTION" = install ] && [ "$MODE" = caddy ]; then
  instance_vars "$NAME"
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
    printf '%s\n' "$BLOCK" >"$CADDYFILE"
  else
    say "Agregando $DOMAIN al Caddyfile existente"
    printf '\n%s\n' "$BLOCK" >>"$CADDYFILE"
  fi
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 || die "La configuración de Caddy tiene un error: revisa $CADDYFILE"
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
    ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
  fi
fi

if [ "$ACTION" = install ] && [ "$MODE" = lan ] && command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow "$PORT/tcp" >/dev/null
fi

# ---------- Verificación ----------
say "Esperando a que arranquen"
FAILED="$(
  for i in $(installed_instances); do
    instance_vars "$i"
    p="$(env_value "$ENV_FILE" PORT)"
    ok=0
    for _ in $(seq 1 40); do
      if curl -fsS "http://127.0.0.1:$p/api/health" >/dev/null 2>&1; then ok=1; break; fi
      sleep 1
    done
    [ "$ok" = 1 ] || printf ' %s' "$i"
  done
)"
[ -z "$FAILED" ] || die "No respondió:$FAILED. Revisa con: giraboard logs (o giraboard -t NOMBRE logs)"

echo
echo "  ✅ Giraboard está corriendo y arrancará solo cada vez que se prenda el equipo."
echo
echo "  Tableros:"
print_list
if [ "$ACTION" = install ]; then
  instance_vars "$NAME"
  [ "$MODE" = tunel ] && echo && echo "  Apunta el túnel de Cloudflare a http://localhost:$PORT (ver docs/DESPLIEGUE.md)"
  [ "$MODE" = caddy ] && echo && echo "  (el certificado HTTPS puede tardar un minuto la primera vez)"
  if [ "$INSTANCE" = principal ]; then CODE_LINE="$(/usr/local/bin/giraboard codigo 2>/dev/null || true)"; else CODE_LINE="$(/usr/local/bin/giraboard -t "$INSTANCE" codigo 2>/dev/null || true)"; fi
  case "$CODE_LINE" in
    *"Código de configuración"*) echo && echo "  Primera vez en «${INSTANCE}» → $CODE_LINE (te lo pedirá la página para crear la cuenta de admin)" ;;
  esac
fi
echo
echo "  Comandos útiles: sudo giraboard tableros · sudo giraboard usuarios · giraboard logs"
echo "  Para actualizar después: cd $SRC_DIR && git pull && sudo ./deploy/install.sh --actualizar"
echo
