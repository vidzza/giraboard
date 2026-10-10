import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

export function fail(status: 400 | 403 | 404 | 409 | 413 | 429, message: string): never {
  throw new HTTPException(status, { message });
}

export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    fail(400, 'Datos inválidos');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    fail(400, issue?.message && !issue.message.startsWith('Invalid') ? issue.message : 'Revisa los datos capturados');
  }
  return result.data;
}

export function idParam(c: Context, name = 'id') {
  const id = Number(c.req.param(name));
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Identificador inválido');
  return id;
}

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));
