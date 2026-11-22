'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorDeCampo, llamarApi } from '@/lib/api/cliente';
import { TAMANO_MAXIMO_IMAGEN, TIPOS_IMAGEN } from '@/lib/constantes';
import type { Perfil } from '@/lib/tipos';

// RF-05: datos básicos, preferencia de correos y foto.
export function FormPerfil({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await accion();
      setAviso(mensaje);
      router.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  }

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    ejecutar(
      () =>
        llamarApi('/api/usuarios/me', {
          metodo: 'PUT',
          cuerpo: {
            nombre: String(f.get('nombre')).trim(),
            programa: String(f.get('programa')).trim(),
            notificar_por_correo: f.get('notificar_por_correo') === 'on',
          },
        }),
      'Cambios guardados.',
    );
  }

  function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!TIPOS_IMAGEN.includes(archivo.type) || archivo.size > TAMANO_MAXIMO_IMAGEN) {
      return setError(new Error('La foto debe ser JPG, PNG o WEBP de máximo 5 MB.'));
    }
    const formData = new FormData();
    formData.append('foto', archivo);
    ejecutar(() => llamarApi('/api/usuarios/me/foto', { metodo: 'POST', formData }), 'Foto actualizada.');
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: 16 }}>
        {perfil.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={perfil.foto_url} alt="Tu foto de perfil" className="avatar" />
        ) : (
          <span className="avatar" aria-hidden>
            {perfil.nombre.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="row">
          <label className="btn" style={{ position: 'relative' }}>
            {perfil.foto_url ? 'Cambiar foto' : 'Subir foto'}
            <input type="file" accept={TIPOS_IMAGEN.join(',')} onChange={subirFoto} disabled={guardando} className="sr-only" />
          </label>
          {perfil.foto_url && (
            <button type="button" className="btn btn-danger" disabled={guardando}
              onClick={() => ejecutar(() => llamarApi('/api/usuarios/me/foto', { metodo: 'DELETE' }), 'Foto eliminada.')}>
              Quitar
            </button>
          )}
        </div>
      </div>

      <form method="post" onSubmit={guardar} className="stack">
        <div>
          <label htmlFor="nombre" className="label">
            Nombre
          </label>
          <input id="nombre" name="nombre" className="field" defaultValue={perfil.nombre} required maxLength={120} />
          {errorDeCampo(error, 'nombre') && <p className="err">{errorDeCampo(error, 'nombre')}</p>}
        </div>
        <div>
          <label htmlFor="programa" className="label">
            Programa o dependencia
          </label>
          <input id="programa" name="programa" className="field" defaultValue={perfil.programa} required maxLength={160} />
          {errorDeCampo(error, 'programa') && <p className="err">{errorDeCampo(error, 'programa')}</p>}
        </div>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="notificar_por_correo" defaultChecked={perfil.notificar_por_correo} />
          Recibir los avisos también por correo
        </label>
        {error instanceof Error && !errorDeCampo(error, 'nombre') && !errorDeCampo(error, 'programa') && (
          <p className="note note-err" role="alert">
            {error.message}
          </p>
        )}
        {aviso && (
          <p className="note note-ok" role="status">
            {aviso}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={guardando} style={{ justifySelf: 'start' }}>
          Guardar cambios
        </button>
      </form>
    </div>
  );
}
