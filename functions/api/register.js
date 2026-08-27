import { ensureSchema, json, readJson, validAccount, passwordHash, createSession } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env);
    const { username = "", password = "" } = await readJson(request);
    const cleanUsername = String(username).trim();
    const error = validAccount(cleanUsername, password);
    if (error) return json({ error }, 400);
    const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    try {
      const result = await env.DB.prepare(
        "INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)"
      ).bind(cleanUsername, await passwordHash(password, salt), salt, Date.now()).run();
      const user = { id: result.meta.last_row_id, username: cleanUsername };
      return json({ user }, 201, { "Set-Cookie": await createSession(user, env) });
    } catch (e) {
      if (String(e).toLowerCase().includes("unique"))
        return json({ error: "Ce pseudo est déjà utilisé." }, 409);
      throw e;
    }
  } catch (e) {
    if (e.message === "D1_BINDING_MISSING")
      return json({ error: "D1 n'est pas disponible dans ce déploiement. Vérifie le binding DB en Production puis redéploie." }, 500);
    return json({ error: e.message || "Erreur serveur." }, 500);
  }
}
