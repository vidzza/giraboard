<div align="center">

<img src="web/public/icon-192.png" width="88" alt="Logo de Giraboard" />

# Giraboard

**El tablero de pendientes open source para que en tu oficina nada se olvide.**

Quién tiene qué, para cuándo y cómo va, en un solo lugar que todo el equipo sí usa.

[![CI](https://github.com/vidzza/giraboard/actions/workflows/ci.yml/badge.svg)](https://github.com/vidzza/giraboard/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-1E5B4F.svg)](LICENSE)
![Node 24+](https://img.shields.io/badge/node-%E2%89%A524-1E5B4F.svg)
![Autoalojado](https://img.shields.io/badge/autoalojado-s%C3%AD-1E5B4F.svg)

[**Read in English**](README.md) · [Guía de instalación](docs/DESPLIEGUE.md) · [Diseño e investigación](docs/DISENO.md)

<img src="docs/screenshots/board.jpg" alt="Tablero de Giraboard" width="100%" />

</div>

## ¿Por qué Giraboard?

En la mayoría de las oficinas pequeñas (agencias de seguros, despachos contables, inmobiliarias, consultorios, negocios familiares), los pendientes viven en chats de WhatsApp, papelitos y la memoria de la dueña o el dueño. Y se pierden cosas: una renovación sin seguimiento, un cliente esperando respuesta, un cobro que nadie hizo.

Las herramientas grandes de gestión de proyectos están hechas para equipos de software y abruman a todos los demás. Giraboard es lo contrario: un **tablero tranquilo y muy sencillo, pensado para personas no técnicas**, con funciones hechas para que **nada se olvide**:

- **Mi día**: cada mañana muestra lo vencido, lo de hoy y los seguimientos que tocan, con un botón para **posponer** lo que puede esperar.
- **«Esperando» como estado propio.** Si algo depende de un cliente, la aseguradora o el banco, anotas *qué* esperas y *cuándo revisar*. Ese día vuelve a aparecer.
- **Lo que nadie toca se nota.** Si un pendiente lleva 7 días o más sin movimiento, se pone amarillento y lo dice.
- **Pendientes que se repiten** (reportes, renta, renovaciones): al terminarlos se crea solo el siguiente.
- **Todo deja rastro.** Cada pendiente tiene una bitácora de notas y cambios («Luis lo movió a *Esperando* · hace 2 h»), así cualquiera puede continuarlo.

## Funciones

| | |
|---|---|
| 🗓️ **Mi día** | Vencidos, para hoy, seguimientos, próximos 7 días, quietos y sin fecha: tuyos, de alguien del equipo o de todos. |
| 🗂️ **Tablero** | 4 estados claros (*Por hacer · En proceso · Esperando · Listo*), arrastrar y soltar, vista por persona y filtros. |
| 📋 **Detalle** | Responsable, fecha, cliente, tipo, prioridad, repetición, notas, **pasos con barra de avance**, archivos y bitácora. |
| 👥 **Clientes** | Cada pendiente ligado a un cliente, con historial y botones de **WhatsApp** y llamada. |
| 📅 **Calendario** | Fechas límite y seguimientos por mes. |
| 📊 **Resumen** | Carga por persona, lo que lleva más tiempo esperando, lo estancado, ritmo semanal y actividad del equipo. |
| 🔔 **Tiempo real y recordatorios** | Cambios en vivo, avisos en la app y en el navegador, menciones con @ y recordatorios diarios. |
| 🔐 **Cuentas** | Roles de admin y equipo, contraseñas temporales que cada quien cambia al entrar y quitar acceso pasando pendientes a otra persona. Si alguien se queda fuera, se recupera desde la terminal. |
| 💾 **Tus datos** | Un solo archivo SQLite, respaldos diarios automáticos, descarga de respaldo y exportación a Excel. |
| 📱 **En cualquier pantalla** | Funciona en celular, se puede agregar a la pantalla de inicio y tiene atajos de teclado (`N` nuevo, `/` buscar). |

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/my-day.jpg" alt="Mi día" /><p align="center"><b>Mi día</b>: lo que necesita atención</p></td>
    <td width="50%"><img src="docs/screenshots/ticket.jpg" alt="Detalle" /><p align="center"><b>Detalle</b> con «qué esperamos» y fecha de revisión</p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/dashboard.jpg" alt="Resumen" /><p align="center"><b>Resumen</b> para quien dirige</p></td>
    <td width="50%"><img src="docs/screenshots/calendar.jpg" alt="Calendario" /><p align="center"><b>Calendario</b> de fechas y seguimientos</p></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-my-day.jpg" alt="Celular: Mi día" width="260" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-ticket.jpg" alt="Celular: detalle" width="260" />
</p>

## Hazlo tuyo

Nada está amarrado a un negocio en particular. La primera vez, quien administra:

1. Escribe el nombre del negocio.
2. Elige con qué tipos de pendiente empezar: **General**, **Agencia de seguros**, **Despacho contable**, **Inmobiliaria** o **vacío**. Después se cambian como quieras.
3. La zona horaria se toma sola del navegador. Se cambia en *Ajustes* y define qué es «hoy», qué está vencido y a qué hora salen los recordatorios.

Luego agrega a su equipo, cada quien con su propio usuario para que quede registrado quién hizo qué.

## Probarlo en tu computadora

Requiere **Node.js 24 o más reciente**.

```bash
git clone https://github.com/vidzza/giraboard.git
cd giraboard
npm install
npm run probar
```

Abre http://localhost:5173 y entra con un usuario de prueba: `ana` (admin), `luis` o `carla`, contraseña `demo1234`. Los datos de la demo son ficticios.

Para ver una instalación nueva (pantalla de configuración inicial):

```bash
npm run build && DATA_DIR=/tmp/giraboard-vacio npm start
```

Abre http://localhost:3000; el código de configuración aparece en la terminal.

## Ponerlo en tu servidor

Giraboard es **un solo proceso de Node.js con base de datos SQLite integrada**: no hay nada más que instalar y corre bien en un VPS de 5 USD o en una Raspberry Pi. Un comando lo deja como servicio de `systemd` con HTTPS automático gracias a [Caddy](https://caddyserver.com):

```bash
sudo ./deploy/install.sh pendientes.tu-dominio.com
```

También tiene modo para **Raspberry Pi con Cloudflare Tunnel** (`--tunel`, sin abrir puertos) y para **solo la red de la oficina** (`--red-local`). Volver a correrlo actualiza la app y antes hace un respaldo.

Todo el detalle está en la **[guía de instalación](docs/DESPLIEGUE.md)**: DNS, primera vez, cuentas, respaldos y qué hacer si algo falla.

## Cómo está hecho

| Parte | Herramientas |
|---|---|
| Servidor | [Hono](https://hono.dev) en Node.js 24, `node:sqlite` integrado, Zod y Server-Sent Events. TypeScript que Node ejecuta directo, sin compilar. |
| Interfaz | React 19, Vite, Tailwind CSS 4, TanStack Query, React Router, dnd-kit, date-fns y Sonner |
| Operación | systemd + Caddy, respaldos diarios de SQLite y herramienta de administración por terminal |

```
server/    API, sesiones, recordatorios, respaldos y CLI de administración (server/cli.ts)
web/       App de React (pages/, components/, lib/)
shared/    Tipos y textos compartidos
deploy/    install.sh: instalar y actualizar en Debian / Ubuntu / Raspberry Pi OS
docs/      Guías, notas de diseño y capturas
```

## Contribuir

Reportes de errores, traducciones y mejoras son bienvenidos. Lee [CONTRIBUTING.md](CONTRIBUTING.md); para reportar una vulnerabilidad en privado, [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE): úsalo, modifícalo y alójalo donde quieras, también con fines comerciales.
