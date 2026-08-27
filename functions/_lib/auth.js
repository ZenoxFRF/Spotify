const encoder = new TextEncoder();
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
`;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
export async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1_BINDING_MISSING");
  await env.DB.exec(schema);
  const columns = (await env.DB.prepare("PRAGMA table_info(users)").all()).results.map(row => row.name);
  const additions = [
    ["email", "ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE"],
    ["email_verified", "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0"],
    ["verification_code_hash", "ALTER TABLE users ADD COLUMN verification_code_hash TEXT"],
    ["verification_expires_at", "ALTER TABLE users ADD COLUMN verification_expires_at INTEGER"],
    ["reset_code_hash", "ALTER TABLE users ADD COLUMN reset_code_hash TEXT"],
    ["reset_expires_at", "ALTER TABLE users ADD COLUMN reset_expires_at INTEGER"],
  ];
  for (const [name, statement] of additions) if (!columns.includes(name)) await env.DB.prepare(statement).run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email)").run();
}
function base64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function bytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export async function sha256(value) { return base64(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations: 100000 }, key, 256);
  return base64(bits);
}
export function makeSalt() { return base64(crypto.getRandomValues(new Uint8Array(16))); }
export function makeCode() { return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0"); }
export function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
export function validAccount(username, email, password) {
  if (!/^[A-Za-zÀ-ÿ0-9_-]{3,24}$/.test(username)) return "Le pseudo doit contenir 3 à 24 lettres, chiffres, _ ou -.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "Entre une adresse e-mail valide.";
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return "Le mot de passe doit contenir entre 8 et 128 caractères.";
  return null;
}
export async function sendCode(env, to, code, kind) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("EMAIL_CONFIGURATION_MISSING");
  const subject = kind === "reset" ? "Réinitialisation de ton mot de passe" : "Confirme ton adresse e-mail";
  const text = kind === "reset"
    ? `Ton code de réinitialisation Blind Test est : ${code}. Il expire dans 15 minutes. Si tu n'as pas demandé ce code, ignore cet e-mail.`
    : `Ton code de confirmation Blind Test est : ${code}. Il expire dans 15 minutes.`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }) });
  if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
}
export function cookie(request, name) { const match = request.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return match ? match[1] : null; }
export async function currentUser(request, env) {
  const raw = cookie(request, "blindtest_session"); if (!raw) return null;
  const row = await env.DB.prepare("SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.email_verified = 1").bind(await sha256(raw), Date.now()).first();
  return row ? { id: row.id, username: row.username } : null;
}
export async function createSession(user, env) {
  const raw = base64(crypto.getRandomValues(new Uint8Array(32))).replace(/[^A-Za-z0-9]/g, "");
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(raw), user.id, Date.now() + 2592000000).run();
  return `blindtest_session=${raw}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
}
export async function readJson(request) { try { return await request.json(); } catch { throw new Error("Données invalides."); } }
