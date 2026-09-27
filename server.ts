import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";

interface LeaderboardData {
  bestKills: Record<string, number>;
  totalKills: Record<string, number>;
}

const LEADERBOARD_FILE = path.join(process.cwd(), "data", "leaderboard.json");

const FAKE_PLACEHOLDER_PLAYERS = new Set([
  "apexpredator",
  "krakenking",
  "abyssalghost",
  "viperfish",
  "tsunamirider",
  "shadowfin",
  "coralsniper",
  "deepblue",
  "testplayer"
]);

function filterFakePlayers(data: LeaderboardData): LeaderboardData {
  const cleanBest: Record<string, number> = {};
  const cleanTotal: Record<string, number> = {};

  for (const [name, score] of Object.entries(data.bestKills || {})) {
    if (!FAKE_PLACEHOLDER_PLAYERS.has(name.toLowerCase().trim())) {
      cleanBest[name] = score;
    }
  }

  for (const [name, score] of Object.entries(data.totalKills || {})) {
    if (!FAKE_PLACEHOLDER_PLAYERS.has(name.toLowerCase().trim())) {
      cleanTotal[name] = score;
    }
  }

  return { bestKills: cleanBest, totalKills: cleanTotal };
}

function loadLeaderboard(): LeaderboardData {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const cleaned = filterFakePlayers({
          bestKills: parsed.bestKills || {},
          totalKills: parsed.totalKills || {}
        });
        saveLeaderboard(cleaned);
        return cleaned;
      }
    }
  } catch (err) {
    console.error("[Server] Error loading leaderboard file:", err);
  }
  return {
    bestKills: {},
    totalKills: {}
  };
}

function saveLeaderboard(data: LeaderboardData) {
  try {
    const dir = path.dirname(LEADERBOARD_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Server] Error saving leaderboard file:", err);
  }
}

