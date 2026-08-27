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
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1_BINDING_MISSING");
  // D1 supports exec() for a batch of SQL statements.
  await env.DB.exec(schema);
}

function base64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
function bytes(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
export async function sha256(value) {
  return base64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations: 310000 },
    key, 256
  );
  return base64(bits);
}
export function cookie(request, name) {
  const match = request.headers.get("Cookie")?.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  );
  return match ? match[1] : null;
}
export function validAccount(username, password) {
  if (!/^[A-Za-zÀ-ÿ0-9_-]{3,24}$/.test(username))
    return "Le pseudo doit contenir 3 à 24 lettres, chiffres, _ ou -.";
  if (typeof password !== "string" || password.length < 8 || password.length > 128)
    return "Le mot de passe doit contenir entre 8 et 128 caractères.";
  return null;
}
export async function currentUser(request, env) {
  const raw = cookie(request, "blindtest_session");
  if (!raw) return null;
  const row = await env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(await sha256(raw), Date.now()).first();
  return row ? { id: row.id, username: row.username } : null;
}
export async function createSession(user, env) {
  const raw = base64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/[^A-Za-z0-9]/g, "");
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(await sha256(raw), user.id, Date.now() + 2592000000).run();
  return `blindtest_session=${raw}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
}
export async function readJson(request) {
  try { return await request.json(); }
  catch { throw new Error("Données invalides."); }
}
