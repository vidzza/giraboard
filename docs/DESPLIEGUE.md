# Poner Giraboard en un servidor con tu dominio

*[Read in English](DEPLOYMENT.md)*

Giraboard corre como un **servicio del sistema** (systemd): arranca solo al prender el equipo y se reinicia si algo falla. La base de datos es un archivo (SQLite), así que no hay que instalar nada más. Para el HTTPS del dominio se usa **Caddy**, que saca y renueva el certificado solo.

En los ejemplos se usa `pendientes.tu-dominio.com`. Cámbialo por el subdominio real de tu negocio.

## ¿Dónde lo pongo?

| Opción | Cuándo conviene | Costo aprox. |
|---|---|---|
| **A. VPS** (Hetzner, DigitalOcean, Vultr, Lightsail) con Ubuntu 24.04 | Lo más sencillo y confiable: IP fija y no depende del internet ni de la luz de la oficina | 5–6 USD/mes |
| **B. Raspberry Pi** 4 o 5 (2 GB o más) con Raspberry Pi OS **de 64 bits** y SSD o memoria buena | Si prefieren tenerlo en la oficina | Solo el equipo |

Requisitos: Node.js 24 o más reciente (el instalador lo pone), 1 GB de RAM y acceso al DNS del dominio.

## Paso 1 · Bajar el código en el servidor

Entra al servidor (`ssh usuario@IP`) y descarga Giraboard:

```bash
sudo apt-get install -y git && git clone https://github.com/vidzza/giraboard.git ~/giraboard
```

Si hiciste cambios propios, también puedes copiarlos desde tu computadora (cambia `usuario@IP`):

```bash
rsync -av --exclude node_modules --exclude data --exclude dist --exclude .git ./ usuario@IP:~/giraboard/
```

En el servidor se empieza limpio, sin datos de demostración.

## Paso 2 · Instalar

Elige **una** de estas formas.

### A. VPS (o Raspberry con los puertos abiertos)

1. En el panel donde administran el dominio, crea un registro **A**: nombre `pendientes`, valor = IP pública del servidor.
2. Espera a que el DNS responda (`ping pendientes.tu-dominio.com` debe mostrar la IP) y corre:

```bash
cd ~/giraboard && sudo ./deploy/install.sh pendientes.tu-dominio.com
```

Si es una Raspberry en la oficina con esta opción, en el módem hay que redirigir los puertos **80 y 443** a la IP de la Raspberry. Además, la IP pública de la oficina debe ser fija o tener DNS dinámico. Si el proveedor (Telmex, Totalplay, Izzi…) no da IP pública real, usa la opción B.

### B. Raspberry Pi con Cloudflare Tunnel (sin abrir puertos)

Funciona aunque el internet de la oficina no tenga IP fija. Requiere que el DNS del dominio esté administrado en Cloudflare (es gratis).

1. Instala Giraboard sin Caddy:
   ```bash
   cd ~/giraboard && sudo ./deploy/install.sh --tunel
   ```
2. En el panel de Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*). Copia el comando que te da (`sudo cloudflared service install …`) y córrelo en la Raspberry. Antes instala `cloudflared` siguiendo las instrucciones que muestra esa misma pantalla para Debian.
3. En el túnel agrega un **Public Hostname**: `pendientes.tu-dominio.com` → servicio `HTTP` → `localhost:3000`.

### C. Solo dentro de la oficina (sin dominio)

```bash
cd ~/giraboard && sudo ./deploy/install.sh --red-local
```

Se abre en `http://IP-de-la-raspberry:3000` desde las computadoras conectadas a la misma red.

## Paso 3 · Primera vez

1. Al terminar, el instalador muestra un **código de configuración** (ej. `4405-8656`). Si se te pasó, obtenlo de nuevo con `sudo giraboard codigo`.
2. Abre `https://pendientes.tu-dominio.com`. Te pedirá el código, el nombre del negocio, con qué tipos de pendiente empezar y la cuenta de admin (quien maneja el equipo y los ajustes). La zona horaria se toma del navegador y se cambia en Ajustes.
3. En **Equipo y ajustes → Agregar persona** crea a cada persona del equipo. El sistema genera una contraseña temporal y un mensaje listo para mandar por WhatsApp. Al entrar por primera vez, cada quien crea su propia contraseña.

El código evita que alguien de internet cree la cuenta de admin antes que tú. Después de la configuración inicial ya no sirve.

## Cuentas: qué hay y cómo se manejan

