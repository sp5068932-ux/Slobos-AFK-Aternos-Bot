const express = require('express');
const mineflayer = require('mineflayer');
const fetch = require('node-fetch');

// Guard against process crashes
process.on('uncaughtException', (err) => {
  console.error('[System Error]', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[System Rejection]', reason);
});

// Load config
let settings = {};
try {
  settings = require('./settings.json');
} catch (e) {
  console.log('[Config] settings.json not found, falling back to environment variables.');
}

// Clean and parse inputs
const rawHost = process.env.SERVER_IP || settings.ip || 'bass.aternos.host';
const cleanHost = rawHost.replace(/https?:\/\//, '').split(':')[0].trim();

const CONFIG = {
  host: cleanHost,
  port: parseInt(process.env.SERVER_PORT || settings.port || 60945),
  username: process.env.BOT_NAME || settings.name || 'ManFromfog666',
  version: process.env.SERVER_VERSION || settings.version || false, // Pass explicit version string
  webPort: process.env.PORT || 10000,
  renderUrl: process.env.RENDER_EXTERNAL_URL || null,
};

const app = express();
let bot = null;
let isConnecting = false;
let afkInterval = null;

// Keep-Alive Web Server for Render
app.get('/', (req, res) => {
  res.send(`Status: ${bot && bot.entity ? 'ONLINE' : 'CONNECTING/OFFLINE'} | Target: ${CONFIG.host}:${CONFIG.port} | Version: ${CONFIG.version || 'Auto'}`);
});

app.listen(CONFIG.webPort, () => {
  console.log(`[Web Server] Active on port ${CONFIG.webPort}`);
  scheduleNextSelfPing();
});

function scheduleNextSelfPing() {
  const delayMs = Math.floor(Math.random() * (8 - 4 + 1) + 4) * 60 * 1000;
  setTimeout(async () => {
    if (CONFIG.renderUrl) {
      try {
        await fetch(CONFIG.renderUrl);
        console.log('[Self-Ping] Keep-alive ping sent.');
      } catch (err) {}
    }
    scheduleNextSelfPing();
  }, delayMs);
}

// Bot Connection Engine
function connectBot() {
  if (isConnecting || bot) return;
  isConnecting = true;

  console.log(`[Bot] Connecting to ${CONFIG.host}:${CONFIG.port} as ${CONFIG.username} (Version: ${CONFIG.version || 'Auto-Detect'})...`);

  const botOptions = {
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    auth: 'offline',
    checkTimeoutInterval: 90 * 1000,
    hideErrors: false
  };

  // If a explicit version is specified, attach it to skip latency pinging
  if (CONFIG.version) {
    botOptions.version = CONFIG.version;
  }

  bot = mineflayer.createBot(botOptions);

  bot.once('spawn', () => {
    console.log('[Bot] SUCCESS: Joined the server instantly!');
    isConnecting = false;
    startAntiAFK();
  });

  bot.on('death', () => {
    if (bot) bot.respawn();
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot Kicked]:', typeof reason === 'object' ? JSON.stringify(reason) : reason);
  });

  bot.on('error', (err) => {
    console.error('[Bot Error]:', err.message);
  });

  bot.on('end', (reason) => {
    console.log('[Bot Disconnected]:', reason);
    cleanupAndRetry(20000);
  });
}

function startAntiAFK() {
  if (afkInterval) clearInterval(afkInterval);
  
  afkInterval = setInterval(() => {
    if (!bot || !bot.entity) return;
    try {
      bot.swingArm('mainhand');
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 400);
    } catch (err) {}
  }, 15000);
}

function cleanupAndRetry(delayMs = 20000) {
  if (afkInterval) clearInterval(afkInterval);
  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }
  isConnecting = false;
  console.log(`[System] Retrying connection in ${delayMs / 1000}s...`);
  setTimeout(() => connectBot(), delayMs);
}

connectBot();
