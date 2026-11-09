/**
 * Acesso a localStorage/sessionStorage que nunca lança.
 * Em navegadores com dados do site bloqueados (modo privado, "bloquear todos os cookies", webviews),
 * o simples acesso a `window.localStorage` lança SecurityError. Usar apenas para conveniências por viewer.
 */
type Kind = 'local' | 'session';

function store(kind: Kind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function make(kind: Kind) {
  return {
    getItem(key: string): string | null {
      try { return store(kind)?.getItem(key) ?? null; } catch { return null; }
    },
    setItem(key: string, value: string): void {
      try { store(kind)?.setItem(key, value); } catch { /* indisponível ou cheio */ }
    },
    removeItem(key: string): void {
      try { store(kind)?.removeItem(key); } catch { /* indisponível */ }
    },
  };
}

export const safeLocalStorage = make('local');
export const safeSessionStorage = make('session');
