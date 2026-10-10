import { get, run } from './db.ts';
import { CATEGORY_COLORS, CATEGORY_TEMPLATES, type CategoryTemplate } from '../shared/types.ts';

/** Crea los tipos de pendiente iniciales según la plantilla elegida (solo si todavía no hay ninguno). */
export function seedDefaults(template: CategoryTemplate = 'general') {
  if (get('SELECT id FROM categories LIMIT 1')) return;
  CATEGORY_TEMPLATES[template].categories.forEach((name, i) => {
    run('INSERT INTO categories (name, color, position) VALUES (?, ?, ?)', name, CATEGORY_COLORS[i % CATEGORY_COLORS.length], i);
  });
}
