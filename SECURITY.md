# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it, and its impact.

You'll get a reply within a few days. Please give a reasonable amount of time for a fix before disclosing it publicly.

## Scope notes

- The Firebase web config (API key, project id, app id, VAPID and App Check site keys) ends up in the deployed site's JavaScript, so it is public by design, but it is kept out of the repository (`.env.production` is gitignored; `.env.production.example` lists the fields) and the web key is restricted to the app's sites and APIs; access is controlled by `firestore.rules`, `storage.rules`, App Check and API-key restrictions in Google Cloud.
- Gemini API keys (the project's and users' own) are stored only on the server and are never returned to clients.
