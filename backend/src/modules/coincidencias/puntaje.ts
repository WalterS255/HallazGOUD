// Motor de coincidencias (CLAUDE.md §7): puntaje de 0 a 100 entre una publicación
// de referencia y un candidato del tipo opuesto.
//
// Es una función PURA: no lee la BD ni la hora actual; con los mismos datos
// devuelve siempre lo mismo. Por eso se prueba sin base de datos.

export const PESOS = { categoria: 35, sede: 20, tiempo: 25, texto: 20 } as const;
export const VENTANA_DIAS = 7;
export const UMBRAL = 50; // se muestran solo las coincidencias con total > 50

const MS_POR_DIA = 86_400_000;

export interface DatosCoincidencia {
  id_categoria: number;
  id_sede: number;
  // Clase de lugar (biblioteca, cafetería…). null = sin clasificar: nunca es "análogo".
  tipo_lugar: string | null;
  fecha_suceso: Date;
  // Lexemas del tsvector `busqueda`: palabras ya en minúscula, en raíz y sin palabras vacías.
  palabras: string[];
}

export interface Desglose {
  categoria: number;
  sede: number;
  tiempo: number;
  texto: number;
  total: number;
}

// Pregunta 13.2 (decidida 2026-11-21): dos lugares de sedes distintas son "análogos" si
// son de la misma clase (biblioteca con biblioteca…). OTRO o sin clasificar, nunca.
export const esAnalogo = (a: string | null, b: string | null): boolean =>
  a !== null && a === b && a !== 'OTRO';

const redondear = (n: number): number => Math.round(n * 10) / 10;

export function calcularPuntaje(ref: DatosCoincidencia, cand: DatosCoincidencia): Desglose {
  const categoria = ref.id_categoria === cand.id_categoria ? PESOS.categoria : 0;

  const sede =
    ref.id_sede === cand.id_sede
      ? PESOS.sede
      : esAnalogo(ref.tipo_lugar, cand.tipo_lugar)
        ? PESOS.sede / 2 // "edificio análogo" en otra sede (pregunta 13.2)
        : 0;

  const dias = Math.abs(cand.fecha_suceso.getTime() - ref.fecha_suceso.getTime()) / MS_POR_DIA;
  const tiempo = PESOS.tiempo * Math.max(0, 1 - dias / VENTANA_DIAS);

  // Porcentaje de palabras de la referencia que aparecen en el candidato.
  const delCandidato = new Set(cand.palabras);
  const enComun = ref.palabras.filter((p) => delCandidato.has(p)).length;
  const texto = ref.palabras.length === 0 ? 0 : (PESOS.texto * enComun) / ref.palabras.length;

  return {
    categoria,
    sede,
    tiempo: redondear(tiempo),
    texto: redondear(texto),
    total: redondear(categoria + sede + tiempo + texto),
  };
}

export const seMuestra = (d: Desglose): boolean => d.total > UMBRAL;
