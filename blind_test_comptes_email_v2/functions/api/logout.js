import { ensureSchema, json, cookie, sha256 } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env);
    const raw = cookie(request, "blindtest_session");
    if (raw) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(raw)).run();
    return json({ ok: true }, 200, {
      "Set-Cookie": "blindtest_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
    });
  } catch (e) {
    if (e.message === "D1_BINDING_MISSING")
      return json({ error: "D1 n'est pas disponible dans ce déploiement. Vérifie le binding DB en Production puis redéploie." }, 500);
    return json({ error: e.message || "Erreur serveur." }, 500);
  }
}
