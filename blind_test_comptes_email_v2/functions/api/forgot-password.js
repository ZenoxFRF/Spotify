import { ensureSchema, json, readJson, normalizeEmail, makeCode, sha256, sendCode } from "../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env); const email = normalizeEmail((await readJson(request)).email);
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND email_verified = 1").bind(email).first();
    if (user) { const code = makeCode(); await env.DB.prepare("UPDATE users SET reset_code_hash = ?, reset_expires_at = ? WHERE id = ?").bind(await sha256(code), Date.now() + 900000, user.id).run(); await sendCode(env, email, code, "reset"); }
    return json({ sent: true });
  } catch (e) { return json({ error: e.message === "EMAIL_CONFIGURATION_MISSING" ? "L’envoi d’e-mails n’est pas configuré." : "Impossible d’envoyer le code. Réessaie plus tard." }, 503); }
}
