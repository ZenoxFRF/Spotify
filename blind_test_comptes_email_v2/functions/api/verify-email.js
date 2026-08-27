import { ensureSchema, json, readJson, normalizeEmail, sha256, createSession } from "../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env); const { email = "", code = "" } = await readJson(request);
    const user = await env.DB.prepare("SELECT id, username FROM users WHERE email = ? AND email_verified = 0 AND verification_code_hash = ? AND verification_expires_at > ?").bind(normalizeEmail(email), await sha256(String(code).trim()), Date.now()).first();
    if (!user) return json({ error: "Code invalide ou expiré." }, 400);
    await env.DB.prepare("UPDATE users SET email_verified = 1, verification_code_hash = NULL, verification_expires_at = NULL WHERE id = ?").bind(user.id).run();
    return json({ user: { id: user.id, username: user.username } }, 200, { "Set-Cookie": await createSession(user, env) });
  } catch (e) { return json({ error: e.message || "Erreur serveur." }, 500); }
}
