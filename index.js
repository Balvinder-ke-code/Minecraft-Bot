/* eslint-disable no-console */
const mineflayer = require('mineflayer');
const express = require('express');

// ---------- Config via environment variables ----------
const SERVER_HOST = process.env.SERVER_HOST || 'iballtest.aternos.me';
const SERVER_PORT = Number(process.env.SERVER_PORT || 25565);
const VERSION     = process.env.VERSION || '1.21.1';

const BOT1_NAME   = process.env.BOT1_NAME || 'HaklaBot1';
const BOT2_NAME   = process.env.BOT2_NAME || 'HaklaBot2';

const RECONNECT_MS = Number(process.env.RECONNECT_MS || 25000); // 20–30s window
const HUMANIZE = (process.env.HUMANIZE || 'true').toLowerCase() !== 'false'; // default true
const LOG_PREFIX = '[Aternos-2Bot]';

// keep only one bot connected at a time; alternate on ban/kick
let activeBot = null;
let activeName = null;
let partnerName = null;
let shuttingDown = false;

// ---------- Tiny web server for Render health checks ----------
const app = express();
app.get('/', (_req, res) => {
  res.type('text/plain').send(`${LOG_PREFIX} OK\nActive: ${activeName || 'none'}\nPartner: ${partnerName || 'none'}\nHost: ${SERVER_HOST}:${SERVER_PORT}\nVersion: ${VERSION}`);
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
  log(`HTTP status server listening on :${port} (required by Render free web services).`);
});

// ---------- Utilities ----------
function log(msg, ...rest) {
  const stamp = new Date().toISOString();
  console.log(`${stamp} ${LOG_PREFIX} ${msg}`, ...rest);
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
function isBanReason(reason) {
  const s = (reason && reason.toString()) || '';
  // Broad match for common Paper/Spigot/Aternos ban/kick messages
  return /(ban|banned|blacklist|You are banned|temporar(il)?y banned|§cBanned)/i.test(s);
}
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// ---------- Anti-AFK / human-like movement ----------
function startHumanize(bot) {
  if (!HUMANIZE) return () => {};

  let cancelled = false;

  // Slow head turning loop
  (async function headLoop() {
    while (!cancelled) {
      const yaw = random(-Math.PI, Math.PI);
      const pitch = random(-0.3, 0.3);
      try { await bot.look(yaw, pitch, false); } catch {}
      await sleep(random(3000, 7000));
    }
  })();

  // Random WASD toggles
  (async function walkLoop() {
    const dirs = ['forward', 'back', 'left', 'right'];
    while (!cancelled) {
      // choose 0–2 random directions to press
      const picks = dirs.filter(() => Math.random() < 0.35);
      picks.forEach(d => bot.setControlState(d, true));
      // occasional sprint
      bot.setControlState('sprint', Math.random() < 0.5);

      // occasional jump bursts
      if (Math.random() < 0.4) {
        bot.setControlState('jump', true);
        await sleep(random(400, 900));
        bot.setControlState('jump', false);
      }

      await sleep(random(2500, 5000));

      // release keys
      dirs.forEach(d => bot.setControlState(d, false));
      bot.setControlState('sprint', false);

      await sleep(random(1500, 3500));
    }
  })();

  // Rare chat to look less botty (keep minimal)
  (async function chatLoop() {
    while (!cancelled) {
      await sleep(random(45000, 90000));
      if (cancelled) break;
      try {
        // if (Math.random() < 0.25) bot.chat('hi'); //Uncomment to make him say hi everytime
      } catch {}
    }
  })();

  // cleaner
  return () => { cancelled = true; };
}

// ---------- Bot lifecycle ----------
function createBot(name) {
  const bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: name,
    version: VERSION,
    // cracked/offline mode by default (no auth)
  });

  let stopHumanize = () => {};
  let partner = (name === BOT1_NAME) ? BOT2_NAME : BOT1_NAME;

  activeBot = bot;
  activeName = name;
  partnerName = partner;

  log(`Starting bot ${name} → ${SERVER_HOST}:${SERVER_PORT} (version ${VERSION})`);

  bot.once('spawn', async () => {
    log(`${name} spawned.`);
    // give it a moment to fully load chunks and be able to chat
    await sleep(2000);

    // Attempt to pardon partner on every spawn (idempotent)
    try {
      bot.chat(`/pardon ${partner}`);
      log(`${name} attempted to /pardon ${partner} (OK if already unbanned).`);
    } catch (e) {
      log(`${name} failed to send /pardon (likely no OP yet):`, e?.message || e);
    }

    stopHumanize = startHumanize(bot);

    // Keep itself online: send minimal keep-alive chat rarely
    setInterval(() => {
      try { bot.chat('/list'); } catch {}
    }, 120000);
  });

  bot.on('messagestr', (msg) => {
    // Useful to see permission errors or pardon results
    log(`${name} <server> ${msg}`);
  });

  bot.on('kicked', async (reason) => {
    log(`${name} was KICKED. Reason: ${reason}`);
  });

  bot.on('end', async (reason) => {
    log(`${name} ended. Reason: ${reason}`);
    stopHumanize();
    activeBot = null;

    if (shuttingDown) return;

    // Determine who should join next
    const nextName = partner;
    const banned = isBanReason(reason);

    // If *this* bot ended (banned or kicked), switch to partner after a delay
    log(`Scheduling ${nextName} to join in ${RECONNECT_MS} ms (banned=${banned}).`);
    await sleep(RECONNECT_MS);

    // Safety: if something else already started a bot in the meantime, don't double-connect
    if (activeBot) {
      log(`Abort connecting ${nextName} — another bot is already active (${activeName}).`);
      return;
    }

    createBot(nextName);
  });

  bot.on('error', (err) => {
    log(`${name} error:`, err?.message || err);
  });

  process.on('SIGTERM', () => {
    shuttingDown = true;
    try { stopHumanize(); } catch {}
    try { bot.quit('SIGTERM'); } catch {}
  });
  process.on('SIGINT', () => {
    shuttingDown = true;
    try { stopHumanize(); } catch {}
    try { bot.quit('SIGINT'); } catch {}
  });

  return bot;
}

// ---------- Boot ----------
async function main() {
  // Start with BOT1 first; if it gets banned/kicked, cycle to BOT2, and so on.
  createBot(BOT1_NAME);
}
main().catch(e => log('Fatal error in main:', e));
