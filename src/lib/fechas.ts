// Formato de fechas en español de Colombia, siempre en hora de Bogotá.
import type { Fecha } from './db';

const ZONA = 'America/Bogota';
const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** YYYY-MM-DD de hoy en Bogotá. */
export function hoyBogota(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Fechas de hoy en adelante, en orden. */
export function proximas(fechas: Fecha[]) {
  const hoy = hoyBogota();
  return fechas.filter((f) => f.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function comoFecha(iso: string) {
  // Mediodía UTC para que ningún huso horario cambie el día.
  return new Date(`${iso}T12:00:00Z`);
}

export function diaMes(iso: string) {
  const [, m, d] = iso.split('-');
  return { dd: d, mm: MESES_CORTOS[Number(m) - 1] ?? '' };
}

/** "Sábado 26 de septiembre" */
export function fechaLarga(iso: string) {
  const s = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(comoFecha(iso));
  return s.charAt(0).toUpperCase() + s.slice(1).replace(',', '');
}

/** "Sábado" */
export function diaSemana(iso: string) {
  const s = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long' }).format(comoFecha(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "09:00" → "9 a.m.", "13:30" → "1:30 p.m." */
export function hora(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${sufijo}`;
}

export function rangoHoras(f: Pick<Fecha, 'hora_inicio' | 'hora_fin'>) {
  return `${hora(f.hora_inicio)} a ${hora(f.hora_fin)}`;
}
