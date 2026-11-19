'use client';

import { useEffect, useState } from 'react';

type Tema = 'dark' | 'light';

/** Cambia entre tema oscuro (por defecto) y claro. La elección se recuerda en este navegador. */
export function BotonTema() {
  const [tema, setTema] = useState<Tema>('dark');

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function cambiar() {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    setTema(nuevo);
    try {
      localStorage.setItem('tema', nuevo);
    } catch {
      // Sin almacenamiento (ventana privada): el cambio dura hasta recargar.
    }
  }

  return (
    <button type="button" onClick={cambiar} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'} title="Cambiar tema">
      <span aria-hidden>{tema === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
