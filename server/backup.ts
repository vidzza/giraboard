import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, todayStr } from './db.ts';

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = 30;

/** Copia consistente de la base de datos (funciona aunque la app esté en uso). */
export function backupDatabase(force = false) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `giraboard-${todayStr()}.db`);
  if (fs.existsSync(target)) {
    if (!force) return null;
    fs.rmSync(target);
  }
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const old = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^giraboard-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  return target;
}

// Uso manual: node server/backup.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = backupDatabase(true);
  console.log(`Respaldo creado: ${file}`);
}
