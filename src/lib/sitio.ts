// Datos de contacto del sitio. Cambiar aquí y se actualiza en todas las páginas.

export const SITIO = {
  nombre: 'Feria 4 Vientos',
  conjunto: 'Conjuntos Residenciales 4 Vientos',
  ciudad: 'Bogotá',
  descripcion:
    'Feria de emprendimientos de los Conjuntos Residenciales 4 Vientos en Bogotá. Mistral, Gregal, Austro y Cierzo: cuatro conjuntos, cuatro vientos, una misma comunidad.',
  /** WhatsApp del comité, formato internacional sin "+" (57 + celular). */
  comiteWhatsapp: '573046452629',
  instagram: 'feria4vientos',
  /** Enlace del botón "Cotiza tu página web con JuanCode" (sección JuanCode y footer). Si queda vacío, no se muestra. */
  juancodeUrl: 'https://el-libro-juancode-python-desde-0.pages.dev/web/',
} as const;

export function linkWhatsApp(mensaje: string, numero: string = SITIO.comiteWhatsapp) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export const MENSAJES = {
  general: 'Hola comité de la Feria 4 Vientos 👋 Tengo una pregunta sobre la feria.',
  participar:
    'Hola comité 👋 Quiero registrar mi emprendimiento en la Feria 4 Vientos. Mi nombre es ___, vivo en el conjunto ___, apartamento ___.',
  ayudaPanel: 'Hola comité 👋 Necesito ayuda con mi panel de la Feria 4 Vientos.',
} as const;
