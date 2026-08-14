const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');
const app = express();

// --- 1. LOAD SETTINGS CONFIG ---
let config = {};
try {
    config = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
} catch (err) {
    console.error("❌ Failed to parse settings.json. Using defaults.");
    config = {
        serverHost: "localhost",
        serverPort: 19132,
        botUsername: "BedrockGuard247"
    };
}

// --- 2. RENDER LIVE WEB ENDPOINT FOR GOOGLE SCRIPT PINGS ---
const PORT = process.env.PORT || 3000;
let botStatus = "Initializing...";
let totalReconnections = 0;
let lastPingTime = "Never";

app.get('/', (req, res) => {
    lastPingTime = new Date().toISOString();
    res.send(`
        <html>
            <body style="font-family:sans-serif; background:#121212; color:#fff; text-align:center; padding-top:50px;">
                <h1>🤖 Pure Bedrock Bot Dashboard</h1>
                <p>Status: <strong style="color:#00e676;">${botStatus}</strong></p>
                <p>Total Script Reconnects: <strong>${totalReconnections}</strong></p>
                <p>Last Google Ping: <code style="color:#ffeb3b;">${lastPingTime}</code></p>
                <p>Target Server: <code>${config.serverHost}:${config.serverPort}</code></p>
                <hr style="width:300px; border-color:#333;">
                <small>Secure traffic gateway active.</small>
            </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`📡 [Web Server] Active on port ${PORT}`);
});

// --- 3. CORE BEDROCK BOT ENGINE ---
let client;
let cycleTimer;
let antiAfkTimer;

function startBedrockInstance() {
    botStatus = "Connecting to Bedrock Host...";
    console.log(`🎮 [Bedrock] Spawning client: "${config.botUsername}"`);

    // Creates an unauthenticated (Cracked) Bedrock client connection
    client = bedrock.createClient({
        host: config.serverHost,
        port: parseInt(config.serverPort),
        username: config.botUsername,
        offline: true // Forces cracked mode to skip Microsoft Xbox verification
    });

    // Successfully connected hook
    client.on('join', () => {
        botStatus = "Online on Bedrock Server";
        console.log(`✅ [Success] ${config.botUsername} joined the Bedrock server.`);
        
        initiateBedrockAntiAFK();
        initiate6HourHardCycle();
    });

    // Handle network drops or server restarts safely
    client.on('close', () => {
        botStatus = "Disconnected";
        console.warn(`⚠️ [Network Alert] Bedrock link dropped.`);
        
        clearInterval(antiAfkTimer);
        clearTimeout(cycleTimer);

        totalReconnections++;
        console.log("🔄 Re-establishing Bedrock socket in 15 seconds...");
        setTimeout(() => {
            startBedrockInstance();
        }, 15000);
    });

    // Catch errors gracefully so Render does not crash your deployment
    client.on('error', (err) => {
        console.error(`❌ [Internal Error Protocol]: ${err.message}`);
    });
}

// --- 4. ANTI-AFK CHAT FLOOD MECHANIC ---
function initiateBedrockAntiAFK() {
    // Sends a safe command network packet every 40 seconds to prevent IDLE kicks
    antiAfkTimer = setInterval(() => {
        if (!client) return;
        try {
            client.queue('text', {
                type: 'chat',
                needs_translation: false,
                source_name: config.botUsername,
                xuid: '',
                platform_chat_id: '',
                message: `/me is checking world latency loops.`
            });
        } catch(e) {
            console.error("Failed executing Bedrock text data packet.");
        }
    }, 40000);
}

// --- 5. MANDATORY 6-HOUR CONNECTION CYCLE (Render Safe) ---
function initiate6HourHardCycle() {
    const CYCLE_TIME = 6 * 60 * 60 * 1000; // 6 Hours
    
    cycleTimer = setTimeout(() => {
        console.log("⏱️ 6-Hour threshold hit. Refreshing Bedrock client connection to wipe logs...");
        if (client) {
            try { 
                client.close(); 
            } catch (e) { 
                startBedrockInstance(); 
            }
        } else {
            startBedrockInstance();
        }
    }, CYCLE_TIME);
}

// --- INITIALIZE BOOT PROCESS ---
startBedrockInstance();
