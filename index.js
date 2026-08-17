const express = require('express');
const mineflayer = require('mineflayer');
const fetch = require('node-fetch');

// Prevent unexpected process crashes on unhandled error events
process.on('uncaughtException', (err) => {
  console.error('[System] Uncaught Exception caught:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[System] Unhandled Rejection:', reason);
});

// ======================= CONFIGURATION =======================
let settings = {};
try {
  settings = require('./settings.json');
} catch (e) {
  console.log('[Config] settings.json missing, using fallback environment values.');
}

// Clean host input to automatically strip any accidental ports or protocol prefixes
const rawHost = process.env.SERVER_IP || settings.ip || 'leaffish.aternos.host';
const cleanHost = rawHost.replace(/https?:\/\//, '').split(':')[0].trim();

const CONFIG = {
  host: cleanHost,
  port: parseInt(process.env.SERVER_PORT || settings.port || 25565),
  username: process.env.BOT_NAME || settings.name || 'ManFromfog666',
  webPort: process.env.PORT || 10000,
  renderUrl: process.env.RENDER_EXTERNAL_URL || null,
};
// =============================================================

const app = express();
let bot = null;
let isConnecting = false;
let autoRestartTimer = null;
let afkInterval = null;

// --- 1. RENDER KEEP-ALIVE WEB SERVER ---
app.get('/', (req, res) => {
  res.send(`Bot Status: ${bot && bot.entity ? 'ONLINE IN-GAME' : 'RECONNECTING / STANDBY'} | Server: ${CONFIG.host}:${CONFIG.port}`);
});

app.listen(CONFIG.webPort, () => {
  console.log(`[Web Server] Running on port ${CONFIG.webPort}`);
  scheduleNextSelfPing();
});

function scheduleNextSelfPing() {
  const minMin = 4;
  const maxMin = 8;
  const randomDelayMs = Math.floor(Math.random() * (maxMin - minMin + 1) + minMin) * 60 * 1000;

  setTimeout(async () => {
    if (CONFIG.renderUrl) {
      try {
        await fetch(CONFIG.renderUrl);
        console.log(`[Self-Ping] Keep-alive ping sent successfully.`);
      } catch (err) {
        console.error('[Self-Ping] Ping error:', err.message);
      }
    }
    scheduleNextSelfPing();
  }, randomDelayMs);
}

// --- 2. DIRECT BOT CONNECTION ENGINE ---
function connectBot() {
  if (isConnecting || bot) return;
  isConnecting = true;

  console.log(`[Bot] Attaching to ${CONFIG.host}:${CONFIG.port} as ${CONFIG.username}...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: false,
    checkTimeoutInterval: 60 * 1000,
    hideErrors: false
  });

  bot.once('spawn', () => {
    console.log('[Bot] SUCCESS: Connected and spawned inside the server!');
    isConnecting = false;
    startAntiAFK();
    scheduleSixHourReconnect();
  });

  bot.on('death', () => {
    console.log('[Bot] Bot died. Triggering instant respawn...');
    if (bot) bot.respawn();
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot] Disconnected/Kicked:', typeof reason === 'object' ? JSON.stringify(reason) : reason);
  });

  bot.on('error', (err) => {
    console.error('[Bot] Protocol Error:', err.message);
  });

  bot.on('end', () => {
    console.log('[Bot] Connection ended.');
    cleanupAndRetry(30000);
  });
}

// --- 3. AUTONOMOUS ANTI-AFK ACTIONS ---
function startAntiAFK() {
  if (afkInterval) clearInterval(afkInterval);

  afkInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    const actionType = Math.floor(Math.random() * 4);

    try {
      switch (actionType) {
        case 0:
          const yaw = (Math.random() * Math.PI * 2) - Math.PI;
          const pitch = (Math.random() * Math.PI / 2) - (Math.PI / 4);
          bot.look(yaw, pitch, true);
          break;

        case 1:
          const directions = ['forward', 'back', 'left', 'right'];
          const dir = directions[Math.floor(Math.random() * directions.length)];
          bot.setControlState(dir, true);
          if (Math.random() > 0.5) bot.setControlState('jump', true);
          
          setTimeout(() => {
            if (bot) {
              bot.setControlState(dir, false);
              bot.setControlState('jump', false);
            }
          }, 1200);
          break;

        case 2:
          bot.swingArm('mainhand');
          break;

        case 3:
          bot.setControlState('sneak', true);
          setTimeout(() => {
            if (bot) bot.setControlState('sneak', false);
          }, 800);
          break;
      }
    } catch (err) {
      console.log('[Anti-AFK] Action execution skipped.');
    }
  }, 10000);
}

// --- 4. 6-HOUR SESSION RESET & CLEAN RECONNECT ---
function scheduleSixHourReconnect() {
  if (autoRestartTimer) clearTimeout(autoRestartTimer);

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  autoRestartTimer = setTimeout(() => {
    console.log('[System] 6 Hours elapsed. Executing session reset...');
    if (bot) {
      bot.end();
    } else {
      cleanupAndRetry(120000);
    }
  }, SIX_HOURS_MS);
}

function cleanupAndRetry(delayMs = 30000) {
  if (afkInterval) clearInterval(afkInterval);
  if (autoRestartTimer) clearTimeout(autoRestartTimer);

  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }

  isConnecting = false;

  console.log(`[System] Reconnection attempt in ${delayMs / 1000} seconds...`);
  setTimeout(() => {
    connectBot();
  }, delayMs);
}

connectBot();
