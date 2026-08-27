const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
});

function audiusTrack(track) {
  if (!track?.id || !track?.title || track.isStreamable === false) return null;
  return {
    id: `audius:${track.id}`,
    title: track.title,
    artist: track.user?.name || "Artiste Audius",
    duration: Number(track.duration) || 0,
    streamUrl: `https://api.audius.co/v1/tracks/${encodeURIComponent(track.id)}/stream`,
    catalog: "Audius",
  };
}
function jamendoTrack(track) {
  if (!track?.id || !track?.name || !track?.audio) return null;
  return {
    id: `jamendo:${track.id}`,
    title: track.name,
    artist: track.artist_name || "Artiste Jamendo",
    duration: Number(track.duration) || 0,
    streamUrl: track.audio,
    catalog: "Jamendo",
  };
}

export async function onRequestGet({ request, env }) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 100) return json({ error: "Entre un nom d’artiste valide." }, 400);

  const audiusUrl = `https://api.audius.co/v1/tracks/search?${new URLSearchParams({ query, limit: "100" })}`;
  const requests = [fetch(audiusUrl).then(async response => response.ok ? (await response.json()).data || [] : [])];
  if (env.JAMENDO_CLIENT_ID) {
    const jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?${new URLSearchParams({ client_id: env.JAMENDO_CLIENT_ID, format: "json", limit: "100", namesearch: query })}`;
    requests.push(fetch(jamendoUrl).then(async response => response.ok ? (await response.json()).results || [] : []));
  }

  try {
    const [audius, jamendo = []] = await Promise.all(requests);
    const tracks = [...audius.map(audiusTrack), ...jamendo.map(jamendoTrack)].filter(Boolean);
    return json({ tracks });
  } catch {
    return json({ error: "Les catalogues publics sont momentanément indisponibles." }, 503);
  }
}
