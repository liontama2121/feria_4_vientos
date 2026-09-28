// Textos de las notificaciones del flujo de moderación.
// Aún no hay envío automático: se guardan en la tabla `notificaciones` y el comité las manda
// con un clic desde /admin/comite#notificaciones (wa.me con el texto listo).
// Para automatizar (Twilio, Meta Cloud API o webhook a n8n), el punto único es `avisar()`.
import { TORRES_BASE, motivoReporte, type TorreId } from './constantes';
import { crearNotificacion, type Cuenta, type Notificacion, type Registro, type Reporte, type Solicitud } from './db';

const conjunto = (t: TorreId) => TORRES_BASE[t]?.nombre ?? t;
/** "Mistral 402", o solo "Mistral" si no dio torre/apto. */
const donde = (t: TorreId, apto: string) => `${conjunto(t)}${apto ? ` ${apto}` : ''}`;

export function avisar(db: D1Database, n: Omit<Notificacion, 'id' | 'creado_at' | 'enviada'>) {
  return crearNotificacion(db, n);
}

export function avisoEnvio(db: D1Database, r: Registro) {
  const d = r.borrador;
  return avisar(db, {
    para: 'admin',
    tipo: 'envio',
    titulo: 'Nuevo emprendimiento pendiente de revisión',
    mensaje: `Nuevo emprendimiento pendiente de revisión: ${d.nombre_emprendimiento} · ${donde(d.torre, d.apartamento)}`,
    whatsapp: '',
    email: '',
    slug: r.slug,
  });
}

export function avisoAprobado(db: D1Database, r: Registro, origen: string) {
  const d = r.borrador;
  return avisar(db, {
    para: 'vecino',
    tipo: 'aprobado',
    titulo: `Aprobado: ${d.nombre_emprendimiento}`,
    mensaje: `¡Hola ${d.nombre_vecino}! 🎉 Tu emprendimiento "${d.nombre_emprendimiento}" fue aprobado y ya está publicado en la Feria 4 Vientos: ${origen}/#${d.torre}`,
    whatsapp: d.whatsapp,
    email: r.owner_email ?? '',
    slug: r.slug,
  });
}

export function avisoRechazado(db: D1Database, r: Registro, motivo: string) {
  const d = r.borrador;
  return avisar(db, {
    para: 'vecino',
    tipo: 'rechazado',
    titulo: `Rechazado: ${d.nombre_emprendimiento}`,
    mensaje: `Hola ${d.nombre_vecino}. El comité de la Feria 4 Vientos revisó "${d.nombre_emprendimiento}" y no lo pudo aprobar. Motivo: ${motivo}. Si tienes dudas, respóndenos por aquí.`,
    whatsapp: d.whatsapp,
    email: r.owner_email ?? '',
    slug: r.slug,
  });
}

export function avisoCambios(db: D1Database, r: Registro, nota: string, origen: string) {
  const d = r.borrador;
  return avisar(db, {
    para: 'vecino',
    tipo: 'cambios',
    titulo: `Cambios pedidos: ${d.nombre_emprendimiento}`,
    mensaje: `Hola ${d.nombre_vecino} 👋 El comité revisó "${d.nombre_emprendimiento}" y te pide unos ajustes antes de publicarlo: ${nota}. Entra a ${origen}/admin, corrige y dale "Reenviar a revisión".`,
    whatsapp: d.whatsapp,
    email: r.owner_email ?? '',
    slug: r.slug,
  });
}

export function avisoReporte(db: D1Database, r: Registro, rep: Reporte) {
  const d = r.publicado ?? r.borrador;
  return avisar(db, {
    para: 'admin',
    tipo: 'reporte',
    titulo: `⚠️ Reporte: ${d.nombre_emprendimiento}`,
    mensaje: `Reportaron "${d.nombre_emprendimiento}" (${donde(d.torre, d.apartamento)}) por: ${motivoReporte(rep.motivo)}. ${rep.evidencias.length} foto(s) de evidencia.${rep.detalle ? ` Nota: ${rep.detalle}` : ''}`,
    whatsapp: '',
    email: '',
    slug: r.slug,
  });
}

export function avisoSolicitud(db: D1Database, c: Pick<Cuenta, 'nombre' | 'torre' | 'apartamento' | 'email'>, s: Solicitud) {
  return avisar(db, {
    para: 'admin',
    tipo: 'solicitud',
    titulo: 'Solicitud de otro emprendimiento',
    mensaje: `${c.nombre} · ${donde(c.torre, c.apartamento)} (${c.email}) pide abrir otro emprendimiento: "${s.nombre_emprendimiento}"${s.motivo ? `. Motivo: ${s.motivo}` : ''}`,
    whatsapp: '',
    email: '',
    slug: null,
  });
}

export function avisoSolicitudRespuesta(db: D1Database, c: Cuenta, s: Solicitud, aprobada: boolean, origen: string, respuesta = '') {
  return avisar(db, {
    para: 'vecino',
    tipo: aprobada ? 'solicitud_aprobada' : 'solicitud_rechazada',
    titulo: `${aprobada ? 'Aprobada' : 'No aprobada'}: otro emprendimiento (${s.nombre_emprendimiento})`,
    mensaje: aprobada
      ? `¡Hola ${c.nombre}! 🎉 El comité aprobó tu nuevo emprendimiento "${s.nombre_emprendimiento}". Entra a ${origen}/admin, elígelo en "Mis emprendimientos", llénalo y envíalo a revisión.`
      : `Hola ${c.nombre}. El comité no aprobó abrir "${s.nombre_emprendimiento}"${respuesta ? `: ${respuesta}` : ''}. Si tienes dudas, respóndenos por aquí.`,
    whatsapp: c.whatsapp,
    email: c.email,
    slug: s.slug,
  });
}

export function avisoCuentaNueva(db: D1Database, c: Pick<Cuenta, 'nombre' | 'torre' | 'apartamento' | 'email'>) {
  return avisar(db, {
    para: 'admin',
    tipo: 'cuenta_nueva',
    titulo: 'Nueva cuenta por activar',
    mensaje: `Nueva cuenta por activar: ${c.nombre} · ${donde(c.torre, c.apartamento)} (${c.email})`,
    whatsapp: '',
    email: '',
    slug: null,
  });
}

export function avisoCuenta(db: D1Database, c: Cuenta, activada: boolean, origen: string, motivo = '') {
  return avisar(db, {
    para: 'vecino',
    tipo: activada ? 'cuenta_activada' : 'cuenta_rechazada',
    titulo: activada ? `Cuenta activada: ${c.nombre}` : `Cuenta rechazada: ${c.nombre}`,
    mensaje: activada
      ? `¡Hola ${c.nombre}! 👋 El comité activó tu cuenta de la Feria 4 Vientos. Entra con tu correo (${c.email}) y tu contraseña en ${origen}/admin/login y registra tu emprendimiento.`
      : `Hola ${c.nombre}. El comité de la Feria 4 Vientos no pudo activar tu cuenta${motivo ? `: ${motivo}` : ''}. Si crees que es un error, respóndenos por aquí.`,
    whatsapp: c.whatsapp,
    email: c.email,
    slug: null,
  });
}
