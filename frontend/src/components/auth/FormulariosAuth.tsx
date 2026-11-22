'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ErrorApi, errorDeCampo, llamarApi } from '@/lib/api/cliente';

function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);
  async function enviar(accion: () => Promise<string | void>) {
    setEnviando(true);
    setError(null);
    try {
      const mensaje = await accion();
      if (mensaje) setExito(mensaje);
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  }
  return { enviando, error, exito, enviar };
}

function Campo({
  id,
  etiqueta,
  error,
  ...props
}: { id: string; etiqueta: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        className="field"
        aria-invalid={!!error}
        aria-describedby={error ? `e-${id}` : undefined}
        {...props}
      />
      {error && (
        <p id={`e-${id}`} className="err">
          {error}
        </p>
      )}
    </div>
  );
}

function ErrorGeneral({ error, campos = [] }: { error: unknown; campos?: string[] }) {
  if (!(error instanceof Error)) return null;
  // Si el error ya se muestra junto a un campo, no se repite arriba.
  if (error instanceof ErrorApi && campos.some((c) => error.campos[c])) return null;
  return (
    <p className="note note-err" role="alert">
      {error.message}
    </p>
  );
}

function ReenviarVerificacion({ correo }: { correo: string }) {
  const { enviando, exito, error, enviar } = useEnvio();
  if (exito) return <p className="note note-ok">{exito}</p>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn"
        disabled={enviando}
        onClick={() =>
          enviar(async () => {
            const r = await llamarApi<{ mensaje?: string }>('/api/auth/reenviar-verificacion', {
              metodo: 'POST',
              cuerpo: { correo },
            });
            return (
              r.mensaje ??
              'Si tu cuenta existe y aún no está activada, te enviamos un nuevo enlace.'
            );
          })
        }
      >
        Reenviar correo de activación
      </button>
      <ErrorGeneral error={error} />
    </div>
  );
}

export function FormLogin({ siguiente }: { siguiente: string }) {
  const { enviando, error, enviar } = useEnvio();
  const [correo, setCorreo] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    enviar(async () => {
      await llamarApi('/api/auth/login', {
        metodo: 'POST',
        cuerpo: { correo: f.get('correo'), contrasena: f.get('contrasena') },
      });
      // Recarga completa para que el encabezado (componente de servidor) lea la nueva sesión.
      window.location.assign(siguiente);
    });
  }

  return (
    // method="post" aunque el envío lo maneje React: si alguien pulsa "Ingresar" ANTES de
    // que cargue el JavaScript (celular lento), el navegador envía el formulario solo.
    // Sin method sería GET y la contraseña quedaría en la URL, el historial y los logs.
    // Lo encontró OWASP ZAP (Fase J): /login?contrasena=…&correo=…
    <form method="post" onSubmit={onSubmit} className="stack">
      <Campo
        id="correo"
        etiqueta="Correo institucional"
        type="email"
        autoComplete="email"
        required
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
      />
      <Campo
        id="contrasena"
        etiqueta="Contraseña"
        type="password"
        autoComplete="current-password"
        required
      />
      <ErrorGeneral error={error} />
      {error instanceof ErrorApi && error.codigo === 'CUENTA_NO_VERIFICADA' && (
        <ReenviarVerificacion correo={correo} />
      )}
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        {enviando ? 'Ingresando…' : 'Ingresar'}
      </button>
      <p className="small" style={{ textAlign: 'center' }}>
        <Link href="/recuperar" className="link">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}

export function FormRegistro({ dominio }: { dominio: string }) {
  const { enviando, error, exito, enviar } = useEnvio();
  const campos = ['nombre', 'correo', 'programa', 'contrasena', 'aceptaPolitica'];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    enviar(async () => {
      const r = await llamarApi<{ mensaje: string }>('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: {
          nombre: f.get('nombre'),
          correo: f.get('correo'),
          programa: f.get('programa'),
          contrasena: f.get('contrasena'),
          aceptaPolitica: f.get('aceptaPolitica') === 'on',
        },
      });
      return r.mensaje;
    });
  }

  if (exito) return <p className="note note-ok">{exito}</p>;

  return (
    <form method="post" onSubmit={onSubmit} className="stack" noValidate>
      <Campo
        id="nombre"
        etiqueta="Nombre completo"
        autoComplete="name"
        required
        error={errorDeCampo(error, 'nombre')}
      />
      <Campo
        id="correo"
        etiqueta={`Correo institucional (@${dominio})`}
        type="email"
        autoComplete="email"
        required
        placeholder={`usuario@${dominio}`}
        error={errorDeCampo(error, 'correo')}
      />
      <Campo
        id="programa"
        etiqueta="Programa o dependencia"
        required
        placeholder="Ej.: Ingeniería de Sistemas"
        error={errorDeCampo(error, 'programa')}
      />
      <Campo
        id="contrasena"
        etiqueta="Contraseña (mínimo 8 caracteres, con letras y números)"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={errorDeCampo(error, 'contrasena')}
      />
      <div>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" name="aceptaPolitica" style={{ marginTop: 4 }} />
          <span>
            Acepto la{' '}
            <Link href="/privacidad" target="_blank" className="link">
              política de tratamiento de datos personales
            </Link>{' '}
            (Ley 1581 de 2012).
          </span>
        </label>
        {errorDeCampo(error, 'aceptaPolitica') && (
          <p className="err">{errorDeCampo(error, 'aceptaPolitica')}</p>
        )}
      </div>
      <ErrorGeneral error={error} campos={campos} />
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  );
}

export function FormRecuperar() {
  const { enviando, error, exito, enviar } = useEnvio();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    enviar(async () => {
      const r = await llamarApi<{ mensaje?: string }>('/api/auth/recuperar', {
        metodo: 'POST',
        cuerpo: { correo: f.get('correo') },
      });
      return (
        r.mensaje ??
        'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.'
      );
    });
  }

  if (exito) return <p className="note note-ok">{exito}</p>;
  return (
    <form method="post" onSubmit={onSubmit} className="stack">
      <Campo
        id="correo"
        etiqueta="Correo institucional"
        type="email"
        autoComplete="email"
        required
        error={errorDeCampo(error, 'correo')}
      />
      <ErrorGeneral error={error} campos={['correo']} />
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        Enviar enlace
      </button>
    </form>
  );
}

export function FormRestablecer({ token }: { token: string }) {
  const { enviando, error, exito, enviar } = useEnvio();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    enviar(async () => {
      const r = await llamarApi<{ mensaje: string }>('/api/auth/restablecer', {
        metodo: 'POST',
        cuerpo: { token, contrasena: f.get('contrasena') },
      });
      return r.mensaje;
    });
  }

  if (exito) {
    return (
      <p className="note note-ok">
        {exito}{' '}
        <Link href="/login" className="underline">
          Ingresar
        </Link>
      </p>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="stack">
      <Campo
        id="contrasena"
        etiqueta="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={errorDeCampo(error, 'contrasena')}
      />
      <ErrorGeneral error={error} campos={['contrasena']} />
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        Guardar contraseña
      </button>
    </form>
  );
}
