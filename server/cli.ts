// Herramienta de administración desde la terminal del servidor.
//   node server/cli.ts usuarios
//   node server/cli.ts restablecer <usuario>
//   node server/cli.ts crear-admin <usuario> "<Nombre>"
//   node server/cli.ts respaldo
//   node server/cli.ts codigo
// En el servidor instalado se usa con el comando `giraboard` (ver docs/DESPLIEGUE.md).
import { all, get, run, DATA_DIR } from './db.ts';
import { hashPassword, temporaryPassword } from './auth.ts';
import { backupDatabase } from './backup.ts';
import { ensureSetupCode, hasUsers } from './routes/auth.ts';
import { seedDefaults } from './defaults.ts';
import type { User } from '../shared/types.ts';

const [command, ...args] = process.argv.slice(2);

function help() {
  console.log(`Giraboard — administración (datos en ${DATA_DIR})

  usuarios                         Lista las personas y su último acceso
  restablecer <usuario>            Pone una contraseña temporal (la persona crea la suya al entrar)
  crear-admin <usuario> "<Nombre>" Crea un admin con contraseña temporal
  activar <usuario>                Le devuelve el acceso a alguien
  respaldo                         Hace un respaldo de la base de datos ahora
  codigo                           Muestra el código para la configuración inicial
`);
}

function findUser(username: string | undefined) {
  if (!username) {
    console.error('Falta el usuario. Ejemplo: restablecer ana');
    process.exit(1);
  }
  const user = get<User>('SELECT * FROM users WHERE username = ?', username.toLowerCase());
  if (!user) {
    console.error(`No existe el usuario «${username}». Usa «usuarios» para ver la lista.`);
    process.exit(1);
  }
  return user;
}

switch (command) {
  case 'usuarios': {
    const users = all<User>('SELECT * FROM users ORDER BY active DESC, name');
    if (!users.length) console.log('Todavía no hay usuarios.');
    for (const u of users) {
      const parts = [
        u.role === 'admin' ? 'admin' : 'equipo',
        u.active ? 'con acceso' : 'SIN ACCESO',
        u.last_login_at ? `último acceso ${new Date(u.last_login_at).toLocaleString('es-MX')}` : 'nunca ha entrado',
        u.must_change_password ? 'contraseña temporal' : '',
      ].filter(Boolean);
      console.log(`  ${u.username.padEnd(16)} ${u.name.padEnd(20)} ${parts.join(' · ')}`);
    }
    break;
  }
  case 'restablecer': {
    const user = findUser(args[0]);
    const password = temporaryPassword();
    run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', hashPassword(password), user.id);
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
    console.log(`Contraseña temporal de ${user.name} (${user.username}): ${password}`);
    console.log('Al entrar se le pedirá crear su propia contraseña.');
    if (!user.active) console.log(`Ojo: esta persona no tiene acceso. Usa «activar ${user.username}».`);
    break;
  }
  case 'activar': {
    const user = findUser(args[0]);
    run('UPDATE users SET active = 1 WHERE id = ?', user.id);
    console.log(`${user.name} vuelve a tener acceso.`);
    break;
  }
  case 'crear-admin': {
    const [username, name] = args;
    if (!username || !name || !/^[a-zA-Z0-9._-]{2,30}$/.test(username)) {
      console.error('Uso: crear-admin <usuario> "<Nombre>"   (usuario sin espacios ni acentos)');
      process.exit(1);
    }
    if (get('SELECT id FROM users WHERE username = ?', username.toLowerCase())) {
      console.error(`Ya existe «${username}». Usa «restablecer ${username}» si olvidó su contraseña.`);
      process.exit(1);
    }
    const password = temporaryPassword();
    run(
      "INSERT INTO users (name, username, password_hash, role, color, must_change_password) VALUES (?, ?, ?, 'admin', '#1E5B4F', 1)",
      name,
      username.toLowerCase(),
      hashPassword(password),
    );
    seedDefaults();
    console.log(`Admin creado: ${username.toLowerCase()} — contraseña temporal: ${password}`);
    break;
  }
  case 'respaldo': {
    console.log(`Respaldo creado: ${backupDatabase(true)}`);
    break;
  }
  case 'codigo': {
    if (hasUsers()) console.log('El sistema ya está configurado; no hace falta código.');
    else console.log(`Código de configuración: ${ensureSetupCode()}`);
    break;
  }
  default:
    help();
}
