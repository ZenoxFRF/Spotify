import { ensureSchema, json, readJson, passwordHash, createSession } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env);
    const { username = "", password = "" } = await readJson(request);
    const user = await env.DB.prepare(
      "SELECT id, username, password_hash, password_salt FROM users WHERE username = ?"
    ).bind(String(username).trim()).first();
    if (!user || (await passwordHash(password, user.password_salt)) !== user.password_hash)
      return json({ error: "Pseudo ou mot de passe incorrect." }, 401);
    const publicUser = { id: user.id, username: user.username };
    return json({ user: publicUser }, 200, { "Set-Cookie": await createSession(publicUser, env) });
  } catch (e) {
    if (e.message === "D1_BINDING_MISSING")
      return json({ error: "D1 n'est pas disponible dans ce déploiement. Vérifie le binding DB en Production puis redéploie." }, 500);
    return json({ error: e.message || "Erreur serveur." }, 500);
  }
}
