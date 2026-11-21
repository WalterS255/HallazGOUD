import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tratamiento de datos personales' };

// RNF-19. Texto base: debe revisarlo y aprobarlo la oficina jurídica de la universidad.
export default function PrivacidadPage() {
  return (
    <article className="stack" style={{ maxWidth: '65ch', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Política de tratamiento de datos personales</h1>
      <p className="note note-info">Borrador para validación institucional. No es la versión oficial.</p>
      <p>
        HallazGO UD recolecta sólo los datos necesarios para operar la plataforma de objetos perdidos y encontrados, en
        cumplimiento de la Ley 1581 de 2012 y sus decretos reglamentarios.
      </p>
      <h2>Datos que recolectamos</h2>
      <ul className="stack" style={{ gap: 4, listStyle: 'disc', paddingLeft: 24 }}>
        <li>Nombre, correo institucional, programa o dependencia y, si la subes, tu foto de perfil.</li>
        <li>Las publicaciones, imágenes, reclamaciones y mensajes que realices.</li>
        <li>Registros técnicos de seguridad de las acciones críticas.</li>
      </ul>
      <h2>Finalidad</h2>
      <p>
        Permitir la publicación y búsqueda de objetos, verificar la propiedad antes de una entrega, facilitar la comunicación
        entre las partes y prevenir el fraude.
      </p>
      <h2>Lo que nunca hacemos</h2>
      <ul className="stack" style={{ gap: 4, listStyle: 'disc', paddingLeft: 24 }}>
        <li>Mostrar tu correo o teléfono a otros usuarios: todo contacto ocurre por el chat interno.</li>
        <li>Publicar el detalle reservado de un objeto.</li>
        <li>Compartir tus datos con terceros ajenos a la universidad.</li>
      </ul>
      <h2>Tus derechos</h2>
      <p>
        Puedes conocer, actualizar, rectificar y pedir la eliminación de tus datos y de tu cuenta por el canal de atención
        que defina la universidad.
      </p>
    </article>
  );
}
