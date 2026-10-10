# Contributing to Giraboard · Cómo contribuir

Thanks for wanting to help! Giraboard exists to make small offices run smoother, so the most important rule is: **keep it simple for non-technical people**.

¡Gracias por querer ayudar! Giraboard existe para que las oficinas pequeñas funcionen mejor, así que la regla más importante es: **que siga siendo sencillo para personas no técnicas**.

## Getting started · Para empezar

```bash
git clone https://github.com/vidzza/giraboard.git
cd giraboard
npm install
npm run probar        # demo data + dev servers on http://localhost:5173
```

- API: `server/` (Hono + `node:sqlite`). Node runs the TypeScript directly; `node --watch` restarts it on save.
- Web: `web/src/` (React + Vite + Tailwind). Hot reload.
- Shared types and labels: `shared/types.ts`.
- Database changes: add a new entry at the end of `MIGRATIONS` in `server/db.ts`. Never edit an existing migration.

Before opening a pull request:

```bash
npm run typecheck
npm run build
```

## Guidelines · Lineamientos

- **UI copy is in Spanish (es-MX)** and should sound like a friendly coworker, not like software. Prefer "Pendiente" over "Ticket", and "Esperando" over "Bloqueado".
- **Large, labeled controls.** Icons always come with words, there are no hover-only actions on touch screens, and text meets WCAG AA contrast (4.5:1).
- **Prefer undo over confirmation dialogs**, and autosave over "Save" buttons.
- **Small dependencies only.** It must keep running on a Raspberry Pi as a single process.
- **No personal data in the repo.** Demo data must be fictional.
- **Error messages are for humans.** Tell people what happened and what to do next.

## Good first contributions · Buenas primeras contribuciones

- 🌍 **English translation**, plus a small i18n layer for UI strings.
- 📬 Daily email digest (optional SMTP config).
- 🧪 Automated tests for the API routes.
- 🐛 Anything labeled [`good first issue`](https://github.com/vidzza/giraboard/labels/good%20first%20issue).

## Reporting bugs · Reportar errores

Open an [issue](https://github.com/vidzza/giraboard/issues/new/choose) with steps to reproduce. For security problems, **do not open a public issue**; see [SECURITY.md](SECURITY.md).

Be kind and patient with everyone, including people who are new to software. · Sé amable y paciente con todos, incluidas las personas nuevas en el software.
