const express = require('express');
const mineflayer = require('mineflayer');
const mc = require('minecraft-protocol');
const fetch = require('node-fetch');

// ======================= CONFIGURATION =======================
let settings = {};
try {
  settings = require('./settings.json');
} catch (e) {
  console.log('[Config] settings.json not found, reading environment variables.');
}

const CONFIG = {
  host: process.env.SERVER_IP || settings.ip || 'your-aternos-ip.aternos.me',
  port: parseInt(process.env.SERVER_PORT || settings.port || 25565),
  username: process.env.BOT_NAME || settings.name || 'Aternos_247_Bot',
  webPort: process.env.PORT || 3000,
  renderUrl: process.env.RENDER_EXTERNAL_URL || null,
};
// =============================================================

const app = express();
let bot = null;
let isConnecting = false;
let autoRestartTimer = null;
let afkInterval = null;
let pingTimeout = null;

// --- 1. RENDER WEB SERVER & RANDOMIZED SELF-PINGER ---
app.get('/', (req, res) => {
  res.send(`Bot Status: ${bot ? 'CONNECTED' : 'WAITING/RESTING'} | Server: ${CONFIG.host}:${CONFIG.port}`);
});

app.listen(CONFIG.webPort, () => {
  console.log(`[Web Server] Running on port ${CONFIG.webPort}`);
  scheduleNextSelfPing();
});

function scheduleNextSelfPing() {
  const minMinutes = 4;
  const maxMinutes = 8;
  const randomDelayMs = Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes) * 60 * 1000;

  setTimeout(async () => {
    if (CONFIG.renderUrl) {
      try {
        await fetch(CONFIG.renderUrl);
        console.log(`[Self-Ping] Render endpoint pinged successfully.`);
      } catch (err) {
        console.error('[Self-Ping] Ping failed:', err.message);
      }
    }
    scheduleNextSelfPing();
  }, randomDelayMs);
}

// --- 2. AUTOMATIC SERVER STATUS CHECK ---
function checkServerAndConnect() {
  if (isConnecting || bot) return;

  console.log(`[Status Check] Ping sending to ${CONFIG.host}:${CONFIG.port}...`);

  mc.ping({ host: CONFIG.host, port: CONFIG.port }, (err) => {
    if (err) {
      console.log(`[Status Check] Server is OFFLINE or loading. Retrying in 30 seconds...`);
      schedulePingRetry();
    } else {
      console.log(`[Status Check] Server is ONLINE! Connecting bot now...`);
      if (pingTimeout) clearTimeout(pingTimeout);
      createBot();
    }
  });
}

function schedulePingRetry() {
  if (pingTimeout) clearTimeout(pingTimeout);
  pingTimeout = setTimeout(() => {
    checkServerAndConnect();
  }, 30000);
}

// --- 3. BOT CREATION & LIFECYCLE ---
function createBot() {
  if (isConnecting || bot) return;
  isConnecting = true;

  console.log(`[Bot] Connecting to ${CONFIG.host}:${CONFIG.port} as ${CONFIG.username}...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: false,
    hideErrors: false
  });

  bot.once('spawn', () => {
    console.log('[Bot] Joined server successfully!');
    isConnecting = false;
    startAntiAFK();
    scheduleSixHourReconnect();
  });

  bot.on('death', () => {
    console.log('[Bot] Died! Respawning...');
    if (bot) bot.respawn();
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot] Kicked from server:', typeof reason === 'object' ? JSON.stringify(reason) : reason);
  });

  bot.on('error', (err) => {
    console.error('[Bot] Connection Error:', err.message);
  });

  bot.on('end', () => {
    console.log('[Bot] Connection closed.');
    cleanupAndReconnect(120000); // 2-Minute Rest Cooldown
  });
}

// --- 4. AUTONOMOUS ANTI-AFK ACTIONS ---
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
      console.log('[Anti-AFK] Action skipped.');
    }
  }, 10000);
}

// --- 5. 6-HOUR SESSION RESET & COOLDOWN ---
function scheduleSixHourReconnect() {
  if (autoRestartTimer) clearTimeout(autoRestartTimer);

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  console.log('[System] 6-Hour session timer started.');

  autoRestartTimer = setTimeout(() => {
    console.log('[System] 6 Hours reached. Initiating 2-minute cooldown rest...');
    if (bot) {
      bot.end(); // Gracefully close socket
    } else {
      cleanupAndReconnect(120000);
    }
  }, SIX_HOURS_MS);
}

function cleanupAndReconnect(cooldownMs = 120000) {
  if (afkInterval) clearInterval(afkInterval);
  if (autoRestartTimer) clearTimeout(autoRestartTimer);

  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }

  isConnecting = false;

  console.log(`[System] Resting for ${(cooldownMs / 1000)} seconds before checking server state...`);
  setTimeout(() => {
    checkServerAndConnect();
  }, cooldownMs);
}

// Start execution
checkServerAndConnect();