- **Admin**: agrega personas, les da contraseña nueva si la olvidan, quita accesos, cambia los tipos de pendiente y la zona horaria, elimina pendientes y descarga los datos. Puede haber varios, pero siempre debe quedar al menos uno.
- **Equipo**: ve y trabaja todos los pendientes, y solo cambia su propio perfil y contraseña.
- **Contraseña olvidada**: un admin, en Equipo → Editar → «Darle una contraseña nueva». Se cierran sus sesiones y al entrar crea una propia.
- **Si alguien deja de trabajar ahí**: Editar → quitar «Tiene acceso». El sistema pregunta a quién pasarle sus pendientes abiertos y su historial se conserva.
- **Si el único admin olvida su contraseña**, desde la terminal del servidor (cambia `ana` por su usuario):
  ```bash
  sudo giraboard restablecer ana
  ```
- Las sesiones duran 30 días y se renuevan solas mientras se usen. Hay un botón para cerrar la sesión en los demás dispositivos.
- Tras 8 intentos fallidos, ese usuario queda bloqueado 15 minutos.

## Comandos del servidor

| Comando | Qué hace |
|---|---|
| `sudo giraboard usuarios` | Lista a las personas, si tienen acceso y su último ingreso |
| `sudo giraboard restablecer <usuario>` | Contraseña temporal para alguien |
| `sudo giraboard crear-admin <usuario> "Nombre"` | Crea otro admin |
| `sudo giraboard activar <usuario>` | Devuelve el acceso a alguien |
| `sudo giraboard respaldo` | Respaldo inmediato de la base de datos |
| `sudo giraboard codigo` | Código para la configuración inicial |
| `giraboard logs` | Ver lo que está pasando (Ctrl+C para salir) |
| `giraboard estado` / `sudo giraboard reiniciar` | Estado del servicio / reiniciarlo |

## Actualizar a una versión nueva

Baja el código nuevo (`cd ~/giraboard && git pull`) y vuelve a correr el mismo comando de instalación. Antes de actualizar hace un respaldo automático y no toca los datos.

```bash
cd ~/giraboard && sudo ./deploy/install.sh pendientes.tu-dominio.com
```

## Respaldos

- **Automático**: un respaldo diario de la base de datos en `/var/lib/giraboard/data/backups/` (se guardan 30 días).
- **Desde la app**: Equipo y ajustes → «Descargar respaldo completo» y «Descargar pendientes para Excel».
- **Fuera del servidor**, recomendado cada semana. Así se copia todo, incluidos los archivos adjuntos, a tu computadora:
  ```bash
  rsync -av usuario@IP:/var/lib/giraboard/data/ ~/Respaldos/giraboard/
  ```
  (El usuario necesita permiso para leer esa carpeta, o hazlo como root.)

Para **restaurar** un respaldo: `sudo systemctl stop giraboard`, copia el archivo de respaldo encima de `/var/lib/giraboard/data/giraboard.db`, borra `giraboard.db-wal` y `giraboard.db-shm` si existen, ajusta el dueño con `sudo chown giraboard: /var/lib/giraboard/data/giraboard.db` y arranca con `sudo systemctl start giraboard`.

## Dónde queda cada cosa

| Qué | Dónde |
|---|---|
| Código | `/opt/giraboard` |
| Datos (base, archivos, respaldos) | `/var/lib/giraboard/data` |
| Configuración | `/etc/giraboard/giraboard.env` (después de editarla: `sudo giraboard reiniciar`) |
| Servicio | `/etc/systemd/system/giraboard.service` |
| HTTPS | `/etc/caddy/Caddyfile` |

## Si algo no funciona

- `giraboard logs`: errores de la app.
- `sudo journalctl -u caddy -n 50`: problemas con el certificado (casi siempre es el DNS que todavía no apunta al servidor, o los puertos 80/443 cerrados).
- `curl http://127.0.0.1:3000/api/health` en el servidor debe responder `{"ok":true}`.

## Seguridad incluida

- La app solo escucha dentro del servidor; Caddy es lo único expuesto a internet, siempre con HTTPS.
- Contraseñas guardadas con scrypt (nunca en texto), sesiones con cookie protegida y bloqueo por intentos fallidos.
- Protección contra envíos desde otros sitios (CSRF), cabeceras de seguridad y política de contenido.
- Los archivos subidos no se pueden ejecutar en el navegador.
- El servicio corre con un usuario sin privilegios que solo puede escribir en su carpeta de datos.
- No aparece en buscadores (`noindex`).
