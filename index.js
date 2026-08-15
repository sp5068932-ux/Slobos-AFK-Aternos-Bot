const express = require('express');
const mineflayer = require('mineflayer');
const fetch = require('node-fetch');

// ======================= CONFIGURATION =======================
const CONFIG = {
  host: process.env.SERVER_IP || 'your-aternos-ip.aternos.me', // Change or set via Environment Variable
  port: parseInt(process.env.SERVER_PORT) || 25565,             // Default Minecraft port
  username: process.env.BOT_NAME || 'Aternos_247_Bot',
  webPort: process.env.PORT || 3000,
  renderUrl: process.env.RENDER_EXTERNAL_URL || null,           // Populated automatically on Render
};
// =============================================================

const app = express();
let bot = null;
let isReconnecting = false;
let autoRestartTimer = null;

// --- 1. RENDER WEB SERVER & RANDOMIZED TIME PINGER ---
app.get('/', (req, res) => {
  res.send(`Bot Status: ONLINE | Server: ${CONFIG.host}:${CONFIG.port}`);
});

app.listen(CONFIG.webPort, () => {
  console.log(`[Web Server] Running on port ${CONFIG.webPort}`);
  scheduleNextSelfPing();
});

// Randomized Ping Timer (Between 4 to 8 minutes) to prevent Render bans & keep service awake
function scheduleNextSelfPing() {
  const minMinutes = 4;
  const maxMinutes = 8;
  const randomDelayMs = Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes) * 60 * 1000;

  setTimeout(async () => {
    if (CONFIG.renderUrl) {
      try {
        await fetch(CONFIG.renderUrl);
        console.log(`[Self-Ping] Successfully pinged ${CONFIG.renderUrl} (Interval: ${(randomDelayMs / 60000).toFixed(1)}m)`);
      } catch (err) {
        console.error('[Self-Ping] Failed to reach Render endpoint:', err.message);
      }
    } else {
      console.log('[Self-Ping] RENDER_EXTERNAL_URL not set yet. Running locally or waiting for URL setup.');
    }
    scheduleNextSelfPing(); // Schedule next cycle with a brand-new random delay
  }, randomDelayMs);
}

// --- 2. BOT CREATION & EVENT MANAGEMENT ---
function createBot() {
  if (isReconnecting) return;
  
  console.log(`[Bot] Connecting to ${CONFIG.host}:${CONFIG.port} as ${CONFIG.username}...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: false, // Auto-detect PaperMC version for 1st-attempt join success
    hideErrors: false
  });

  bot.once('spawn', () => {
    console.log('[Bot] Joined the server successfully!');
    startAntiAFK();
    scheduleSixHourReconnect();
  });

  // Handle death/respawn
  bot.on('death', () => {
    console.log('[Bot] Bot died! Respawning instantly...');
    bot.respawn();
  });

  // Kick / Disconnect handling with automatic retry
  bot.on('kicked', (reason) => {
    console.log('[Bot] Kicked from server:', reason);
    handleReconnect();
  });

  bot.on('error', (err) => {
    console.error('[Bot] Network/Protocol Error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.log('[Bot] Aternos server is offline. Waiting before checking again...');
    }
  });

  bot.on('end', () => {
    console.log('[Bot] Connection closed.');
    handleReconnect();
  });
}

// --- 3. AUTONOMOUS BEHAVIOR (MOVE, MINE, LOOK) ---
function startAntiAFK() {
  let isExecutingAction = false;

  const afkInterval = setInterval(() => {
    if (!bot || !bot.entity || isExecutingAction) return;
    isExecutingAction = true;

    const actionType = Math.floor(Math.random() * 4);

    try {
      switch (actionType) {
        case 0:
          // Random Pitch/Yaw Rotation
          const yaw = (Math.random() * Math.PI * 2) - Math.PI;
          const pitch = (Math.random() * Math.PI / 2) - (Math.PI / 4);
          bot.look(yaw, pitch, true);
          break;

        case 1:
          // Short Movement Step
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
          // Arm Swing Action (Simulate mining/hitting)
          bot.swingArm('mainhand');
          break;

        case 3:
          // Crouch sequence
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
  }, 10000); // Trigger a random interaction every 10 seconds

  bot.once('end', () => clearInterval(afkInterval));
}

// --- 4. 6-HOUR HARD DISCONNECT & RECONNECT ---
function scheduleSixHourReconnect() {
  if (autoRestartTimer) clearTimeout(autoRestartTimer);

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  console.log('[System] 6-Hour lifecycle reset scheduled.');

  autoRestartTimer = setTimeout(() => {
    console.log('[System] 6-Hour threshold reached. Executing clean disconnect/reconnect...');
    if (bot) {
      bot.quit('6-Hour Routine Reset');
    } else {
      handleReconnect();
    }
  }, SIX_HOURS_MS);
}

// Reconnection Guard
function handleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;

  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }

  console.log('[System] Reconnecting in 30 seconds...');
  setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, 30000);
}

// Start application
createBot();
