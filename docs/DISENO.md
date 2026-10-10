# Giraboard — Investigación y decisiones de diseño

*[Read in English](DESIGN.md)*

El objetivo: que **ningún pendiente de una oficina pequeña se olvide** y que siempre se sepa **quién lo tiene y cómo va**, con una herramienta tan simple que se use sin capacitación.

## Lo que encontramos en la investigación

| Hallazgo | De dónde viene | Qué hicimos con eso |
|---|---|---|
| Los pendientes se pierden porque **se comprometen en un lugar (una llamada, un WhatsApp) y se registran en otro**. Si capturar cuesta trabajo, no se captura. Meta: anotar algo en menos de 30 segundos. | Artículos sobre *tasks falling through the cracks* (Tallyfy, ClientHub) | Solo el **título es obligatorio**. Captura rápida en «Mi día» (escribes y Enter) y la tecla **N** abre «Nuevo pendiente» desde cualquier pantalla. |
| Lo que más se olvida es **lo que depende de otros**. GTD lo resuelve con la lista *Waiting For*: anotar **a quién o qué se espera** y **cuándo volver a revisar**. | Método GTD (*Getting Things Done*) | Estado propio **«Esperando»** con el campo «¿qué estamos esperando?» y una **fecha de seguimiento**. Al mover algo a Esperando, la app lo pregunta; ese día aparece en «Mi día» → *Toca dar seguimiento*. |
| Lo que no tiene fecha no aparece en «Hoy» y se olvida. Todoist invita a **posponer a conciencia** en vez de dejar cosas vencidas. | Todoist (vista Hoy), Things 3 | «Mi día» separa **Vencidos / Para hoy / Seguimientos / Próximos 7 días / Sin fecha**. El botón **Posponer** (mañana, lunes, en una semana) tiene *deshacer*, y la sección «Sin fecha» pide ponerles fecha. |
| Las tarjetas que nadie toca durante días son la señal más clara de algo olvidado. Trello, Shortcut y Kanban Tool las «envejecen» a los 7, 14 o 28 días. | *Card aging* (Trello Power-Up, Shortcut, Kanbanchi) | Si un pendiente lleva **7 días o más sin movimiento**, se ve amarillento, dice **«N días quieto»** y aparece en *Se están quedando quietos*. |
| A los equipos no técnicos les funcionan **pocas columnas** y **colores de estado** muy claros. Lo que hizo popular a Monday es el color del estado. | Kanban para pymes, Kanboard, Monday.com | Solo **4 estados**, cada uno con su color e ícono fijos en toda la app. Se cambian con **4 botones grandes**, no con menús. |
| Para personas mayores o poco digitales: texto de 16 px o más, **íconos siempre con texto**, botones grandes y mensajes que no desaparecen rápido. | Guías de UX para adultos mayores (NN/g y estudios) | Base de 16 px, botones de 40 a 48 px, navegación con ícono y palabra, avisos de 6 a 10 s que se pueden cerrar, **Deshacer** en lugar de confirmaciones y contraste AA. |
| Los tableros se llenan y ya no se ve qué urge. | Linear, Kanboard (filtros) | Orden automático: **urgentes primero y luego por fecha**, sin acomodar a mano. Filtros por persona, tipo, urgentes y vencidos. |
| En oficinas de servicios (seguros, contabilidad, inmobiliarias) muchos pendientes **se repiten** y casi todos están **ligados a un cliente**. | Descripciones de puestos administrativos | **Plantillas de tipos de pendiente** al configurar (todo editable), **clientes** con historial, **pendientes que se repiten** y botón de **WhatsApp** al cliente. |
| Quien dirige absorbe la coordinación de todos y necesita ver la carga de cada quien sin preguntar. | Artículos sobre coordinación informal en equipos pequeños | **Resumen** con carga por persona, vencidos, lo que lleva más tiempo esperando, lo estancado, ritmo semanal y la bitácora del equipo, más el **Tablero por persona**. |

## Las secciones y por qué están así

1. **Mi día** (pantalla de inicio). Responde «¿qué tengo que hacer hoy?». Muestra un saludo con la fecha, un resumen en una frase, 4 contadores, la captura rápida y las listas por urgencia. Se puede ver lo propio, lo de todo el equipo o lo de una persona.
2. **Tablero**. La foto completa: 4 columnas por estado, o una por persona. Se arrastra para cambiar el estado o reasignar. Cada tarjeta muestra tipo, cliente, fecha, avance de pasos, notas, archivos y si está quieta.
3. **Detalle del pendiente** (panel lateral; en celular, pantalla completa). Todo se guarda solo. Incluye:
   - estado con 4 botones, responsable, fecha, cliente (con WhatsApp y llamada), tipo, prioridad, repetición y notas
   - **pasos con barra de avance** y **archivos**
   - **bitácora**: notas de avance más el historial automático de cada cambio, y botones para avisarle a alguien con @
4. **Calendario**. Fechas límite y seguimientos por mes.
5. **Clientes**. Datos, notas, pendientes abiertos e historial completo de cada cliente.
6. **Resumen**. Para quien administra: números clave, carga por persona, en espera, estancados, ritmo semanal (con vista de tabla) y la actividad del equipo.
7. **Archivo**. Nada se borra; todo lo terminado o archivado se puede buscar.
8. **Equipo y ajustes**. Personas y permisos, tipos de pendiente, nombre del negocio, zona horaria, descargas de datos, perfil y contraseña.

## Recordatorios

- **Avisos en la app** (campana) en estos casos:
  - te asignan algo, comentan tus pendientes o te mencionan
  - terminan algo que tú creaste
  - algo **vence hoy**, **ya venció** o **toca dar seguimiento** (un aviso por día)
- **Tiempo real**: si alguien del equipo mueve algo, las pantallas de los demás se actualizan solas.
- **Avisos del navegador** (opcionales) para enterarse aunque la ventana esté atrás.
- El número de avisos sin leer aparece en la pestaña: `(3) Giraboard`.

## Ideas para después

- Resumen diario por **correo** o **WhatsApp** para cada persona.
- Interfaz en inglés y otros idiomas.
- Notificaciones *push* en la app instalada en el celular.
- Importar clientes y vencimientos recurrentes desde CSV para crear los pendientes con anticipación.
