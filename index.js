const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const app = express();

// --- LOAD SETTINGS PANEL ---
let config = {};
try {
    config = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
} catch (err) {
    console.error("❌ Failed to parse settings.json. Using default fallback configuration.");
    config = {
        serverHost: "localhost",
        serverPort: 25565,
        botUsername: "AFK_Bot_Fallback",
        mcVersion: "1.20.1",
        reconnectIntervalMs: 20000,
        antiAfkIntervalMs: 30000
    };
}

// --- RENDER LIVE WEB ENDPOINT FOR GOOGLE SCRIPT PINGS ---
const PORT = process.env.PORT || 3000;
let botStatus = "Initializing...";
let totalReconnections = 0;
let lastPingTime = "Never";

app.get('/', (req, res) => {
    lastPingTime = new Date().toISOString();
    res.send(`
        <html>
            <body style="font-family:sans-serif; background:#121212; color:#fff; text-align:center; padding-top:50px;">
                <h1>🤖 AFK Bot Operational Dashboard</h1>
                <p>Status: <strong style="color:#4caf50;">${botStatus}</strong></p>
                <p>Total Script Reconnects: <strong>${totalReconnections}</strong></p>
                <p>Last Traffic Ping: <code style="color:#ffeb3b;">${lastPingTime}</code></p>
                <p>Target Node: <code>${config.serverHost}:${config.serverPort}</code></p>
                <hr style="width:300px; border-color:#333;">
                <small>Secure traffic gateway active.</small>
            </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`📡 [Web Server] Active on network port ${PORT}`);
});

// --- CORE BOT LIFECYCLE MANAGEMENT ---
let bot;
let cycleTimer;
let movementTimer;

function startBotInstance() {
    botStatus = "Connecting to Minecraft...";
    console.log(`🎮 [Mineflayer] Spawning worker client: "${config.botUsername}"`);

    bot = mineflayer.createBot({
        host: config.serverHost,
        port: parseInt(config.serverPort),
        username: config.botUsername,
        version: config.mcVersion === "auto-detect" ? false : config.mcVersion
    });

    // Successfully connected hook
    bot.on('spawn', () => {
        botStatus = "Online & Guarding Server";
        console.log(`✅ [Success] ${config.botUsername} spawned in world space.`);
        
        // Start behavior routines
        initiateAntiAFKLoop();
        initiate6HourHardCycle();
    });

    // Handle kicks, server restarts, or dropouts
    bot.on('end', (reason) => {
        botStatus = `Disconnected (${reason})`;
        console.warn(`⚠️ [Network Alert] Connection dropped. Reason reported: ${reason}`);
        
        clearInterval(movementTimer);
        clearTimeout(cycleTimer);

        totalReconnections++;
        console.log(`🔄 Retrying pipeline connection in ${config.reconnectIntervalMs / 1000} seconds...`);
        setTimeout(() => {
            startBotInstance();
        }, config.reconnectIntervalMs);
    });

    // Log protocol stream anomalies safely without letting Node crash
    bot.on('error', (err) => {
        console.error(`❌ [Internal Error Log]: ${err.message}`);
    });
}

// --- ANTI-DETECTION MOVEMENT MECHANIC ---
function initiateAntiAFKLoop() {
    const movements = ['jump', 'sneak', 'left', 'right', 'forward', 'back'];
    
    movementTimer = setInterval(() => {
        if (!bot || !bot.entity) return;

        // Choose a completely random physical motion
        const action = movements[Math.floor(Math.random() * movements.length)];
        
        try {
            if (action === 'jump') {
                bot.setControlState('jump', true);
                setTimeout(() => { if(bot) bot.setControlState('jump', false); }, 1000);
            } else if (action === 'sneak') {
                bot.setControlState('sneak', true);
                setTimeout(() => { if(bot) bot.setControlState('sneak', false); }, 1500);
            } else {
                bot.setControlState(action, true);
                setTimeout(() => { if(bot) bot.setControlState(action, false); }, 800);
            }
        } catch(e) {
            console.error("Failed executing movement packet adjustment.");
        }
    }, config.antiAfkIntervalMs);
}

// --- MANDATORY 6-HOUR CONNECTION DROP LOOP (Clears Render Timeout) ---
function initiate6HourHardCycle() {
    const CYCLE_TIME = 6 * 60 * 60 * 1000; // Exact 6 Hours
    
    cycleTimer = setTimeout(() => {
        console.log("⏱️ [Scheduled Maintenance] 6-Hour threshold hit. Forcing refresh cycle to wipe cloud host logs...");
        botStatus = "Performing Scheduled Cycle Refresh...";
        if (bot) {
            try {
                bot.quit();
            } catch (e) {
                startBotInstance();
            }
        } else {
            startBotInstance();
        }
    }, CYCLE_TIME);
}

// --- FIRE BOOT LOADER ---
startBotInstance();
