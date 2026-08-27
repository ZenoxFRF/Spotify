import { ensureSchema, json, currentUser } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    await ensureSchema(env);
    return json({ user: await currentUser(request, env) });
  } catch (e) {
    if (e.message === "D1_BINDING_MISSING")
      return json({ error: "D1 n'est pas disponible dans ce déploiement. Vérifie le binding DB en Production puis redéploie." }, 500);
    return json({ error: e.message || "Erreur serveur." }, 500);
  }
}
