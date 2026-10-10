# Poner Giraboard en un servidor con tu dominio

*[Read in English](DEPLOYMENT.md)*

Giraboard corre como un **servicio del sistema** (systemd): **arranca solo al prender el equipo** (aunque nadie inicie sesión) y se reinicia en 3 segundos si algo falla. No hace falta dejar una terminal abierta. La base de datos es un archivo (SQLite), así que no hay que instalar nada más. Para el HTTPS del dominio se usa **Caddy**, que saca y renueva el certificado solo.

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

Se abre desde cualquier computadora o celular conectado al mismo wifi en `http://IP-de-la-raspberry:3000` o en `http://raspberrypi.local:3000` (el instalador muestra las dos al terminar).

Si estabas probando con `npm run probar` en una terminal, ciérralo antes con **Ctrl+C**: ya no hace falta, el servicio corre solo. Si quieres conservar lo que capturaste en esas pruebas, agrega `--importar-datos ~/giraboard/data` la primera vez (solo se puede importar en un tablero vacío).

## Varios tableros en el mismo equipo

Una sola Raspberry puede tener varios tableros **independientes**, cada uno con sus propias cuentas, pendientes y respaldos, en su propio puerto. Sirve, por ejemplo, para dos negocios o dos sucursales.

```bash
cd ~/giraboard && sudo ./deploy/install.sh --red-local --nombre ventas --puerto 3001
```

- `--nombre`: minúsculas, números y guiones (ej. `ventas`, `sucursal-norte`). El primero que instalas se llama **principal**.
- `--puerto`: opcional. Si no lo pones, toma el siguiente libre (3001, 3002…). El instalador avisa si el puerto ya lo usa otro tablero u otro programa.
- También funciona con dominio o túnel: `sudo ./deploy/install.sh ventas.tu-dominio.com --nombre ventas`.
- Todos comparten el mismo código: al actualizar se actualizan y reinician todos.

| Para | Comando |
|---|---|
| Ver los tableros, su puerto y si están corriendo | `sudo ./deploy/install.sh --lista` o `sudo giraboard tableros` |
| Usar los comandos de abajo en otro tablero | agrega `-t NOMBRE`, ej. `sudo giraboard -t ventas usuarios` |
| Quitar un tablero (sus datos se conservan) | `sudo ./deploy/install.sh --quitar ventas` |

## Paso 3 · Primera vez

1. Al terminar, el instalador muestra un **código de configuración** (ej. `4405-8656`). Si se te pasó, obtenlo de nuevo con `sudo giraboard codigo`.
2. Abre `https://pendientes.tu-dominio.com`. Te pedirá el código, el nombre del negocio, con qué tipos de pendiente empezar y la cuenta de admin (quien maneja el equipo y los ajustes). La zona horaria se toma del navegador y se cambia en Ajustes.
3. En **Equipo y ajustes → Agregar persona** crea a cada persona del equipo. El sistema genera una contraseña temporal y un mensaje listo para mandar por WhatsApp. Al entrar por primera vez, cada quien crea su propia contraseña.

El código evita que alguien de internet cree la cuenta de admin antes que tú. Después de la configuración inicial ya no sirve.

## Cuentas: qué hay y cómo se manejan

Hay tres roles. El servidor revisa los permisos en cada acción (no basta con ocultar botones).

| | Admin | Coordinación | Equipo |
|---|:-:|:-:|:-:|
| Ver sus pendientes, los que pidió y donde está en copia | ✅ | ✅ | ✅ |
| Ver los pendientes de todo el equipo y la bandeja «Por asignar» | ✅ | ✅ | — |
| Asignar pendientes a otras personas | ✅ | ✅ | si el admin lo permite |
| Ver el Resumen y la actividad del equipo | ✅ | ✅ | — |
| Archivar pendientes | ✅ | ✅ | los que creó |
| Borrar pendientes | ✅ | — | — |
| Agregar personas, cambiar roles y ajustes, descargar respaldos | ✅ | — | — |

- Un pendiente puede tener **varios responsables** (a todos les aparece y cualquiera lo termina) y personas **en copia** (lo ven y reciben avisos).
- Lo que se crea **sin responsable** va a la bandeja **«Por asignar»**, que solo ven admin y coordinación (y quien lo creó), y se les avisa.
- Cualquiera puede borrar su propia nota o archivo durante 15 minutos; después, solo un admin.
- Puede haber varios admins, pero siempre debe quedar al menos uno.
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
| `sudo giraboard tableros` | Lista los tableros instalados, su puerto y si están corriendo |
| `sudo giraboard usuarios` | Lista a las personas, si tienen acceso y su último ingreso |
| `sudo giraboard restablecer <usuario>` | Contraseña temporal para alguien |
| `sudo giraboard crear-admin <usuario> "Nombre"` | Crea otro admin |
| `sudo giraboard activar <usuario>` | Devuelve el acceso a alguien |
| `sudo giraboard respaldo` | Respaldo inmediato de la base de datos |
| `sudo giraboard codigo` | Código para la configuración inicial |
| `giraboard logs` | Ver lo que está pasando (Ctrl+C para salir) |
| `giraboard estado` / `sudo giraboard reiniciar` | Estado del servicio / reiniciarlo |

Con varios tableros, agrega `-t NOMBRE` justo después de `giraboard` (ej. `giraboard -t ventas logs`).

## Actualizar a una versión nueva

Un solo comando actualiza todos los tableros del equipo. Antes respalda cada base de datos y no toca datos ni ajustes:

```bash
cd ~/giraboard && git pull && sudo ./deploy/install.sh --actualizar
```

(Volver a correr el comando con el que instalaste también actualiza.) Si alguien tenía la app abierta, le aparece «Hay una versión nueva» con un botón para recargar.

## Respaldos

- **Automático**: un respaldo diario de la base de datos en `/var/lib/giraboard/data/backups/` (se guardan 30 días). Los demás tableros, en `/var/lib/giraboard/tableros/NOMBRE/backups/`.
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
| Datos (base, archivos, respaldos) | `/var/lib/giraboard/data` (otros tableros: `/var/lib/giraboard/tableros/NOMBRE`) |
| Configuración | `/etc/giraboard/giraboard.env` (otros: `/etc/giraboard/NOMBRE.env`). Después de editarla: `sudo giraboard reiniciar` |
| Servicio | `giraboard.service` (otros: `giraboard-NOMBRE.service`) en `/etc/systemd/system/` |
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
