import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import { createClient } from "@supabase/supabase-js";

interface LeaderboardData {
  bestKills: Record<string, number>;
  totalKills: Record<string, number>;
}

const LEADERBOARD_FILE = path.join(process.cwd(), "data", "leaderboard.json");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://hguresgswifsjamgypcg.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndXJlc2dzd2lmc2phbWd5cGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Mjc1MzksImV4cCI6MjEwNjEwMzUzOX0.B-pFItn9R0R3SIGvACysblN1-Wy6OhrhX27xspAsvtA";

let supabaseClient: any = null;
try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.warn("[Server] Supabase client init warning:", e);
}

const FAKE_PLACEHOLDER_PLAYERS = new Set([
  "megalodon_99",
  "krakenhunter",
  "viperfish_pro",
  "abyssalsniper",
  "coralreef_x",
  "tsunamifin",
  "deepseastriker",
  "hydroblade",
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

async function syncWithSupabaseDB(leaderboard: LeaderboardData): Promise<LeaderboardData> {
  if (!supabaseClient) return leaderboard;
  try {
    // 1. First sync with Supabase persistent storage
    try {
      const { data: fileData, error: downloadErr } = await supabaseClient.storage
        .from("global_leaderboard")
        .download("leaderboard.json");
      if (!downloadErr && fileData) {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        if (parsed) {
          if (Array.isArray(parsed.bestKills)) {
            for (const item of parsed.bestKills) {
              if (item && item.username && item.score && !FAKE_PLACEHOLDER_PLAYERS.has(String(item.username).toLowerCase().trim())) {
                leaderboard.bestKills[item.username] = Math.max(leaderboard.bestKills[item.username] || 0, Number(item.score) || 0);
              }
            }
          }
          if (Array.isArray(parsed.totalKills)) {
            for (const item of parsed.totalKills) {
              if (item && item.username && item.score && !FAKE_PLACEHOLDER_PLAYERS.has(String(item.username).toLowerCase().trim())) {
                leaderboard.totalKills[item.username] = Math.max(leaderboard.totalKills[item.username] || 0, Number(item.score) || 0);
              }
            }
          }
          saveLeaderboard(leaderboard);
        }
      }
    } catch (storageErr) {
      console.warn("[Server] Supabase storage sync notice:", storageErr);
    }

    // 2. Also check any database tables in Supabase
    const possibleTables = ["leaderboard", "global_leaderboard", "player_scores", "scores"];
    for (const tableName of possibleTables) {
      try {
        const { data, error } = await supabaseClient.from(tableName).select("*").limit(100);
        if (!error && Array.isArray(data) && data.length > 0) {
          for (const row of data) {
            const username = row.username || row.name || row.player_name;
            if (!username || FAKE_PLACEHOLDER_PLAYERS.has(String(username).toLowerCase().trim())) continue;
            const best = Number(row.best_kills ?? row.bestkills ?? row.best_score ?? row.score ?? row.kills ?? 0) || 0;
            const total = Number(row.total_kills ?? row.totalkills ?? row.total_score ?? row.total ?? 0) || 0;
            if (best > 0) {
              leaderboard.bestKills[username] = Math.max(leaderboard.bestKills[username] || 0, best);
            }
            if (total > 0) {
              leaderboard.totalKills[username] = Math.max(leaderboard.totalKills[username] || 0, total);
            }
          }
          saveLeaderboard(leaderboard);
          break;
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn("[Server] Supabase sync notice:", err);
  }
  return leaderboard;
}

async function uploadLeaderboardToSupabase(leaderboard: LeaderboardData) {
  if (!supabaseClient) return;
  try {
    const formatted = formatLeaderboard(leaderboard);
    await supabaseClient.storage
      .from("global_leaderboard")
      .upload("leaderboard.json", JSON.stringify({
        updatedAt: new Date().toISOString(),
        bestKills: formatted.bestKills,
        totalKills: formatted.totalKills
      }), {
        contentType: "application/json",
        upsert: true
      });
  } catch (e) {
    console.warn("[Server] Error uploading leaderboard to Supabase storage:", e);
  }
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
  syncWithSupabaseDB(leaderboard).then((synced) => {
    leaderboard = synced;
    roomState.globalLeaderboard = leaderboard;
  });

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
  app.get("/api/multiplayer-config", (req, res) => {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://hguresgswifsjamgypcg.supabase.co";
    const secretKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.VITE_SUPABASE_SECRET_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndXJlc2dzd2lmc2phbWd5cGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Mjc1MzksImV4cCI6MjEwNjEwMzUzOX0.B-pFItn9R0R3SIGvACysblN1-Wy6OhrhX27xspAsvtA";
    res.json({
      useSupabase: Boolean(url && secretKey),
      supabaseUrl: url,
      supabaseSecretKey: secretKey,
      supabaseKey: secretKey
    });
  });

  app.get("/api/leaderboard", async (req, res) => {
    leaderboard = await syncWithSupabaseDB(leaderboard);
    res.json(formatLeaderboard(leaderboard));
  });

  app.post("/api/leaderboard", async (req, res) => {
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

    // Persist to Supabase cloud storage
    uploadLeaderboardToSupabase(leaderboard);

    if (supabaseClient) {
      const possibleTables = ["leaderboard", "global_leaderboard", "player_scores", "scores"];
      for (const tName of possibleTables) {
        try {
          await supabaseClient.from(tName).upsert({
            username: cleanUsername,
            best_kills: leaderboard.bestKills[cleanUsername],
            total_kills: leaderboard.totalKills[cleanUsername],
            updated_at: new Date().toISOString()
          }, { onConflict: "username" });
          break;
        } catch (e) {}
      }
    }

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

      peers[socket.id] = { id: socket.id, username: clean };
      if (presences[socket.id]) {
        presences[socket.id].name = clean;
      }

      socket.emit("usernameConfirmed", { username: clean });
      io.emit("peerJoined", peers[socket.id]);
      socket.broadcast.emit("presence", presences);
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

      if (supabaseClient) {
        const possibleTables = ["leaderboard", "global_leaderboard", "player_scores", "scores"];
        for (const tName of possibleTables) {
          try {
            supabaseClient.from(tName).upsert({
              username: cleanUsername,
              best_kills: leaderboard.bestKills[cleanUsername],
              total_kills: leaderboard.totalKills[cleanUsername],
              updated_at: new Date().toISOString()
            }, { onConflict: "username" }).then(() => {}).catch(() => {});
            break;
          } catch (e) {}
        }
      }

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
