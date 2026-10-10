// Pruebas de permisos y jerarquía: arranca un servidor con la demo y prueba cada escenario por la API.
// Ejecutar: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'giraboard-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const NODE = [process.execPath, '--disable-warning=ExperimentalWarning'];
let server: ChildProcess;

type Json = any;

class Session {
  cookie = '';
  username: string;
  constructor(username: string) {
    this.username = username;
  }
  async login() {
    const r = await this.req('POST', '/auth/login', { username: this.username, password: 'demo1234' });
    assert.equal(r.status, 200, `login ${this.username}`);
    return this;
  }
  async req(method: string, url: string, body?: unknown): Promise<{ status: number; json: Json }> {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie: this.cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body: unknown = {}) => this.req('POST', url, body);
  patch = (url: string, body: unknown) => this.req('PATCH', url, body);
  del = (url: string) => this.req('DELETE', url);
}

let ana: Session, marta: Session, luis: Session, carla: Session;
const ids: Record<string, number> = {};

async function ticketIds(s: Session) {
  const r = await s.get('/tickets');
  assert.equal(r.status, 200);
  return (r.json as { id: number }[]).map((t) => t.id);
}

async function createAs(s: Session, data: Record<string, unknown>) {
  const r = await s.post('/tickets', data);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.id as number;
}

