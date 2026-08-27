import { ensureSchema, json, readJson, passwordHash, createSession, normalizeEmail } from "../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env); const { email = "", password = "" } = await readJson(request);
    const user = await env.DB.prepare("SELECT id, username, password_hash, password_salt, email_verified FROM users WHERE email = ?").bind(normalizeEmail(email)).first();
    if (!user || !user.email_verified || (await passwordHash(password, user.password_salt)) !== user.password_hash) return json({ error: "E-mail ou mot de passe incorrect, ou e-mail non confirmé." }, 401);
    const publicUser = { id: user.id, username: user.username }; return json({ user: publicUser }, 200, { "Set-Cookie": await createSession(publicUser, env) });
  } catch (e) { return json({ error: e.message || "Erreur serveur." }, 500); }
}
