// Puntaje de coincidencia entre un PERDIDO y un ENCONTRADO (sección 7, RF-23).
//
//   Misma categoría ...... 35
//   Misma sede ........... 20   (edificio análogo en otra sede: 10, PENDIENTE pregunta 13.2)
//   Proximidad temporal .. 25 × (1 − |Δdías| / 7), 0 si pasa de 7 días
//   Similitud textual .... 20 × (palabras del PERDIDO que están en el ENCONTRADO / total)
//
// Función PURA: no toca la BD. El repositorio hace el prefiltro en SQL (tipo opuesto,
// ACTIVA, ±7 días) y le pasa aquí los candidatos. Las "palabras" son los lexemas del
// tsvector `busqueda` (tsvector_to_array), ya en minúscula, en raíz y sin palabras vacías.
// Mismos resultados que docs/sql/04_coincidencias.sql (lo comprueba puntaje.spec.ts).

export const PESOS = { categoria: 35, sede: 20, tiempo: 25, texto: 20 } as const;
export const VENTANA_DIAS = 7;
export const UMBRAL = 50; // se muestran solo las coincidencias con puntaje > 50

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface DatosCoincidencia {
  idCategoria: number;
  idSede: number;
  fechaSuceso: Date;
  palabras: readonly string[];
}

export interface Desglose {
  categoria: number;
  sede: number;
  tiempo: number;
  texto: number;
  total: number;
}

export function calcularPuntaje(
  perdido: DatosCoincidencia,
  encontrado: DatosCoincidencia,
): Desglose {
  const categoria = perdido.idCategoria === encontrado.idCategoria ? PESOS.categoria : 0;
  const sede = perdido.idSede === encontrado.idSede ? PESOS.sede : 0;

  const dias =
    Math.abs(perdido.fechaSuceso.getTime() - encontrado.fechaSuceso.getTime()) / MS_POR_DIA;
  const tiempo = dias > VENTANA_DIAS ? 0 : PESOS.tiempo * (1 - dias / VENTANA_DIAS);

  // Se compara contra las palabras ÚNICAS del perdido (un tsvector ya no repite lexemas,
  // pero así la función no depende de eso).
  const delPerdido = new Set(perdido.palabras);
  const delEncontrado = new Set(encontrado.palabras);
  const enComun = [...delPerdido].filter((p) => delEncontrado.has(p)).length;
  const texto = delPerdido.size === 0 ? 0 : (PESOS.texto * enComun) / delPerdido.size;

  return { categoria, sede, tiempo, texto, total: categoria + sede + tiempo + texto };
}

export function esCoincidencia(d: Desglose): boolean {
  return d.total > UMBRAL;
}

// Calcula el puntaje de cada candidato, deja solo los que pasan el umbral y los
// ordena de mayor a menor (lo que se muestra al autor del PERDIDO).
export function ordenarCoincidencias<T extends DatosCoincidencia>(
  perdido: DatosCoincidencia,
  candidatos: readonly T[],
): Array<{ candidato: T; puntaje: Desglose }> {
  return candidatos
    .map((candidato) => ({ candidato, puntaje: calcularPuntaje(perdido, candidato) }))
    .filter((c) => esCoincidencia(c.puntaje))
    .sort((a, b) => b.puntaje.total - a.puntaje.total);
}