function formatLeaderboard(data: LeaderboardData) {
  const bestKills = Object.entries(data.bestKills || {})
    .map(([username, score]) => ({ username, score: Number(score) || 0 }))
    .sort((a, b) => b.score - a.score);

  const totalKills = Object.entries(data.totalKills || {})
    .map(([username, score]) => ({ username, score: Number(score) || 0 }))
    .sort((a, b) => b.score - a.score);

  return { bestKills, totalKills };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const httpServer = http.createServer(app);

  app.use(express.json());

  // CORS middleware for external deployments (e.g. Vercel / seastriker.io)
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  interface Peer {
    id: string;
    username: string;
    kills: number;
    gameMode?: "global" | "ai";
    creatureType?: string;
  }

  let leaderboard = loadLeaderboard();
  let roomState = { globalLeaderboard: leaderboard };
  let presences: Record<string, any> = {};
  let peers: Record<string, Peer> = {};

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  function updateLeaderboardKills(username: string, kills: number) {
    const clean = username.trim().substring(0, 24);
    if (!clean) return;
    const prevBest = leaderboard.bestKills[clean] || 0;
    leaderboard.bestKills[clean] = Math.max(prevBest, kills);
    leaderboard.totalKills[clean] = (leaderboard.totalKills[clean] || 0) + 1;
    saveLeaderboard(leaderboard);
    roomState.globalLeaderboard = leaderboard;
    const formatted = formatLeaderboard(leaderboard);
    io.emit("leaderboardUpdate", formatted);
    io.emit("roomStateUpdate", roomState);
  }

  // --- Authoritative Shared Ocean Bots ---
  interface ServerBot {
    id: string;
    name: string;
    type: string;
    skinId: string;
    color: string;
    x: number;
    y: number;
    angle: number;
    targetAngle: number;
    speed: number;
    baseSpeed: number;
    dashSpeed: number;
    isDashing: boolean;
    dashTimer: number;
    dashCooldown: number;
    health: number;
    maxHealth: number;
    kills: number;
    isAlive: boolean;
    respawnTime: number;
    turnTimer: number;
    segments: Array<{ x: number; y: number; angle: number; scale: number; round: boolean }>;
  }

  function createBotSegments(type: string, startX: number, startY: number, angle: number) {
    const segments = [];
    const count = 15;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      let scale = 1.0;
      if (type === "narwhal") {
        scale = t <= 0.28 ? 1.75 + (2.38 - 1.75) * (t / 0.28) : 2.38 - (2.38 - 0.5) * Math.pow((t - 0.28) / 0.72, 0.88);
        scale *= 0.9;
      } else if (type === "shark") {
        scale = 1.8 * (1 - t * 0.75);
      } else if (type === "dolphin") {
        scale = 1.7 * (1 - t * 0.7);
      } else if (type === "squid") {
        scale = 1.6 * (1 - t * 0.6);
      } else {
        scale = 1.4 * (1 - t * 0.7);
      }
      segments.push({
        x: startX - i * 14 * Math.cos(angle),
        y: startY - i * 14 * Math.sin(angle),
        angle,
        scale,
        round: i === 0
      });
    }
    return segments;
  }

  const initialBotConfigs = [
    { id: "ai-0", name: "AquaGlider", type: "narwhal", skinId: "default", color: "#38bdf8", x: 700, y: 700, angle: 0.5, baseSpeed: 15, dashSpeed: 28, maxHealth: 100 },
    { id: "ai-1", name: "ApexShark", type: "shark", skinId: "default", color: "#64748b", x: 1800, y: 800, angle: 2.2, baseSpeed: 17, dashSpeed: 30, maxHealth: 110 },
    { id: "ai-2", name: "WaveRider", type: "dolphin", skinId: "default", color: "#0284c7", x: 900, y: 1700, angle: -1.2, baseSpeed: 18, dashSpeed: 31, maxHealth: 95 },
    { id: "ai-3", name: "AbyssSquid", type: "squid", skinId: "default", color: "#ec4899", x: 1900, y: 1900, angle: 3.0, baseSpeed: 14, dashSpeed: 27, maxHealth: 90 },
    { id: "ai-4", name: "PhantomFin", type: "knifefish", skinId: "default", color: "#a855f7", x: 1300, y: 1200, angle: 1.0, baseSpeed: 16, dashSpeed: 29, maxHealth: 90 },
    { id: "ai-5", name: "HammerheadBot", type: "shark", skinId: "hammerhead", color: "#475569", x: 1600, y: 1500, angle: -2.5, baseSpeed: 16.5, dashSpeed: 29.5, maxHealth: 120 }
  ];

  const serverBots: ServerBot[] = initialBotConfigs.map(cfg => ({
    ...cfg,
    targetAngle: cfg.angle,
    speed: cfg.baseSpeed,
    isDashing: false,
    dashTimer: 0,
    dashCooldown: Math.floor(Math.random() * 30),
    health: cfg.maxHealth,
    kills: 0,
    isAlive: true,
    respawnTime: 0,
    turnTimer: Math.random() * 2000,
    segments: createBotSegments(cfg.type, cfg.x, cfg.y, cfg.angle)
  }));

  function formatBots(bots: ServerBot[]) {
    const formatted: Record<string, any> = {};
    for (const b of bots) {
      if (!b.isAlive) continue;
      formatted[b.id] = {
        id: b.id,
        name: b.name,
        type: b.type,
        skinId: b.skinId,
        color: b.color,
        x: b.x,
        y: b.y,
        angle: b.angle,
        segments: b.segments,
        health: b.health,
        maxHealth: b.maxHealth,
        kills: b.kills,
        isAlive: b.isAlive,
        isDashing: b.isDashing,
        staminaReady: b.dashCooldown <= 0,
        stamina: b.dashCooldown > 0 ? 0.3 : 1.0
      };
    }
    return formatted;
  }

  // Authoritative 20Hz (every 50ms) Server Simulation Loop
  setInterval(() => {
    const now = Date.now();

    for (const bot of serverBots) {
      if (!bot.isAlive) {
        if (bot.respawnTime > 0 && now >= bot.respawnTime) {
          bot.isAlive = true;
          bot.health = bot.maxHealth;
          bot.x = 400 + Math.random() * 1700;
          bot.y = 400 + Math.random() * 1700;
          bot.angle = Math.random() * Math.PI * 2;
          bot.targetAngle = bot.angle;
          bot.isDashing = false;
          bot.dashTimer = 0;
          bot.dashCooldown = 20;
          bot.segments = createBotSegments(bot.type, bot.x, bot.y, bot.angle);
        }
        continue;
      }

      // Find nearest alive human player or rival bot to hunt
      let nearestDist = 950;
      let targetX = -1;
      let targetY = -1;

      // 1. Prioritize nearby human players who are in 'ai' game mode (bots never hunt real global players)
      for (const sid in presences) {
        if (peers[sid]?.gameMode !== "ai") continue;
        const p = presences[sid];
        if (p && p.isAlive && p.x !== undefined && p.y !== undefined) {
          const d = Math.hypot(p.x - bot.x, p.y - bot.y);
          if (d < nearestDist) {
            nearestDist = d;
            targetX = p.x;
            targetY = p.y;
          }
        }
      }

      // 2. If no human player within range, hunt the nearest other bot
      if (targetX === -1) {
        let nearestBotDist = 750;
        for (const otherBot of serverBots) {
          if (otherBot.id !== bot.id && otherBot.isAlive) {
            const d = Math.hypot(otherBot.x - bot.x, otherBot.y - bot.y);
            if (d < nearestBotDist) {
              nearestBotDist = d;
              targetX = otherBot.x;
              targetY = otherBot.y;
              nearestDist = d;
            }
          }
        }
      }

      // Steering & Behavior
      bot.turnTimer += 50;
      if (targetX !== -1 && targetY !== -1) {
        // Steer towards target
        bot.targetAngle = Math.atan2(targetY - bot.y, targetX - bot.x);

        // Aggressive Dash: When close and lined up, launch dash attack
        let angleDiff = bot.targetAngle - bot.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        if (nearestDist < 380 && bot.dashCooldown <= 0 && Math.abs(angleDiff) < 0.65) {
          bot.isDashing = true;
          bot.dashTimer = 7; // ~350ms sprint burst
          bot.dashCooldown = 45 + Math.floor(Math.random() * 25); // 2.5 - 3.5s cooldown
        }
      } else if (bot.turnTimer > 1500) {
        bot.turnTimer = 0;
        bot.targetAngle += (Math.random() - 0.5) * 1.4;
      }

      // Update Dash State
      if (bot.dashTimer > 0) {
        bot.dashTimer--;
        bot.isDashing = true;
        bot.speed = bot.dashSpeed;
      } else {
        bot.isDashing = false;
        bot.speed = bot.baseSpeed;
      }
      if (bot.dashCooldown > 0) {
        bot.dashCooldown--;
      }

      // Turn smoothly and responsively
      let angleDiff = bot.targetAngle - bot.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      const turnSpeed = bot.isDashing ? 0.12 : 0.22;
      bot.angle += Math.max(-turnSpeed, Math.min(turnSpeed, angleDiff));

      // Arena Wall Boundary Avoidance (smooth cushion towards center)
      const margin = 280;
      if (bot.x < margin || bot.x > 2500 - margin || bot.y < margin || bot.y > 2500 - margin) {
        const toCenterX = 1250 - bot.x;
        const toCenterY = 1250 - bot.y;
        bot.targetAngle = Math.atan2(toCenterY, toCenterX);
      }

      // Move Head
      bot.x += Math.cos(bot.angle) * bot.speed;
      bot.y += Math.sin(bot.angle) * bot.speed;
      bot.x = Math.max(90, Math.min(2410, bot.x));
      bot.y = Math.max(90, Math.min(2410, bot.y));

      bot.segments[0].x = bot.x;
      bot.segments[0].y = bot.y;
      bot.segments[0].angle = bot.angle;

      // Kinematics for trailing segments
      const spacing = 13.5;
      for (let i = 1; i < bot.segments.length; i++) {
        const prev = bot.segments[i - 1];
        const cur = bot.segments[i];
        const dx = prev.x - cur.x;
        const dy = prev.y - cur.y;
        const ang = Math.atan2(dy, dx);
        cur.x = prev.x - Math.cos(ang) * spacing;
        cur.y = prev.y - Math.sin(ang) * spacing;
        cur.angle = ang;
      }

      // Check combat: If dashing bot hits a player in AI mode, deal damage
      if (bot.isDashing && bot.dashTimer >= 2) {
        for (const [sid, sock] of io.of("/").sockets) {
          if (peers[sid]?.gameMode !== "ai") continue; // Bots only attack in AI mode
          const p = presences[sid];
          if (p && p.isAlive && p.x !== undefined && p.y !== undefined) {
            const headDist = Math.hypot(p.x - bot.x, p.y - bot.y);
            if (headDist < 58) {
              sock.emit("takeDamage", {
                damage: 20,
                attackerId: bot.id,
                attackerName: bot.name,
                knockbackAngle: bot.angle,
                knockbackForce: 7
              });
              bot.dashTimer = 0; // consume dash attack on hit
            }
          }
        }
      }
    }

    // Broadcast synchronized network snapshot separated by mode, plus live preview data
    const formattedBots = formatBots(serverBots);

    const globalPlayers: Record<string, any> = {};
    const aiPlayers: Record<string, any> = {};

    for (const sid in presences) {
      const p = presences[sid];
      if (!p) continue;
      const entityId = p.id || sid;
      if (peers[sid]?.gameMode === "ai") {
        aiPlayers[entityId] = p;
      } else {
        globalPlayers[entityId] = p;
      }
    }

    for (const [sid, sock] of io.of("/").sockets) {
      const myMode = peers[sid]?.gameMode || "global";
      const myId = peers[sid]?.id;

      const otherPlayers: Record<string, any> = {};
      const source = myMode === "ai" ? aiPlayers : globalPlayers;
      for (const id in source) {
        if (id !== sid && id !== myId) {
          otherPlayers[id] = source[id];
        }
      }

      // Filter peers by current mode
      const modePeers: Record<string, any> = {};
      for (const psid in peers) {
        if ((peers[psid]?.gameMode || "global") === myMode) {
          modePeers[psid] = peers[psid];
        }
      }

      sock.emit("networkTick", {
        mode: myMode,
        players: otherPlayers,
        bots: myMode === "ai" ? formattedBots : {},
        peers: modePeers,
        preview: {
          globalPlayers,
          aiBots: formattedBots
        }
      });
    }
  }, 50);

  // REST API Endpoints for global leaderboard
  app.get("/api/leaderboard", (req, res) => {
    res.json(formatLeaderboard(leaderboard));
  });

  app.post("/api/leaderboard", (req, res) => {
    const { username, bestKills, totalKills } = req.body;
    if (!username || typeof username !== "string") {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    const cleanUsername = username.trim().substring(0, 24);
    const bk = Math.max(0, parseInt(bestKills, 10) || 0);
    const tk = Math.max(0, parseInt(totalKills, 10) || 0);

    const prevBest = leaderboard.bestKills[cleanUsername] || 0;
    leaderboard.bestKills[cleanUsername] = Math.max(prevBest, bk);

    const prevTotal = leaderboard.totalKills[cleanUsername] || 0;
    leaderboard.totalKills[cleanUsername] = Math.max(prevTotal, tk);

    saveLeaderboard(leaderboard);
    roomState.globalLeaderboard = leaderboard;

    const formatted = formatLeaderboard(leaderboard);
    io.emit("leaderboardUpdate", formatted);
    io.emit("roomStateUpdate", roomState);

    res.json({ success: true, leaderboard: formatted });
  });

  // Check username uniqueness
  app.post("/api/check-username", (req, res) => {
    const { username, socketId } = req.body;
    const clean = String(username || "").trim().substring(0, 16);
    if (!clean || clean.length < 2) {
      res.json({ available: false, message: "Username must be at least 2 characters." });
      return;
    }

    const taken = Object.values(peers).some(
      (p) => p.id !== socketId && p.username.toLowerCase() === clean.toLowerCase()
    );

    if (taken) {
      let suggestion = clean + "_" + Math.floor(10 + Math.random() * 90);
      while (Object.values(peers).some(p => p.username.toLowerCase() === suggestion.toLowerCase())) {
        suggestion = clean + "_" + Math.floor(100 + Math.random() * 900);
      }
      res.json({
        available: false,
        message: `Username "${clean}" is already active in this ocean!`,
        suggestion
      });
      return;
    }

    res.json({ available: true, username: clean });
  });

  app.get("/api/status", (req, res) => {
    const globalCount = Object.values(peers).filter(p => p && p.id && !p.id.startsWith("ai-") && (p.gameMode || "global") === "global").length;
    const aiCount = Object.values(peers).filter(p => p && p.id && !p.id.startsWith("ai-") && p.gameMode === "ai").length;
    res.json({
      online: true,
      playersCount: Math.max(1, globalCount),
      globalPlayersCount: Math.max(1, globalCount),
      aiPlayersCount: aiCount,
      serverBotsCount: serverBots.length
    });
  });

  function findTargetSocketId(targetId: string): string | null {
    if (!targetId) return null;
    if (peers[targetId]) return targetId;
    for (const sid in peers) {
      if (peers[sid].id === targetId || presences[sid]?.id === targetId) {
        return sid;
      }
    }
    return null;
  }

  io.on("connection", (socket) => {
    const clientUsername =
      (socket.handshake.auth && socket.handshake.auth.username) ||
      "Player_" + Math.floor(100 + Math.random() * 900);
    const peerClientId = (socket.handshake.auth && socket.handshake.auth.clientId) || socket.id;
    const initialMode = (socket.handshake.auth && socket.handshake.auth.gameMode) === "ai" ? "ai" : "global";

    peers[socket.id] = { id: peerClientId, username: clientUsername, kills: 0, gameMode: initialMode };

    // Send init packet immediately
    socket.emit("init", {
      id: peerClientId,
      roomState,
      peers,
      mode: initialMode,
      bots: initialMode === "ai" ? formatBots(serverBots) : {},
      preview: {
        globalPlayers: Object.fromEntries(Object.entries(presences).filter(([sid]) => peers[sid]?.gameMode !== "ai")),
        aiBots: formatBots(serverBots)
      }
    });

    // Notify peers of new player
    io.emit("peerJoined", peers[socket.id]);
    const initialOtherPresences: Record<string, any> = {};
    for (const otherSid in presences) {
      if (otherSid !== socket.id && presences[otherSid]?.id !== peerClientId) {
        if ((peers[otherSid]?.gameMode || "global") === initialMode) {
          initialOtherPresences[otherSid] = presences[otherSid];
        }
      }
    }
    socket.emit("presence", initialOtherPresences);

    // Switch game mode between Global Multiplayer and Play with AI
    socket.on("setGameMode", (data) => {
      const mode: "global" | "ai" = data?.mode === "ai" ? "ai" : "global";
      if (peers[socket.id]) {
        peers[socket.id].gameMode = mode;
      }

      // Send the presences appropriate for this mode
      const modePresences: Record<string, any> = {};
      for (const otherSid in presences) {
        if (otherSid !== socket.id && presences[otherSid]?.id !== peerClientId) {
          if ((peers[otherSid]?.gameMode || "global") === mode) {
            modePresences[otherSid] = presences[otherSid];
          }
        }
      }
      socket.emit("presence", modePresences);
    });

    // Real-time presence updates (movement, angle, segments, etc.)
    socket.on("updatePresence", (data) => {
      if (!data) return;
      data.id = peerClientId;
      data.name = peers[socket.id]?.username || data.name || "Player";
      presences[socket.id] = { ...(presences[socket.id] || {}), ...data };
      if (data.kills !== undefined && peers[socket.id]) {
        peers[socket.id].kills = Math.max(peers[socket.id].kills || 0, data.kills);
      }
    });

    function broadcastModeEvent(mode: "global" | "ai", eventName: string, payload: any) {
      for (const [sid, sock] of io.of("/").sockets) {
        if ((peers[sid]?.gameMode || "global") === mode) {
          sock.emit(eventName, payload);
        }
      }
    }

    // Player attacks another human player
    socket.on("attackPlayer", (data) => {
      if (!data || !data.targetId || data.targetId === socket.id || data.targetId === peerClientId) return;
      const targetSocketId = findTargetSocketId(data.targetId);
      if (!targetSocketId) return;

      const myMode = peers[socket.id]?.gameMode || "global";
      if ((peers[targetSocketId]?.gameMode || "global") !== myMode) return;

      io.to(targetSocketId).emit("takeDamage", {
        attackerId: peerClientId,
        attackerName: peers[socket.id]?.username || "Player",
        damage: data.damage || 25,
        hitType: data.hitType || "bodyHit",
        knockbackAngle: data.angle !== undefined ? data.angle : 0,
        knockbackForce: data.knockbackForce || 6
      });
    });

    // Player attacks a server bot
    socket.on("attackBot", (data) => {
      if (!data || !data.botId) return;
      const bot = serverBots.find((b) => b.id === data.botId);
      if (!bot || !bot.isAlive) return;

      const damage = data.damage || 25;
      bot.health -= damage;

      if (bot.health <= 0) {
        bot.health = 0;
        bot.isAlive = false;
        bot.respawnTime = Date.now() + 5000;

        if (peers[socket.id]) {
          peers[socket.id].kills = (peers[socket.id].kills || 0) + 1;
          const currentKills = peers[socket.id].kills;
          if (presences[socket.id]) {
            presences[socket.id].kills = currentKills;
          }

          socket.emit("killAwarded", { victimName: bot.name, kills: currentKills });
          broadcastModeEvent(peers[socket.id]?.gameMode || "ai", "killBroadcast", {
            killerId: peerClientId,
            killerName: peers[socket.id].username,
            victimId: bot.id,
            victimName: bot.name
          });

          updateLeaderboardKills(peers[socket.id].username, currentKills);
        }
      }
    });

    // When a player is eliminated
    socket.on("playerDied", (data) => {
      if (presences[socket.id]) {
        presences[socket.id].isAlive = false;
      }

      const myMode = peers[socket.id]?.gameMode || "global";
      const killerId = data?.killerId;
      if (killerId) {
        const killerSocketId = findTargetSocketId(killerId);
        if (killerSocketId && killerSocketId !== socket.id && peers[killerSocketId]) {
          peers[killerSocketId].kills = (peers[killerSocketId].kills || 0) + 1;
          const currentKills = peers[killerSocketId].kills;
          if (presences[killerSocketId]) {
            presences[killerSocketId].kills = currentKills;
          }

          io.to(killerSocketId).emit("killAwarded", {
            victimName: peers[socket.id]?.username || "Player",
            kills: currentKills
          });

          broadcastModeEvent(myMode, "killBroadcast", {
            killerId: peers[killerSocketId].id || killerSocketId,
            killerName: peers[killerSocketId].username,
            victimId: peerClientId,
            victimName: peers[socket.id]?.username || "Player"
          });

          updateLeaderboardKills(peers[killerSocketId].username, currentKills);
        }
      }
    });

    // Direct damage event backwards compatibility
    socket.on("damagePlayer", (data) => {
      if (!data || !data.targetId) return;
      const targetSocketId = findTargetSocketId(data.targetId);
      if (!targetSocketId) return;
      io.to(targetSocketId).emit("takeDamage", {
        ...data,
        attackerId: peerClientId
      });
    });

    // Peer-to-peer / combat request (hits, ink clouds, etc.)
    socket.on("requestPresenceUpdate", (data) => {
      if (!data || !data.targetId) return;
      if (data.targetId.startsWith("ai-")) {
        // Route to bot attack
        const bot = serverBots.find((b) => b.id === data.targetId);
        if (bot && bot.isAlive) {
          const damage = data.updateRequest?.damageAmount || 25;
          bot.health -= damage;
          if (bot.health <= 0) {
            bot.health = 0;
            bot.isAlive = false;
            bot.respawnTime = Date.now() + 5000;
            if (peers[socket.id]) {
              peers[socket.id].kills = (peers[socket.id].kills || 0) + 1;
              const currentKills = peers[socket.id].kills;
              if (presences[socket.id]) presences[socket.id].kills = currentKills;
              socket.emit("killAwarded", { victimName: bot.name, kills: currentKills });
              io.emit("killBroadcast", {
                killerId: peerClientId,
                killerName: peers[socket.id].username,
                victimId: bot.id,
                victimName: bot.name
              });
              updateLeaderboardKills(peers[socket.id].username, currentKills);
            }
          }
        }
      } else {
        const targetSocketId = findTargetSocketId(data.targetId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("presenceUpdateRequest", {
            updateRequest: data.updateRequest,
            fromClientId: peerClientId
          });
        }
      }
    });

    // Set unique username
    socket.on("setUsername", (data) => {
      const raw = data && data.username ? data.username : "";
      let clean = String(raw).trim().substring(0, 16);
      if (!clean) clean = "Player_" + Math.floor(100 + Math.random() * 900);

      // Verify uniqueness against other peers
      const taken = Object.values(peers).some(
        (p) => p.id !== socket.id && p.username.toLowerCase() === clean.toLowerCase()
      );
      if (taken) {
        let suffix = Math.floor(10 + Math.random() * 90);
        clean = `${clean.substring(0, 13)}_${suffix}`;
      }

      peers[socket.id] = { id: socket.id, username: clean, kills: peers[socket.id]?.kills || 0 };
      if (presences[socket.id]) {
        presences[socket.id].name = clean;
      }

      socket.emit("usernameConfirmed", { username: clean });
      io.emit("peerJoined", peers[socket.id]);
    });

    // Submit global score
    socket.on("submitScore", (data) => {
      if (!data || !data.username) return;
      const cleanUsername = String(data.username).trim().substring(0, 24);
      const bk = Math.max(0, parseInt(data.bestKills, 10) || 0);
      const tk = Math.max(0, parseInt(data.totalKills, 10) || 0);

      const prevBest = leaderboard.bestKills[cleanUsername] || 0;
      leaderboard.bestKills[cleanUsername] = Math.max(prevBest, bk);

      const prevTotal = leaderboard.totalKills[cleanUsername] || 0;
      leaderboard.totalKills[cleanUsername] = Math.max(prevTotal, tk);

      saveLeaderboard(leaderboard);
      roomState.globalLeaderboard = leaderboard;

      const formatted = formatLeaderboard(leaderboard);
      io.emit("leaderboardUpdate", formatted);
      io.emit("roomStateUpdate", roomState);
    });

    socket.on("updateRoomState", (data) => {
      if (data && data.globalLeaderboard) {
        leaderboard = {
          bestKills: { ...leaderboard.bestKills, ...(data.globalLeaderboard.bestKills || {}) },
          totalKills: { ...leaderboard.totalKills, ...(data.globalLeaderboard.totalKills || {}) }
        };
        saveLeaderboard(leaderboard);
        roomState.globalLeaderboard = leaderboard;
        io.emit("roomStateUpdate", roomState);
        io.emit("leaderboardUpdate", formatLeaderboard(leaderboard));
      }
    });

    socket.on("disconnect", () => {
      delete peers[socket.id];
      delete presences[socket.id];

      io.emit("peerLeft", socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
