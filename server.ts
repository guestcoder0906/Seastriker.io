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

  let leaderboard = loadLeaderboard();
  let roomState = { globalLeaderboard: leaderboard };
  let presences: Record<string, any> = {};
  let peers: Record<string, { id: string; username: string; kills: number; creatureType?: string }> = {};

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
    { id: "ai-0", name: "AquaGlider", type: "narwhal", skinId: "default", color: "#38bdf8", x: 700, y: 700, angle: 0.5 },
    { id: "ai-1", name: "ApexShark", type: "shark", skinId: "default", color: "#64748b", x: 1800, y: 800, angle: 2.2 },
    { id: "ai-2", name: "WaveRider", type: "dolphin", skinId: "default", color: "#0284c7", x: 900, y: 1700, angle: -1.2 },
    { id: "ai-3", name: "AbyssSquid", type: "squid", skinId: "default", color: "#ec4899", x: 1900, y: 1900, angle: 3.0 },
    { id: "ai-4", name: "PhantomFin", type: "knifefish", skinId: "default", color: "#a855f7", x: 1300, y: 1200, angle: 1.0 },
    { id: "ai-5", name: "HammerheadBot", type: "shark", skinId: "hammerhead", color: "#475569", x: 1600, y: 1500, angle: -2.5 }
  ];

  const serverBots: ServerBot[] = initialBotConfigs.map(cfg => ({
    ...cfg,
    targetAngle: cfg.angle,
    speed: 4.2,
    health: 100,
    maxHealth: 100,
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
        isDashing: false,
        staminaReady: true,
        stamina: 1.0
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
          bot.health = 100;
          bot.x = 400 + Math.random() * 1700;
          bot.y = 400 + Math.random() * 1700;
          bot.angle = Math.random() * Math.PI * 2;
          bot.targetAngle = bot.angle;
          bot.segments = createBotSegments(bot.type, bot.x, bot.y, bot.angle);
        }
        continue;
      }

      // Find nearest alive human player to hunt or avoid
      let nearestDist = 800;
      let targetX = -1;
      let targetY = -1;
      for (const p of Object.values(presences)) {
        if (p && p.isAlive && p.x !== undefined && p.y !== undefined) {
          const d = Math.hypot(p.x - bot.x, p.y - bot.y);
          if (d < nearestDist) {
            nearestDist = d;
            targetX = p.x;
            targetY = p.y;
          }
        }
      }

      bot.turnTimer += 50;
      if (targetX !== -1 && targetY !== -1) {
        // Steer toward player
        bot.targetAngle = Math.atan2(targetY - bot.y, targetX - bot.x);
      } else if (bot.turnTimer > 2000) {
        bot.turnTimer = 0;
        bot.targetAngle += (Math.random() - 0.5) * 1.2;
      }

      // Turn smoothly
      let angleDiff = bot.targetAngle - bot.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      const turnSpeed = 0.08;
      bot.angle += Math.max(-turnSpeed, Math.min(turnSpeed, angleDiff));

      // Avoid walls
      const margin = 200;
      if (bot.x < margin) bot.targetAngle = 0;
      else if (bot.x > 2500 - margin) bot.targetAngle = Math.PI;
      else if (bot.y < margin) bot.targetAngle = Math.PI / 2;
      else if (bot.y > 2500 - margin) bot.targetAngle = -Math.PI / 2;

      // Move head
      bot.x += Math.cos(bot.angle) * bot.speed;
      bot.y += Math.sin(bot.angle) * bot.speed;
      bot.x = Math.max(100, Math.min(2400, bot.x));
      bot.y = Math.max(100, Math.min(2400, bot.y));

      bot.segments[0].x = bot.x;
      bot.segments[0].y = bot.y;
      bot.segments[0].angle = bot.angle;

      // Kinematics for trailing segments
      for (let i = 1; i < bot.segments.length; i++) {
        const prev = bot.segments[i - 1];
        const cur = bot.segments[i];
        const dx = prev.x - cur.x;
        const dy = prev.y - cur.y;
        const ang = Math.atan2(dy, dx);
        const spacing = 13;
        cur.x = prev.x - Math.cos(ang) * spacing;
        cur.y = prev.y - Math.sin(ang) * spacing;
        cur.angle = ang;
      }
    }

    // Broadcast synchronized network snapshot
    io.emit("networkTick", {
      players: presences,
      bots: formatBots(serverBots),
      peers
    });
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
    res.json({
      online: true,
      playersCount: Object.keys(peers).length,
      serverBotsCount: serverBots.length
    });
  });

  io.on("connection", (socket) => {
    const clientUsername =
      (socket.handshake.auth && socket.handshake.auth.username) ||
      "Player_" + Math.floor(100 + Math.random() * 900);

    peers[socket.id] = { id: socket.id, username: clientUsername, kills: 0 };

    // Send init packet immediately
    socket.emit("init", {
      id: socket.id,
      roomState,
      peers,
      bots: formatBots(serverBots)
    });

    // Notify all peers of new player
    io.emit("peerJoined", peers[socket.id]);
    socket.emit("presence", presences);

    // Real-time presence updates (movement, angle, segments, etc.)
    socket.on("updatePresence", (data) => {
      if (!data) return;
      data.id = socket.id;
      data.name = peers[socket.id]?.username || data.name || "Player";
      presences[socket.id] = { ...(presences[socket.id] || {}), ...data };
      if (data.kills !== undefined && peers[socket.id]) {
        peers[socket.id].kills = Math.max(peers[socket.id].kills || 0, data.kills);
      }
    });

    // Player attacks another human player
    socket.on("attackPlayer", (data) => {
      if (!data || !data.targetId || data.targetId === socket.id) return;
      const targetPeer = peers[data.targetId];
      if (!targetPeer) return;

      io.to(data.targetId).emit("takeDamage", {
        attackerId: socket.id,
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
          io.emit("killBroadcast", {
            killerId: socket.id,
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

      const killerId = data?.killerId;
      if (killerId && peers[killerId] && killerId !== socket.id) {
        peers[killerId].kills = (peers[killerId].kills || 0) + 1;
        const currentKills = peers[killerId].kills;
        if (presences[killerId]) {
          presences[killerId].kills = currentKills;
        }

        io.to(killerId).emit("killAwarded", {
          victimName: peers[socket.id]?.username || "Player",
          kills: currentKills
        });

        io.emit("killBroadcast", {
          killerId,
          killerName: peers[killerId].username,
          victimId: socket.id,
          victimName: peers[socket.id]?.username || "Player"
        });

        updateLeaderboardKills(peers[killerId].username, currentKills);
      }
    });

    // Direct damage event backwards compatibility
    socket.on("damagePlayer", (data) => {
      if (!data || !data.targetId) return;
      io.to(data.targetId).emit("takeDamage", {
        ...data,
        attackerId: socket.id
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
                killerId: socket.id,
                killerName: peers[socket.id].username,
                victimId: bot.id,
                victimName: bot.name
              });
              updateLeaderboardKills(peers[socket.id].username, currentKills);
            }
          }
        }
      } else {
        io.to(data.targetId).emit("presenceUpdateRequest", {
          updateRequest: data.updateRequest,
          fromClientId: socket.id
        });
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
      io.emit("networkTick", {
        players: presences,
        bots: formatBots(serverBots),
        peers
      });
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
