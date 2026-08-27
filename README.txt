SPOTIFY BLIND TEST - COMPTES D1
================================

Cette version utilise les Pages Functions standard et D1.

IMPORTANT
---------
Le projet doit être déployé avec une intégration Git (GitHub/GitLab) ou Wrangler.
Le Direct Upload de Cloudflare Pages ne prend pas en charge les Functions.

Binding Cloudflare Production :
  Type: D1 database
  Variable name: DB
  Database: blind-test-db

Après déploiement, teste :
  https://spotify.vzmgen.xyz/api/session

Une réponse normale avant connexion est :
  {"user":null}

Les tables users et sessions sont créées automatiquement.

Spotify :
  Client ID déjà configuré dans app.js.
  Redirect URI:
  https://spotify.vzmgen.xyz/
