const express = require('express');
const mineflayer = require('mineflayer');
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
let isReconnecting = false;
let autoRestartTimer = null;
let pingInterval = null;

// --- 1. RENDER WEB SERVER & RANDOMIZED SELF-PINGER ---
app.get('/', (req, res) => {
  res.send(`Bot Status: ${bot ? 'CONNECTED' : 'WAITING FOR SERVER'} | Server: ${CONFIG.host}:${CONFIG.port}`);
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

// --- 2. AUTOMATIC SERVER STATUS CHECKER (PING) ---
function checkServerAndConnect() {
  if (isReconnecting || bot) return;

  console.log(`[Status Check] Ping sending to ${CONFIG.host}:${CONFIG.port}...`);

  mineflayer.ping(
    {
      host: CONFIG.host,
      port: CONFIG.port,
      timeout: 5000
    },
    (err, response) => {
      if (err) {
        console.log(`[Status Check] Server is OFFLINE or loading. Retrying in 30 seconds...`);
        schedulePingRetry();
      } else {
        console.log(`[Status Check] Server is ONLINE! (${response.players.online}/${response.players.max} players). Connecting bot...`);
        if (pingInterval) clearInterval(pingInterval);
        createBot();
      }
    }
  );
}

function schedulePingRetry() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    checkServerAndConnect();
  }, 30000); // Check every 30 seconds
}

// --- 3. BOT CREATION & LIFECYCLE ---
function createBot() {
  if (isReconnecting) return;
  isReconnecting = true;

  console.log(`[Bot] Initiating join sequence as ${CONFIG.username}...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: false, // Auto-version handshake
    hideErrors: false
  });

  bot.once('spawn', () => {
    console.log('[Bot] Joined server successfully!');
    isReconnecting = false;
    startAntiAFK();
    scheduleSixHourReconnect();
  });

  bot.on('death', () => {
    console.log('[Bot] Died! Respawning...');
    bot.respawn();
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot] Kicked from server:', reason);
    handleDisconnect();
  });

  bot.on('error', (err) => {
    console.error('[Bot] Connection Error:', err.message);
  });

  bot.on('end', () => {
    console.log('[Bot] Disconnected from server.');
    handleDisconnect();
  });
}

// --- 4. AUTONOMOUS ANTI-AFK ACTIONS ---
function startAntiAFK() {
  let isExecutingAction = false;

  const afkInterval = setInterval(() => {
    if (!bot || !bot.entity || isExecutingAction) return;
    isExecutingAction = true;

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
      console.log('[Anti-AFK] Action skipped:', err.message);
    } finally {
      isExecutingAction = false;
    }
  }, 10000);

  bot.once('end', () => clearInterval(afkInterval));
}

// --- 5. RECONNECT & LIFECYCLE MANAGEMENT ---
function scheduleSixHourReconnect() {
  if (autoRestartTimer) clearTimeout(autoRestartTimer);

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  console.log('[System] 6-Hour lifecycle reset timer set.');

  autoRestartTimer = setTimeout(() => {
    console.log('[System] 6-Hour mark reached. Executing clean reconnection...');
    if (bot) {
      bot.quit('6-Hour Routine Reset');
    } else {
      handleDisconnect();
    }
  }, SIX_HOURS_MS);
}

function handleDisconnect() {
  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }
  
  isReconnecting = false;
  console.log('[System] Resuming server ping checks...');
  checkServerAndConnect();
}

// Start the check cycle
checkServerAndConnect();
