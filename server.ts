import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  let roomState = { globalLeaderboard: { bestKills: {}, totalKills: {} } };
  let presences = {};
  let peers = {};

  io.on('connection', (socket) => {
    const username = socket.handshake.auth.username || "Player_" + Math.floor(Math.random() * 1000);
    peers[socket.id] = { id: socket.id, username: username };
    
    socket.emit('init', {
        id: socket.id,
        roomState,
        peers
    });

    socket.broadcast.emit('peerJoined', peers[socket.id]);
    socket.emit('presence', presences);

    socket.on('updatePresence', (data) => {
        presences[socket.id] = data;
        io.emit('presence', presences); // Broadcast to all
    });

    socket.on('requestPresenceUpdate', (data) => {
        io.to(data.targetId).emit('presenceUpdateRequest', {
            updateRequest: data.updateRequest,
            fromClientId: socket.id
        });
    });

    socket.on('updateRoomState', (data) => {
        roomState = { ...roomState, ...data };
        io.emit('roomStateUpdate', roomState);
    });

    socket.on('disconnect', () => {
        delete peers[socket.id];
        delete presences[socket.id];
        socket.broadcast.emit('peerLeft', socket.id);
        io.emit('presence', presences);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
