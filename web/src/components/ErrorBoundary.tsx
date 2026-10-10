import { Component, type ReactNode } from 'react';

/** Si algo falla al dibujar una pantalla, mostramos un mensaje en vez de dejarla en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
    // Si el servidor se actualizó, las partes nuevas de la app tienen otro nombre: recargar lo arregla.
    // (Solo una vez cada 30 s, para no entrar en un ciclo.)
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error.message)) {
      try {
        const last = Number(sessionStorage.getItem('gb.reloaded') ?? 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem('gb.reloaded', String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* sin almacenamiento: se muestra el botón */
      }
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-2xl font-semibold">Algo salió mal en esta pantalla</p>
        <p className="max-w-md text-ink-2">No se perdió nada de lo guardado. Recarga la página para continuar.</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}
