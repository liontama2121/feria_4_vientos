// Ferias itinerantes e inscripciones. Sin imports de servidor: también lo usan los scripts
// del navegador (coordinación y comité).
import { TORRE_IDS, type TorreId } from './constantes';

/**
 * Estado de una feria:
 * borrador (no sale) → inscripciones (sale en la landing y se puede inscribir) →
 * cerrada (sale, ya no recibe inscripciones) → finalizada (no sale).
 */
export const ESTADOS_FERIA = ['borrador', 'inscripciones', 'cerrada', 'finalizada'] as const;
export type EstadoFeria = (typeof ESTADOS_FERIA)[number];
export const ETIQUETA_FERIA: Record<EstadoFeria, string> = {
  borrador: 'Borrador',
  inscripciones: 'Inscripciones abiertas',
  cerrada: 'Inscripciones cerradas',
  finalizada: 'Finalizada',
};
/** Estados que se muestran en la landing (si además están dentro de su ventana de fechas). */
export const FERIA_VISIBLE: readonly EstadoFeria[] = ['inscripciones', 'cerrada'];

/**
 * Inscripción de un emprendimiento a una feria. El vecino NO elige conjunto: el comité lo ubica.
 * pendiente → aprobado (aprobado y ubicado) → pago_aprobado → participando; o rechazada.
 * Si la feria no cobra (valor 0), aprobar la deja directo en pago_aprobado.
 */
export const ESTADOS_INSCRIPCION = ['pendiente', 'aprobado', 'pago_aprobado', 'participando', 'rechazada'] as const;
export type EstadoInscripcion = (typeof ESTADOS_INSCRIPCION)[number];
export const ETIQUETA_INSCRIPCION: Record<EstadoInscripcion, string> = {
  pendiente: 'En espera de aprobación y ubicación',
  aprobado: 'Aprobado y ubicado',
  pago_aprobado: 'Pago aprobado',
  participando: 'Participa',
  rechazada: 'Rechazado',
};
/** Aprobados y ubicados: salen en la landing, ocupan cupo y se les puede avisar por WhatsApp. */
export const UBICADOS: readonly EstadoInscripcion[] = ['aprobado', 'pago_aprobado', 'participando'];

export const MENSAJE_RECIBIDA =
  'Tu solicitud fue recibida. Está en espera de aprobación y ubicación por parte del comité. Te avisaremos por WhatsApp el conjunto donde te tocará vender.';

/** Pasos del stepper del emprendedor. */
export const PASOS_INSCRIPCION = [
  { id: 'pendiente', label: 'Solicitud recibida' },
  { id: 'aprobado', label: 'Aprobado y ubicado' },
  { id: 'pago_aprobado', label: 'Pago aprobado' },
  { id: 'participando', label: 'Participa' },
] as const;

export function pasoActual(e: EstadoInscripcion) {
  return e === 'rechazada' ? -1 : PASOS_INSCRIPCION.findIndex((p) => p.id === e);
}

/** Conjunto escrito a mano (Excel): "mistral", " MISTRAL ", "Conjunto Gregal" → id; si no, null. */
export function conjuntoDeTexto(v: unknown): TorreId | null {
  const s = String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*conjunto\s+/, '')
    .trim();
  return (TORRE_IDS as readonly string[]).includes(s) ? (s as TorreId) : null;
}

/**
 * Celular colombiano: 10 dígitos empezando por 3. Acepta +57, 57, 0057, espacios y guiones.
 * Devuelve '' si no es válido (así nunca se arma un wa.me roto).
 */
export function celularCO(v: string | null | undefined) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 14 && d.startsWith('0057')) d = d.slice(4);
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : '';
}

export function linkWa(numero: string, mensaje: string) {
  const d = celularCO(numero);
  return d ? `https://wa.me/57${d}?text=${encodeURIComponent(mensaje)}` : '';
}

/** "sábado 26 de septiembre" (en minúscula, para ir en mitad de una frase). */
export function fechaEnFrase(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(d).replace(',', '');
}

/** Uno: "tu emprendimiento X fue seleccionado…". Solicitud en bloque: "tus emprendimientos X y Y fueron seleccionados…". */
export function mensajeSeleccion(p: { nombre: string; emprendimiento: string | string[]; fecha: string; conjunto: string }) {
  const lista = Array.isArray(p.emprendimiento) ? p.emprendimiento : [p.emprendimiento];
  const que =
    lista.length > 1
      ? `tus emprendimientos ${lista.slice(0, -1).join(', ')} y ${lista.at(-1)} fueron seleccionados`
      : `tu emprendimiento ${lista[0]} fue seleccionado`;
  return `Hola ${p.nombre}, ${que} para la Feria 4 Vientos del ${fechaEnFrase(p.fecha)}. Tu lugar de venta es el conjunto ${p.conjunto}. ¡Te esperamos!`;
}

export function pesos(valor: number) {
  return valor > 0 ? `$${valor.toLocaleString('es-CO')}` : 'Gratis';
}

/** Cupos totales de una feria (suma por conjunto; 0 = sin límite). */
export function cuposTotales(cupos: Partial<Record<TorreId, number>> | undefined, conjuntos: readonly TorreId[]) {
  return conjuntos.reduce((s, c) => s + (cupos?.[c] ?? 0), 0);
}

/** Lo que ve coordinación y comité de cada inscripción. */
export interface FilaInscripcion {
  id: string;
  feria_id: string;
  slug: string;
  estado: EstadoInscripcion;
  conjunto_asignado: TorreId | null;
  que_vende: string;
  necesidades: string;
  nota: string;
  creado_at: string;
  revisado_at: string | null;
  revisado_por: string | null;
  pago_at: string | null;
  notificado_at: string | null;
  notificado_por: string | null;
  notificado_conjunto: string | null;
  /** Solicitud en bloque: inscripciones del mismo vecino enviadas juntas (se ubican, aprueban y avisan juntas). */
  grupo: string | null;
  /** Descripción corta del emprendimiento (se muestra si no escribió "qué vende"). */
  descripcion: string;
  /** Datos del emprendimiento y su dueño (pueden faltar si se borró). */
  nombre: string;
  emprendedor: string;
  conjunto_origen: TorreId | null;
  categoria: string;
  whatsapp: string;
  foto: string;
  owner_email: string | null;
  cuenta_estado: string | null;
  /** Estado del emprendimiento en el directorio (draft, approved…). */
  estado_emprendimiento: string | null;
}
