import { ensureSchema, json, readJson, normalizeEmail, sha256, makeSalt, passwordHash } from "../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env); const { email = "", code = "", password = "" } = await readJson(request);
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return json({ error: "Le mot de passe doit contenir entre 8 et 128 caractères." }, 400);
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND email_verified = 1 AND reset_code_hash = ? AND reset_expires_at > ?").bind(normalizeEmail(email), await sha256(String(code).trim()), Date.now()).first();
    if (!user) return json({ error: "Code invalide ou expiré." }, 400);
    const salt = makeSalt(); await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, reset_code_hash = NULL, reset_expires_at = NULL WHERE id = ?").bind(await passwordHash(password, salt), salt, user.id).run();
    return json({ reset: true });
  } catch (e) { return json({ error: e.message || "Erreur serveur." }, 500); }
}
