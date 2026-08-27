// Blind test public : aucun compte Spotify n'est demandé aux joueurs.
const CLIP_MAX_SECONDS = 10;
const $ = (id) => document.getElementById(id);
let tracks = [], currentTrack = null, questionIndex = 0, stopTimer = null;
let currentStartSeconds = 0, currentClipSeconds = 0, excerptRemainingMs = 0, excerptStartedAt = 0, excerptPaused = false;
let feedbackAudio = null, accountUser = null;
const music = new Audio();
music.preload = "metadata";
music.volume = .75;

const message = $("message");
function setMessage(text) { message.textContent = text; }
function setAccountMessage(text) { $("accountMessage").textContent = text; }
async function siteApi(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Le serveur des comptes n’est pas activé. Vérifie la liaison D1 et redéploie le ZIP.");
  return body;
}
function updateAccountUI(user) {
  accountUser = user || null;
  $("userBadge").hidden = !accountUser; $("logoutButton").hidden = !accountUser;
  $("accountButton").textContent = accountUser ? `👤 ${accountUser.username}` : "Mon compte";
  if (accountUser) $("userBadge").textContent = `👤 ${accountUser.username}`;
}
async function checkAccount() { try { updateAccountUI((await siteApi("/api/session")).user); } catch { updateAccountUI(null); } }
async function registerAccount() {
  const username = $("accountUsername").value.trim(), password = $("accountPassword").value;
  if (!/^[A-Za-zÀ-ÿ0-9_-]{3,24}$/.test(username)) return setAccountMessage("Le pseudo doit contenir entre 3 et 24 caractères.");
  if (password.length < 8) return setAccountMessage("Le mot de passe doit contenir au moins 8 caractères.");
  try { const result = await siteApi("/api/register", { method: "POST", body: JSON.stringify({ username, password }) }); updateAccountUI(result.user); $("accountPanel").hidden = true; }
  catch (error) { setAccountMessage(error.message); }
}
async function loginAccount() {
  const username = $("accountUsername").value.trim(), password = $("accountPassword").value;
  if (!username || !password) return setAccountMessage("Entre ton pseudo et ton mot de passe.");
  try { const result = await siteApi("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }); updateAccountUI(result.user); $("accountPanel").hidden = true; }
  catch (error) { setAccountMessage(error.message); }
}
function finishExcerpt() { clearTimeout(stopTimer); stopTimer = null; excerptRemainingMs = 0; excerptPaused = false; music.pause(); }
function startExcerptTimer(durationMs) { clearTimeout(stopTimer); excerptRemainingMs = durationMs; excerptStartedAt = performance.now(); stopTimer = setTimeout(finishExcerpt, durationMs); }
function pauseExcerpt() { if (!stopTimer) return; excerptRemainingMs = Math.max(0, excerptRemainingMs - (performance.now() - excerptStartedAt)); clearTimeout(stopTimer); stopTimer = null; excerptPaused = excerptRemainingMs > 0; music.pause(); }
async function resumeExcerpt() { if (excerptPaused && excerptRemainingMs > 0) { await music.play(); excerptPaused = false; startExcerptTimer(excerptRemainingMs); } else await playExcerpt(true); }
function playFeedbackSound(correct) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  feedbackAudio ||= new AudioContextClass(); const context = feedbackAudio;
  const tone = (frequency, at, duration, type = "sine") => { const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(correct ? .12 : .09, at + .015); gain.gain.exponentialRampToValueAtTime(.0001, at + duration); oscillator.connect(gain).connect(context.destination); oscillator.start(at); oscillator.stop(at + duration + .02); };
  context.resume().then(() => { const now = context.currentTime; if (correct) { tone(740, now, .11); tone(988, now + .11, .17); } else tone(150, now, .25, "sawtooth"); }).catch(() => {});
}
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
function titleKey(track) { return track.title.trim().toLocaleLowerCase("fr"); }
async function loadArtist() {
  finishExcerpt(); const button = $("loadArtistButton"), query = $("artistUrl").value.trim(); button.disabled = true;
  try {
    if (!query) throw new Error("Entre un nom d’artiste.");
    setMessage("Recherche dans les catalogues publics…");
    const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`), body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Impossible de chercher cet artiste.");
    tracks = body.tracks || [];
    if (tracks.length < 4) throw new Error("Pas assez de titres disponibles pour cet artiste dans les catalogues publics.");
    questionIndex = 0; $("artistPanel").hidden = true; $("question").hidden = false; setMessage(""); nextQuestion();
  } catch (error) { setMessage(error.message); } finally { button.disabled = false; }
}
function selectExcerpt(track) { const clipSeconds = Math.min(CLIP_MAX_SECONDS, Math.max(1, Math.floor(track.duration || CLIP_MAX_SECONDS))); return { startSeconds: Math.random() * Math.max(0, (track.duration || clipSeconds) - clipSeconds), clipSeconds }; }
function waitForAudio(event) { return new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error("Le titre met trop de temps à démarrer.")), 12000); music.addEventListener(event, () => { clearTimeout(timeout); resolve(); }, { once: true }); music.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Ce titre ne peut pas être lu.")); }, { once: true }); }); }
async function playExcerpt(reuseCurrentExcerpt = false) {
  if (!currentTrack) return;
  finishExcerpt(); if (!reuseCurrentExcerpt || !currentClipSeconds) ({ startSeconds: currentStartSeconds, clipSeconds: currentClipSeconds } = selectExcerpt(currentTrack));
  if (music.src !== currentTrack.streamUrl) { music.src = currentTrack.streamUrl; music.load(); await waitForAudio("loadedmetadata"); }
  music.currentTime = Math.min(currentStartSeconds, Math.max(0, (music.duration || currentStartSeconds) - .1)); await music.play();
  $("clipInfo").textContent = `Extrait de ${Math.ceil(currentClipSeconds)} seconde(s) maximum`; startExcerptTimer(currentClipSeconds * 1000);
}
function nextQuestion() {
  finishExcerpt(); currentTrack = shuffle(tracks).find(track => new Set(tracks.filter(item => item.id !== track.id && titleKey(item) !== titleKey(track)).map(titleKey)).size >= 3);
  if (!currentTrack) return setMessage("Cet artiste n’a pas quatre titres aux noms différents.");
  questionIndex += 1; $("questionNumber").textContent = `Question ${questionIndex}`; $("result").textContent = ""; $("nextButton").hidden = true;
  const alternatives = new Map(); for (const track of shuffle(tracks)) if (track.id !== currentTrack.id && titleKey(track) !== titleKey(currentTrack) && !alternatives.has(titleKey(track))) alternatives.set(titleKey(track), track);
  const container = $("answers"); container.replaceChildren();
  for (const answer of shuffle([currentTrack, ...[...alternatives.values()].slice(0, 3)])) { const button = document.createElement("button"); button.textContent = answer.title; button.onclick = () => answerQuestion(answer, button, container); container.append(button); }
  playExcerpt().catch(error => setMessage(error.message));
}
function answerQuestion(answer, button, container) { finishExcerpt(); [...container.children].forEach(item => { item.disabled = true; if (item.textContent === currentTrack.title) item.classList.add("correct"); }); if (answer.id === currentTrack.id) { $("result").textContent = "✅ Bonne réponse !"; playFeedbackSound(true); } else { button.classList.add("wrong"); $("result").textContent = `❌ La bonne réponse était : ${currentTrack.title}`; playFeedbackSound(false); } $("nextButton").hidden = false; }
function startGame() { $("welcomeView").hidden = true; $("gameSection").hidden = false; $("connectionStatus").textContent = "Catalogue public prêt. Choisis un artiste."; }
$("startGameButton").addEventListener("click", startGame);
$("accountButton").addEventListener("click", () => { $("accountPanel").hidden = false; setAccountMessage(""); });
$("closeAccountButton").addEventListener("click", () => { $("accountPanel").hidden = true; });
$("registerButton").addEventListener("click", registerAccount); $("accountLoginButton").addEventListener("click", loginAccount);
$("logoutButton").addEventListener("click", async () => { await siteApi("/api/logout", { method: "POST" }).catch(() => {}); updateAccountUI(null); });
$("loadArtistButton").addEventListener("click", loadArtist); $("playButton").addEventListener("click", () => resumeExcerpt().catch(error => setMessage(error.message))); $("stopButton").addEventListener("click", pauseExcerpt); $("replayButton").addEventListener("click", () => playExcerpt(true).catch(error => setMessage(error.message))); $("nextButton").addEventListener("click", nextQuestion);
$("changeArtistButton").addEventListener("click", () => { finishExcerpt(); $("question").hidden = true; $("artistPanel").hidden = false; $("artistUrl").focus(); });
checkAccount();
