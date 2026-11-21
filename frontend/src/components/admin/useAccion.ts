'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Lo que repiten todas las acciones del panel (RF-28, RF-29): marcar "ocupado", llamar a
// la API, mostrar el error del backend tal cual (por ejemplo, 409 EN_USO) y refrescar
// la página para ver el cambio. Devuelve true si salió bien.
export function useAccion() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(accion: () => Promise<unknown>): Promise<boolean> {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return { ocupado, error, ejecutar };
}
