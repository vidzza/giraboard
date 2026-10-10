# Security policy · Política de seguridad

Giraboard stores business information (clients, tasks, files), so we take security seriously.

## Reporting a vulnerability · Reportar una vulnerabilidad

**Please do not open a public issue.** Report it privately through GitHub:
**[Security → Report a vulnerability](https://github.com/vidzza/giraboard/security/advisories/new)**.

**Por favor no abras un issue público.** Repórtalo en privado desde la pestaña **Security → Report a vulnerability** del repositorio.

Include what you found, how to reproduce it and the potential impact. You'll get an answer as soon as possible. Once a fix is available, we'll publish an advisory and credit you if you'd like.

## Supported versions

Only the latest version on the `main` branch receives security fixes. To update a server:

```bash
cd ~/giraboard && git pull && sudo ./deploy/install.sh <your-domain>
```

## Built-in protections

- Passwords hashed with scrypt; sessions in HttpOnly, SameSite cookies (Secure over HTTPS).
- Login rate limiting per user and per IP; constant-time checks to avoid user enumeration.
- One-time setup code required to create the first admin on a fresh production install.
- CSRF origin checks, strict security headers and a Content-Security-Policy on the app.
- Uploaded files are served as downloads (images and PDFs inline, sandboxed), never executed.
- The production service binds to localhost behind Caddy (HTTPS) and runs as an unprivileged, sandboxed systemd user.
