import { ensureSchema, json, readJson, validAccount, passwordHash, makeSalt, makeCode, normalizeEmail, sha256, sendCode } from "../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env); const { username = "", email = "", password = "" } = await readJson(request);
    const name = String(username).trim(), address = normalizeEmail(email), error = validAccount(name, address, password);
    if (error) return json({ error }, 400);
    const salt = makeSalt(), code = makeCode(); let result;
    try { result = await env.DB.prepare("INSERT INTO users (username, email, email_verified, password_hash, password_salt, verification_code_hash, verification_expires_at, created_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)").bind(name, address, await passwordHash(password, salt), salt, await sha256(code), Date.now() + 900000, Date.now()).run(); }
    catch (e) { if (String(e).toLowerCase().includes("unique")) return json({ error: "Ce pseudo ou cette adresse e-mail est déjà utilisé." }, 409); throw e; }
    try { await sendCode(env, address, code, "verify"); } catch (e) { await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(result.meta.last_row_id).run(); throw e; }
    return json({ pendingVerification: true, email: address }, 201);
  } catch (e) {
    if (e.message === "EMAIL_CONFIGURATION_MISSING") return json({ error: "L’envoi d’e-mails n’est pas encore configuré sur le site." }, 503);
    if (e.message === "EMAIL_DELIVERY_FAILED") return json({ error: "Impossible d’envoyer l’e-mail de confirmation. Réessaie plus tard." }, 503);
    return json({ error: e.message || "Erreur serveur." }, 500);
  }
}