before(async () => {
  execFileSync(NODE[0], [...NODE.slice(1), 'server/seed.ts'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA }, stdio: 'ignore' });
  server = spawn(NODE[0], [...NODE.slice(1), 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: DATA, API_PORT: String(PORT), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {
      /* todavía arrancando */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  [ana, marta, luis, carla] = await Promise.all(['ana', 'marta', 'luis', 'carla'].map((u) => new Session(u).login()));
  const users = (await ana.get('/users')).json as { id: number; username: string }[];
  for (const u of users) ids[u.username] = u.id;
});

after(() => {
  server?.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('Admin y Coordinación ven todo, incluido lo por asignar', async () => {
  const all = await ticketIds(ana);
  assert.deepEqual((await ticketIds(marta)).sort(), all.sort());
  const tickets = (await ana.get('/tickets')).json as { assignee_ids: number[] }[];
  assert.ok(tickets.some((t) => t.assignee_ids.length === 0), 'la demo tiene un pendiente por asignar');
});

test('El Equipo solo ve lo suyo: responsable, creado por él o en copia', async () => {
  const tickets = (await ana.get('/tickets')).json as { id: number; assignee_ids: number[]; follower_ids: number[]; creator_id: number }[];
  const mine = (uid: number) =>
    tickets.filter((t) => t.assignee_ids.includes(uid) || t.follower_ids.includes(uid) || t.creator_id === uid).map((t) => t.id);
  assert.deepEqual((await ticketIds(luis)).sort(), mine(ids.luis).sort());
  assert.deepEqual((await ticketIds(carla)).sort(), mine(ids.carla).sort());
  // Lo por asignar que creó Carla: ella sí lo ve, Luis no.
  const unassigned = tickets.find((t) => t.assignee_ids.length === 0)!;
  assert.ok((await ticketIds(carla)).includes(unassigned.id));
  assert.ok(!(await ticketIds(luis)).includes(unassigned.id));
});

test('El Equipo no puede abrir, editar ni comentar pendientes ajenos', async () => {
  const luisSees = await ticketIds(luis);
  const hidden = (await ticketIds(carla)).find((id) => !luisSees.includes(id));
  assert.ok(hidden, 'hay al menos un pendiente que Luis no ve');
  assert.equal((await luis.get(`/tickets/${hidden}`)).status, 404);
  assert.equal((await luis.patch(`/tickets/${hidden}`, { title: 'hackeado' })).status, 404);
  assert.equal((await luis.post(`/tickets/${hidden}/comments`, { body: 'hola' })).status, 404);
  assert.equal((await luis.post(`/tickets/${hidden}/checklist`, { text: 'paso' })).status, 404);
});

test('La búsqueda tampoco muestra pendientes ajenos', async () => {
  const r = await luis.get(`/search?q=${encodeURIComponent('beneficiario')}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.tickets.length, 0, 'el pendiente de Carla no aparece para Luis');
  assert.ok((await ana.get(`/search?q=beneficiario`)).json.tickets.length > 0);
});

test('Resumen y actividad del equipo: solo Admin y Coordinación', async () => {
  assert.equal((await luis.get('/stats')).status, 403);
  assert.equal((await luis.get('/activity')).status, 403);
  assert.equal((await marta.get('/stats')).status, 200);
  assert.equal((await ana.get('/activity')).status, 200);
  assert.ok(typeof (await ana.get('/stats')).json.unassigned === 'number');
});

test('Solo un admin borra pendientes, maneja cuentas, ajustes y descargas', async () => {
  const id = await createAs(luis, { title: 'Para borrar' });
  assert.equal((await luis.del(`/tickets/${id}`)).status, 403);
  assert.equal((await marta.del(`/tickets/${id}`)).status, 403);
  assert.equal((await ana.del(`/tickets/${id}`)).status, 200);
  assert.equal((await marta.post('/users', { name: 'X', username: 'xx', password: '12345678', color: '#1E5B4F' })).status, 403);
  assert.equal((await marta.patch('/settings', { business_name: 'X' })).status, 403);
  assert.equal((await marta.get('/admin/export.csv')).status, 403);
  assert.equal((await luis.get('/admin/backup')).status, 403);
});

test('Archivar: admin, coordinación o quien lo creó', async () => {
  const id = await createAs(ana, { title: 'Pendiente de Ana para Luis', assignee_ids: [ids.luis] });
  assert.equal((await luis.patch(`/tickets/${id}`, { archived: true })).status, 403);
  assert.equal((await marta.patch(`/tickets/${id}`, { archived: true })).status, 200);
  const own = await createAs(luis, { title: 'Mío' });
  assert.equal((await luis.patch(`/tickets/${own}`, { archived: true })).status, 200);
});

test('Varios responsables: a los dos les aparece y a los dos les llega el aviso', async () => {
  const id = await createAs(ana, { title: 'Trabajo en equipo', assignee_ids: [ids.luis, ids.carla] });
  assert.ok((await ticketIds(luis)).includes(id));
  assert.ok((await ticketIds(carla)).includes(id));
  for (const s of [luis, carla]) {
    const notes = (await s.get('/notifications')).json.items as { ticket_id: number; type: string }[];
    assert.ok(notes.some((n) => n.ticket_id === id && n.type === 'assigned'));
  }
  // Cualquiera de los dos lo termina y se avisa al otro.
  assert.equal((await carla.patch(`/tickets/${id}`, { status: 'done' })).status, 200);
  const notes = (await luis.get('/notifications')).json.items as { ticket_id: number; type: string }[];
  assert.ok(notes.some((n) => n.ticket_id === id && n.type === 'done'));
});

test('Sin responsable: va a la bandeja y se avisa a Admin y Coordinación', async () => {
  const id = await createAs(luis, { title: 'Que alguien lo tome', assignee_ids: [] });
  for (const s of [ana, marta]) {
    const notes = (await s.get('/notifications')).json.items as { ticket_id: number; type: string }[];
    assert.ok(notes.some((n) => n.ticket_id === id && n.type === 'unassigned'), `aviso para ${s.username}`);
  }
  assert.ok((await ticketIds(luis)).includes(id), 'quien lo creó lo sigue viendo');
  assert.ok(!(await ticketIds(carla)).includes(id), 'el resto del equipo no');
  // Coordinación lo asigna a Carla
  assert.equal((await marta.patch(`/tickets/${id}`, { assignee_ids: [ids.carla] })).status, 200);
  assert.ok((await ticketIds(carla)).includes(id));
});

test('Si alguien se quita y queda sin responsable, regresa a la bandeja', async () => {
  const id = await createAs(ana, { title: 'Luis lo regresa', assignee_ids: [ids.luis] });
  const r = await luis.patch(`/tickets/${id}`, { assignee_ids: [] });
  assert.equal(r.status, 200);
  assert.equal(r.json.hidden, true, 'Luis ya no lo ve');
  const notes = (await marta.get('/notifications')).json.items as { ticket_id: number; type: string }[];
  assert.ok(notes.some((n) => n.ticket_id === id && n.type === 'unassigned'));
});

test('Ajuste: el Equipo solo se asigna a sí mismo si así lo decide el admin', async () => {
  assert.equal((await ana.patch('/settings', { members_can_assign: false })).status, 200);
  try {
    assert.equal((await luis.post('/tickets', { title: 'Para Carla', assignee_ids: [ids.carla] })).status, 403);
    assert.equal((await luis.post('/tickets', { title: 'Para mí', assignee_ids: [ids.luis] })).status, 200);
    assert.equal((await luis.post('/tickets', { title: 'Para la bandeja', assignee_ids: [] })).status, 200);
    // Tampoco puede poner a otros en copia ni encargarles pasos (pero sí a sí mismo)
    assert.equal((await luis.post('/tickets', { title: 'Copia a Carla', follower_ids: [ids.carla] })).status, 403);
    const own = (await luis.post('/tickets', { title: 'Mío con pasos' })).json.id as number;
    assert.equal((await luis.patch(`/tickets/${own}`, { follower_ids: [ids.carla] })).status, 403);
    assert.equal((await luis.post(`/tickets/${own}/checklist`, { text: 'Paso de Carla', assignee_id: ids.carla })).status, 403);
    const step = (await luis.post(`/tickets/${own}/checklist`, { text: 'Paso mío', assignee_id: ids.luis })).json;
    assert.equal((await luis.patch(`/checklist/${step.id}`, { assignee_id: ids.carla })).status, 403);
    // Coordinación siempre puede repartir
    assert.equal((await marta.post('/tickets', { title: 'Marta reparte', assignee_ids: [ids.carla] })).status, 200);
  } finally {
    await ana.patch('/settings', { members_can_assign: true });
  }
});

test('Mencionar con @ a alguien que no lo veía lo pone en copia', async () => {
  const id = await createAs(luis, { title: 'Necesito a Carla', assignee_ids: [ids.luis] });
  assert.ok(!(await ticketIds(carla)).includes(id));
  assert.equal((await luis.post(`/tickets/${id}/comments`, { body: '@carla ¿me ayudas con esto?' })).status, 200);
  assert.ok((await ticketIds(carla)).includes(id));
  const t = (await ana.get(`/tickets/${id}`)).json;
  assert.ok(t.follower_ids.includes(ids.carla));
  // Y puede dejar de seguirlo
  assert.equal((await carla.post(`/tickets/${id}/follow`, { follow: false })).status, 200);
  assert.ok(!(await ticketIds(carla)).includes(id));
});

test('Asignar un paso a alguien le da acceso al pendiente', async () => {
  const id = await createAs(luis, { title: 'Con pasos', assignee_ids: [ids.luis] });
  const step = (await luis.post(`/tickets/${id}/checklist`, { text: 'Llamar al banco' })).json;
  assert.equal((await luis.patch(`/checklist/${step.id}`, { assignee_id: ids.carla })).status, 200);
  assert.ok((await ticketIds(carla)).includes(id));
});

test('Notas y archivos: lo propio se borra solo en los primeros minutos; después, solo un admin', async () => {
  const id = await createAs(luis, { title: 'Con notas' });
  const c1 = (await luis.post(`/tickets/${id}/comments`, { body: 'me equivoqué' })).json;
  assert.equal((await luis.del(`/comments/${c1.id}`)).status, 200);
  const c2 = (await luis.post(`/tickets/${id}/comments`, { body: 'nota vieja' })).json;
  const db = new DatabaseSync(path.join(DATA, 'giraboard.db'));
  db.prepare("UPDATE comments SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(c2.id);
  db.close();
  assert.equal((await luis.del(`/comments/${c2.id}`)).status, 403);
  assert.equal((await ana.del(`/comments/${c2.id}`)).status, 200);
});

test('Los datos de acceso del equipo solo los ve un admin', async () => {
  const forLuis = (await luis.get('/users')).json as { last_login_at: string | null }[];
  assert.ok(forLuis.every((u) => u.last_login_at === null));
  const forAna = (await ana.get('/users')).json as { last_login_at: string | null }[];
  assert.ok(forAna.some((u) => u.last_login_at !== null));
});

test('Quitar el acceso reparte sus pendientes sin perder los compartidos', async () => {
  const solo = await createAs(ana, { title: 'Solo de Carla', assignee_ids: [ids.carla] });
  const shared = await createAs(ana, { title: 'Carla y Luis', assignee_ids: [ids.carla, ids.luis] });
  const r = await ana.patch(`/users/${ids.carla}`, { active: false, reassign_to: ids.marta });
  assert.equal(r.status, 200);
  assert.deepEqual((await ana.get(`/tickets/${solo}`)).json.assignee_ids, [ids.marta]);
  assert.deepEqual((await ana.get(`/tickets/${shared}`)).json.assignee_ids, [ids.luis]);
  assert.equal((await carla.get('/tickets')).status, 401, 'su sesión se cerró');
  await ana.patch(`/users/${ids.carla}`, { active: true });
  await carla.login();
});

test('Pasos que te tocan: cada quien ve los suyos y desaparecen al marcarlos', async () => {
  const id = await createAs(ana, { title: 'Con pasos repartidos', assignee_ids: [ids.luis] });
  const s1 = (await ana.post(`/tickets/${id}/checklist`, { text: 'Paso de Carla', assignee_id: ids.carla })).json;
  await ana.post(`/tickets/${id}/checklist`, { text: 'Paso de Luis', assignee_id: ids.luis });
  const carlaSteps = (await carla.get('/tickets/my-steps')).json as { id: number; ticket_id: number }[];
  assert.ok(carlaSteps.some((s) => s.id === s1.id && s.ticket_id === id));
  assert.ok(!((await luis.get('/tickets/my-steps')).json as { id: number }[]).some((s) => s.id === s1.id));
  // Carla puede verlo (quedó en copia) y marcar su paso
  assert.ok((await ticketIds(carla)).includes(id));
  assert.equal((await carla.patch(`/checklist/${s1.id}`, { done: true })).status, 200);
  assert.ok(!((await carla.get('/tickets/my-steps')).json as { id: number }[]).some((s) => s.id === s1.id));
  const notes = (await carla.get('/notifications')).json.items as { ticket_id: number; type: string }[];
  assert.ok(notes.some((n) => n.ticket_id === id && n.type === 'step'), 'a Carla le llegó el aviso del paso');
});

test('Quitar un paso queda en la bitácora', async () => {
  const id = await createAs(luis, { title: 'Bitácora de pasos' });
  const step = (await luis.post(`/tickets/${id}/checklist`, { text: 'Se va a quitar' })).json;
  assert.equal((await luis.del(`/checklist/${step.id}`)).status, 200);
  const t = (await luis.get(`/tickets/${id}`)).json as { activity: { type: string }[] };
  assert.ok(t.activity.some((a) => a.type === 'checklist_removed'));
});

test('Un tipo o cliente inexistente da un error claro, no un error del servidor', async () => {
  const r = await ana.post('/tickets', { title: 'Tipo raro', category_id: 99999 });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /tipo/);
  const id = await createAs(ana, { title: 'Cliente raro' });
  assert.equal((await ana.patch(`/tickets/${id}`, { client_id: 99999 })).status, 400);
});

test('El estado del servidor dice qué versión corre (para avisar de actualizaciones)', async () => {
  const r = await fetch(`${BASE}/health`);
  const json = (await r.json()) as { ok: boolean; build: string };
  assert.equal(json.ok, true);
  assert.equal(typeof json.build, 'string');
});
