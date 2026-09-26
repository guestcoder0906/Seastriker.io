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

function loadLeaderboard(): LeaderboardData {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          bestKills: parsed.bestKills || {},
          totalKills: parsed.totalKills || {}
        };
      }
    }
  } catch (err) {
    console.error("[Server] Error loading leaderboard file:", err);
  }
  return {
    bestKills: {
      ApexPredator: 24,
      KrakenKing: 19,
      AbyssalGhost: 16,
      ViperFish: 13,
      TsunamiRider: 11,
      ShadowFin: 9,
      CoralSniper: 7,
      DeepBlue: 5
    },
    totalKills: {
      ApexPredator: 142,
      KrakenKing: 118,
      AbyssalGhost: 85,
      ShadowFin: 64,
      ViperFish: 58,
      TsunamiRider: 45,
      CoralSniper: 37,
      DeepBlue: 29
    }
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

  let leaderboard = loadLeaderboard();
  let roomState = { globalLeaderboard: leaderboard };
  let presences: Record<string, any> = {};
  let peers: Record<string, { id: string; username: string }> = {};
  let botHostId: string | null = null;
  let sharedBots: Record<string, any> = {};

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

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

  app.get("/api/status", (req, res) => {
    res.json({
      online: true,
      playersCount: Object.keys(peers).length,
      botHostId
    });
  });

  io.on("connection", (socket) => {
    const clientUsername =
      (socket.handshake.auth && socket.handshake.auth.username) ||
      "Player_" + Math.floor(100 + Math.random() * 900);

    peers[socket.id] = { id: socket.id, username: clientUsername };

    // Assign bot host if none exists
    if (!botHostId) {
      botHostId = socket.id;
    }

    // Send init packet
    socket.emit("init", {
      id: socket.id,
      roomState,
      peers,
      isBotHost: botHostId === socket.id,
      sharedBots
    });

    // Notify peers
    socket.broadcast.emit("peerJoined", peers[socket.id]);
    socket.emit("presence", presences);

    // Real-time presence updates (movement, angle, segments, etc.)
    socket.on("updatePresence", (data) => {
      if (!data) return;
      data.id = socket.id;
      data.name = peers[socket.id]?.username || data.name || "Player";
      presences[socket.id] = data;

      // Broadcast to other players
      socket.broadcast.emit("presence", presences);
    });

    // Peer-to-peer / combat request (hits, ink clouds, etc.)
    socket.on("requestPresenceUpdate", (data) => {
      if (!data || !data.targetId) return;
      io.to(data.targetId).emit("presenceUpdateRequest", {
        updateRequest: data.updateRequest,
        fromClientId: socket.id
      });
    });

    // Direct damage event for authoritative PvP
    socket.on("damagePlayer", (data) => {
      if (!data || !data.targetId) return;
      io.to(data.targetId).emit("takeDamage", {
        ...data,
        attackerId: socket.id
      });
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

    // Bot synchronization from the designated bot host
    socket.on("syncBots", (botsData) => {
      if (socket.id === botHostId && botsData) {
        sharedBots = botsData;
        socket.broadcast.emit("botPresences", botsData);
      }
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

      // Reassign bot host if the host disconnected
      if (botHostId === socket.id) {
        const remainingSockets = Object.keys(peers);
        botHostId = remainingSockets.length > 0 ? remainingSockets[0] : null;
        if (botHostId) {
          io.to(botHostId).emit("botHost", { isHost: true });
        }
      }

      socket.broadcast.emit("peerLeft", socket.id);
      socket.broadcast.emit("presence", presences);
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
