# Aternos 2-Bot Unban Loop (Render Free Web Service)

Two Mineflayer bots that alternate names and **/pardon** each other if one gets banned. Single Node process, human-like movement, logs, tiny HTTP server for Render health.

## Environment variables (Render → Dashboard → your service → Environment)
SERVER_HOST=iballtest.aternos.me
SERVER_PORT=54698
VERSION=1.21.1
BOT1_NAME=HaklaBot1
BOT2_NAME=HaklaBot2
RECONNECT_MS=25000
HUMANIZE=true

> Tip: leave HUMNIZE=true; set RECONNECT_MS between 20000–30000 if needed.

## Render settings
- Service Type: **Web Service** (Free)
- Runtime: Node
- Build Command: `npm ci`
- Start Command: `node index.js`

> The app exposes `/` on the port Render assigns via `$PORT` and returns status text so the health check passes.

## First-time OP setup
1. Start your Aternos server.
2. Let one bot join (e.g., `HaklaBot1`).
3. In your server console or in-game as an admin:
   - `/op HaklaBot1`
   - `/op HaklaBot2`
4. Done. From now on, when one bot gets banned, the other joins and runs `/pardon <partner>` automatically.

## Notes
- Bots perform light, randomized movement and occasional chat to look human.
- Only **one** bot stays online at a time (reduced detection). The partner connects **only** to unban and then stays as the active bot until it gets kicked/banned.
- If both get kicked close together, the script still alternates and retries every `RECONNECT_MS`.
- If you prefer both bots online simultaneously, you can adapt the logic, but single-bot mode is safer.
