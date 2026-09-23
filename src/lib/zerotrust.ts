// Sincronización opcional de cuentas con un grupo de Cloudflare Zero Trust.
// Si CF_API_TOKEN, CF_ACCOUNT_ID y CF_ACCESS_GROUP_VECINOS están configurados, al crear o
// borrar una cuenta desde /admin/comite el email se agrega/quita del grupo "Vecinos" que usa
// la política de Access. Si no, el comité lo hace a mano en el dashboard (ver CLAUDE.md).

type Regla = { email?: { email: string } } & Record<string, unknown>;

interface Grupo {
  name: string;
  include: Regla[];
  exclude?: Regla[];
  require?: Regla[];
}

export type ResultadoZT = { sincronizado: true } | { sincronizado: false; motivo: string };

export async function sincronizarGrupoVecinos(env: Env, email: string, accion: 'agregar' | 'quitar'): Promise<ResultadoZT> {
  const { CF_API_TOKEN: token, CF_ACCOUNT_ID: cuenta, CF_ACCESS_GROUP_VECINOS: grupo } = env;
  if (!token || !cuenta || !grupo) {
    return { sincronizado: false, motivo: 'Sincronización con Zero Trust no configurada: agrega el correo al grupo a mano.' };
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${cuenta}/access/groups/${grupo}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const res = await fetch(url, { headers });
    const data = (await res.json()) as { success: boolean; result: Grupo };
    if (!data.success) return { sincronizado: false, motivo: 'No se pudo leer el grupo de Zero Trust.' };

    const g = data.result;
    const sinEmail = g.include.filter((r) => r.email?.email?.toLowerCase() !== email);
    const include = accion === 'agregar' ? [...sinEmail, { email: { email } }] : sinEmail;
    const put = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: g.name, include, exclude: g.exclude ?? [], require: g.require ?? [] }),
    });
    const ok = ((await put.json()) as { success: boolean }).success;
    return ok ? { sincronizado: true } : { sincronizado: false, motivo: 'Zero Trust rechazó el cambio del grupo.' };
  } catch {
    return { sincronizado: false, motivo: 'No hubo conexión con la API de Cloudflare.' };
  }
}
