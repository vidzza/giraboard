// Datos de demostración para probar Giraboard en local.
// Uso: npm run seed            (solo si la base está vacía)
//      npm run seed -- --reset (borra todo y vuelve a crear la demo)
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
if (process.argv.includes('--reset')) {
  for (const f of ['giraboard.db', 'giraboard.db-wal', 'giraboard.db-shm']) fs.rmSync(path.join(dataDir, f), { force: true });
  fs.rmSync(path.join(dataDir, 'uploads'), { recursive: true, force: true });
}

const { get, run, tx, setSetting, todayStr } = await import('./db.ts');
const { hashPassword } = await import('./auth.ts');
const { seedDefaults } = await import('./defaults.ts');

if (get('SELECT id FROM users LIMIT 1')) {
  console.log('Usando los datos que ya existen (para volver a la demo desde cero: npm run seed -- --reset).');
  process.exit(0);
}

const DEMO_PASSWORD = 'demo1234';

function day(offset: number) {
  const d = new Date(`${todayStr()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function ago(days: number, hours = 0) {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

tx(() => {
  setSetting('business_name', 'Agencia Demo');
  seedDefaults('seguros');

  const user = (name: string, username: string, role: string, color: string) =>
    Number(
      run('INSERT INTO users (name, username, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        name, username, hashPassword(DEMO_PASSWORD), role, color, ago(60)).lastInsertRowid,
    );
  const admin = user('Ana', 'ana', 'admin', '#1E5B4F');
  const luis = user('Luis', 'luis', 'member', '#B5523B');
  const carla = user('Carla', 'carla', 'member', '#3A6EA5');

  const cat = (name: string) => (get<{ id: number }>('SELECT id FROM categories WHERE name = ?', name)!.id);
  const client = (name: string, phone: string | null, notes: string | null = null) =>
    Number(run('INSERT INTO clients (name, phone, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?)', name, phone, notes, admin, ago(50)).lastInsertRowid);

  const familiaRuiz = client('Familia Ruiz Domínguez', '5512345678', 'Póliza de gastos médicos familiar. Prefieren WhatsApp.');
  const transportes = client('Transportes del Bajío SA de CV', '4421234567', 'Flotilla de 12 unidades.');
  const donJorge = client('Jorge Hernández', '5587654321');
  const carmen = client('Carmen Villaseñor', '5523456789');
  const ferreteria = client('Ferretería La Esperanza', '5534567890', 'Seguro de negocio (incendio y robo).');
  const sofia = client('Sofía Mendoza', null);

  type T = {
    title: string; status?: string; priority?: string; assignee: number; creator?: number; category: string;
    client?: number; due?: number | null; waiting_on?: string; follow_up?: number; recurrence?: string;
    created: number; activity?: number; description?: string; checklist?: [string, boolean][];
    comments?: [number, string, number][]; completed?: number;
  };

  const tickets: T[] = [
    { title: 'Renovar póliza de auto de Jorge Hernández', assignee: luis, creator: admin, category: 'Renovación', client: donJorge, due: 0, priority: 'high', created: 6, activity: 1,
      description: 'Vence el día de hoy. Pedir a la aseguradora la cotización de renovación y confirmar con el cliente si mantiene la misma cobertura amplia.',
      checklist: [['Pedir cotización de renovación', true], ['Enviar propuesta al cliente', false], ['Confirmar forma de pago', false]],
      comments: [[luis, 'Ya pedí la cotización, me la mandan en la tarde.', 1]] },
    { title: 'Cobrar recibo de gastos médicos — Familia Ruiz', status: 'doing', assignee: carla, creator: admin, category: 'Cobranza', client: familiaRuiz, due: -2, priority: 'urgent', created: 10, activity: 3,
      description: 'Recibo trimestral pendiente. Si no se paga esta semana la póliza entra en periodo de gracia.',
      comments: [[carla, 'Les mandé mensaje por WhatsApp, dicen que pagan el viernes.', 3]] },
    { title: 'Siniestro: choque de unidad 07 de Transportes del Bajío', status: 'waiting', assignee: admin, category: 'Siniestro', client: transportes, due: 5, priority: 'urgent', created: 8, activity: 2,
      waiting_on: 'Ajustador de la aseguradora', follow_up: 0,
      description: 'Choque en carretera. Ya se levantó el reporte. Falta valuación del ajustador.',
      checklist: [['Levantar reporte de siniestro', true], ['Juntar fotos y declaración del chofer', true], ['Valuación del ajustador', false], ['Orden de reparación', false]],
      comments: [[admin, 'Hablé con el ajustador, viene el jueves a revisar la unidad.', 2]] },
    { title: 'Cotizar seguro de negocio para Ferretería La Esperanza', status: 'doing', assignee: luis, creator: admin, category: 'Cotización', client: ferreteria, due: 2, created: 4, activity: 0,
      checklist: [['Inventario aproximado de mercancía', true], ['Cotizar con la aseguradora principal', false], ['Cotizar con segunda opción', false]] },
    { title: 'Cambio de beneficiario en póliza de vida de Carmen', status: 'waiting', assignee: carla, category: 'Endoso / cambio', client: carmen, due: 7, created: 12, activity: 9,
      waiting_on: 'Que Carmen mande su INE firmada', follow_up: -1 },
    { title: 'Emitir póliza nueva de gastos médicos — Sofía Mendoza', assignee: carla, creator: admin, category: 'Póliza nueva', client: sofia, due: 3, created: 1, activity: 1,
      checklist: [['Solicitud firmada', false], ['Cuestionario médico', false], ['Primer pago', false]] },
    { title: 'Mandar reporte mensual de producción a la promotoría', assignee: admin, category: 'Administrativo', due: 4, recurrence: 'monthly', created: 25, activity: 25 },
    { title: 'Actualizar directorio de clientes en Excel', assignee: luis, category: 'Administrativo', due: null, created: 20, activity: 15 },
    { title: 'Llamar a la Familia Ruiz para revisar coberturas', assignee: admin, category: 'Atención a cliente', client: familiaRuiz, due: 1, created: 2, activity: 2 },
    { title: 'Pagar renta de la oficina', assignee: admin, category: 'Administrativo', due: 6, recurrence: 'monthly', created: 24, activity: 24 },
    { title: 'Revisar renovaciones del próximo mes', assignee: luis, creator: admin, category: 'Renovación', due: 9, priority: 'high', created: 3, activity: 3,
      description: 'Sacar la lista de pólizas que vencen el mes que entra y crear un pendiente por cada una.' },
    { title: 'Entregar póliza impresa a Transportes del Bajío', status: 'done', assignee: luis, category: 'Atención a cliente', client: transportes, due: -3, created: 9, activity: 2, completed: 2 },
    { title: 'Cotización de auto para Jorge (segundo vehículo)', status: 'done', assignee: carla, category: 'Cotización', client: donJorge, due: -1, created: 6, activity: 1, completed: 1 },
    { title: 'Conciliar comisiones de septiembre', status: 'done', assignee: admin, category: 'Administrativo', created: 14, activity: 4, completed: 4 },
  ];

  for (const t of tickets) {
    const status = t.status ?? 'todo';
    const completedAt = status === 'done' ? ago(t.completed ?? 0, 2) : null;
    const created = ago(t.created, 3);
    const lastActivity = ago(t.activity ?? 0, 1);
    const id = Number(
      run(
        `INSERT INTO tickets (title, description, status, priority, assignee_id, creator_id, category_id, client_id, due_date,
           waiting_on, follow_up_date, recurrence, created_at, updated_at, last_activity_at, status_changed_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t.title, t.description ?? '', status, t.priority ?? 'normal', t.assignee, t.creator ?? t.assignee, cat(t.category),
        t.client ?? null, t.due === undefined || t.due === null ? null : day(t.due), t.waiting_on ?? null,
        t.follow_up === undefined ? null : day(t.follow_up), t.recurrence ?? 'none', created, lastActivity, lastActivity,
        status === 'todo' ? created : lastActivity, completedAt,
      ).lastInsertRowid,
    );
    run("INSERT INTO activity (ticket_id, user_id, type, data, created_at) VALUES (?, ?, 'created', ?, ?)",
      id, t.creator ?? t.assignee, JSON.stringify({ assignee_id: t.assignee }), created);
    if (status !== 'todo') {
      run("INSERT INTO activity (ticket_id, user_id, type, data, created_at) VALUES (?, ?, 'status', ?, ?)",
        id, t.assignee, JSON.stringify({ from: 'todo', to: status }), status === 'done' ? completedAt : lastActivity);
    }
    (t.checklist ?? []).forEach(([text, done], i) =>
      run('INSERT INTO checklist_items (ticket_id, text, done, position, done_by, done_at) VALUES (?, ?, ?, ?, ?, ?)',
        id, text, done ? 1 : 0, i, done ? t.assignee : null, done ? lastActivity : null));
    for (const [uid, body, daysAgo] of t.comments ?? []) {
      const at = ago(daysAgo, 2);
      const cid = run('INSERT INTO comments (ticket_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', id, uid, body, at).lastInsertRowid;
      run("INSERT INTO activity (ticket_id, user_id, type, data, created_at) VALUES (?, ?, 'comment', ?, ?)",
        id, uid, JSON.stringify({ comment_id: Number(cid) }), at);
    }
  }
});

console.log('Demo creada. Usuarios: ana (admin), luis, carla');
console.log('Contraseña de todos los usuarios de prueba: ' + DEMO_PASSWORD);
