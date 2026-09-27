import { io } from "socket.io-client";
import { joinRoom as joinNostrRoom, selfId as nostrSelfId } from "@trystero-p2p/nostr";
import { joinRoom as joinTorrentRoom, selfId as torrentSelfId } from "@trystero-p2p/torrent";

// Verified live, accessible public WebTorrent trackers
const TORRENT_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.webtorrent.dev'
];

// Verified live, accessible public Nostr relays
const NOSTR_RELAYS = [
    'wss://relay.damus.io',
    'wss://purplerelay.com',
    'wss://relay.snort.social',
    'wss://nostr.mom'
];

export class WebsimSocket {
    constructor() {
        this.clientId = nostrSelfId || torrentSelfId || ("player_" + Math.random().toString(36).substring(2, 9));
        this.username = "Player";
        this.peers = {};
        this.roomState = {
            globalLeaderboard: {
                bestKills: {},
                totalKills: {}
            }
        };
        this.localPresences = {};
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
        this.damageCallbacks = [];
        this.killBroadcastCallbacks = [];
        this.killAwardedCallbacks = [];
        this.statusCallbacks = [];

        this.socket = null;
        this.nostrRoom = null;
        this.torrentRoom = null;
        this.broadcastChannel = null;

        this.isServerConnected = false;
        this.isP2PConnected = false;
        this.isConnecting = true;
        this.isHost = false;
        this.lastPresenceEmit = 0;

        this.botSimulationInterval = null;
        this.serverBots = [];

        // P2P Action dispatchers
        this.p2pActions = {
            nostr: null,
            torrent: null
        };

        // Load cached room state
        try {
            const saved = localStorage.getItem('narwhal_room_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.roomState = { ...this.roomState, ...parsed };
                }
            }
        } catch (e) {}

        this.initBots();
        this.initBroadcastChannel();
    }

    initBots() {
        const configs = [
            { id: "ai-0", name: "AquaGlider", type: "narwhal", skinId: "default", color: "#38bdf8", x: 700, y: 700, angle: 0.5 },
            { id: "ai-1", name: "ApexShark", type: "shark", skinId: "default", color: "#64748b", x: 1800, y: 800, angle: 2.2 },
            { id: "ai-2", name: "WaveRider", type: "dolphin", skinId: "default", color: "#0284c7", x: 900, y: 1700, angle: -1.2 },
            { id: "ai-3", name: "AbyssSquid", type: "squid", skinId: "default", color: "#ec4899", x: 1900, y: 1900, angle: 3.0 },
            { id: "ai-4", name: "PhantomFin", type: "knifefish", skinId: "default", color: "#a855f7", x: 1300, y: 1200, angle: 1.0 },
            { id: "ai-5", name: "HammerheadBot", type: "shark", skinId: "hammerhead", color: "#475569", x: 1600, y: 1500, angle: -2.5 }
        ];

        this.serverBots = configs.map(cfg => ({
            ...cfg,
            targetAngle: cfg.angle,
            speed: 4.0,
            health: 100,
            maxHealth: 100,
            kills: 0,
            isAlive: true,
            respawnTime: 0,
            turnTimer: Math.random() * 2000,
            segments: this.createBotSegments(cfg.type, cfg.x, cfg.y, cfg.angle)
        }));
    }

    createBotSegments(type, startX, startY, angle) {
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

    initBroadcastChannel() {
        if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
        try {
            this.broadcastChannel = new BroadcastChannel('seastriker_ocean_multiplayer');
            this.broadcastChannel.onmessage = (event) => {
                const msg = event.data;
                if (!msg || !msg.type || msg.fromId === this.clientId) return;

                if (msg.type === 'peerJoined') {
                    this.peers[msg.fromId] = {
                        id: msg.fromId,
                        username: msg.username || 'Player',
                        kills: msg.kills || 0
                    };
                    this.broadcastChannel.postMessage({
                        type: 'peerSync',
                        fromId: this.clientId,
                        username: this.username,
                        kills: this.peers[this.clientId]?.kills || 0,
                        presence: this.localPresences[this.clientId]
                    });
                    this.updateHostElection();
                    this.notifyStatus();
                } else if (msg.type === 'peerSync') {
                    this.peers[msg.fromId] = {
                        id: msg.fromId,
                        username: msg.username || 'Player',
                        kills: msg.kills || 0
                    };
                    if (msg.presence) {
                        this.handleIncomingPresence(msg.fromId, msg.presence);
                    }
                    this.updateHostElection();
                    this.notifyStatus();
                } else if (msg.type === 'peerLeft') {
                    delete this.peers[msg.fromId];
                    delete this.localPresences[msg.fromId];
                    this.updateHostElection();
                    this.notifyStatus();
                    for (const cb of this.presenceCallbacks) cb(this.localPresences);
                } else if (msg.type === 'presence') {
                    this.handleIncomingPresence(msg.fromId, msg.data);
                } else if (msg.type === 'attackPlayer' && msg.targetId === this.clientId) {
                    this.handleIncomingDamage(msg.data);
                } else if (msg.type === 'attackBot') {
                    this.handleBotAttackFromPeer(msg.data, msg.fromId);
                } else if (msg.type === 'killBroadcast') {
                    this.handleIncomingKill(msg.data);
                } else if (msg.type === 'botTick') {
                    if (!this.isHost && !this.isServerConnected) {
                        this.localPresences = { ...msg.bots, ...this.localPresences };
                        for (const cb of this.presenceCallbacks) cb(this.localPresences);
                    }
                }
            };

            window.addEventListener('beforeunload', () => {
                if (this.broadcastChannel) {
                    this.broadcastChannel.postMessage({
                        type: 'peerLeft',
                        fromId: this.clientId
                    });
                }
            });
        } catch (e) {
            console.warn('[BroadcastChannel] init failed:', e);
        }
    }

    async initialize() {
        try {
            const savedUsername = localStorage.getItem('username');
            if (savedUsername && savedUsername.trim()) {
                this.username = savedUsername.trim().substring(0, 16);
            } else {
                this.username = "Player_" + Math.floor(100 + Math.random() * 900);
                try { localStorage.setItem('username', this.username); } catch (e) {}
            }
        } catch (e) {}

        this.peers[this.clientId] = { id: this.clientId, username: this.username, kills: 0 };

        // 1. Try local Socket.IO connection first (on localhost)
        const isLocal = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        if (isLocal) {
            await this.trySocketIo();
        }

        // 2. Initialize global WebRTC mesh network (via Nostr & WebTorrent)
        this.initGlobalP2P();

        // 3. Announce to local tabs via BroadcastChannel
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                type: 'peerJoined',
                fromId: this.clientId,
                username: this.username,
                kills: 0
            });
        }

        this.isConnecting = false;
        this.updateHostElection();
        this.notifyStatus();
    }

    trySocketIo() {
        return new Promise((resolve) => {
            try {
                this.socket = io({
                    auth: { username: this.username },
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 2,
                    timeout: 1500
                });

                this.socket.on('connect', () => {
                    this.isServerConnected = true;
                    if (this.socket.id) {
                        this.clientId = this.socket.id;
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    this.notifyStatus();
                    resolve();
                });

                this.socket.on('init', (data) => {
                    this.isServerConnected = true;
                    if (data.id) this.clientId = data.id;
                    if (data.roomState) this.roomState = data.roomState;
                    if (data.peers) this.peers = data.peers;
                    if (data.bots) this.localPresences = { ...data.bots, ...this.localPresences };
                    this.notifyStatus();
                    resolve();
                });

                this.socket.on('networkTick', (data) => {
                    if (!data) return;
                    if (data.peers) this.peers = data.peers;
                    const combined = { ...(data.bots || {}), ...(data.players || {}) };
                    this.localPresences = combined;
                    for (const cb of this.presenceCallbacks) cb(combined);
                    this.notifyStatus();
                });

                this.socket.on('presence', (presences) => {
                    this.localPresences = { ...this.localPresences, ...presences };
                    for (const cb of this.presenceCallbacks) cb(this.localPresences);
                });

                this.socket.on('takeDamage', (data) => this.handleIncomingDamage(data));
                this.socket.on('killBroadcast', (data) => this.handleIncomingKill(data));
                this.socket.on('killAwarded', (data) => this.handleKillAwarded(data));

                this.socket.on('peerJoined', (peer) => {
                    this.peers[peer.id] = peer;
                    this.notifyStatus();
                });

                this.socket.on('peerLeft', (id) => {
                    delete this.peers[id];
                    delete this.localPresences[id];
                    this.notifyStatus();
                    for (const cb of this.presenceCallbacks) cb(this.localPresences);
                });

                this.socket.on('connect_error', () => {
                    this.isServerConnected = false;
                    resolve();
                });

                setTimeout(resolve, 1500);
            } catch (e) {
                resolve();
            }
        });
    }

    initGlobalP2P() {
        const appId = 'seastriker-ocean-global-v1';
        const roomId = 'ocean-arena-lobby';

        // Connect via Nostr relays
        try {
            this.nostrRoom = joinNostrRoom({
                appId,
                relayUrls: NOSTR_RELAYS
            }, roomId);

            this.setupRoomActions(this.nostrRoom, 'nostr');
        } catch (e) {
            console.warn('[P2P] Nostr room setup failed:', e);
        }

        // Connect via WebTorrent trackers for redundancy
        try {
            this.torrentRoom = joinTorrentRoom({
                appId,
                trackerUrls: TORRENT_TRACKERS
            }, roomId);

            this.setupRoomActions(this.torrentRoom, 'torrent');
        } catch (e) {
            console.warn('[P2P] Torrent room setup failed:', e);
        }
    }

    setupRoomActions(room, type) {
        if (!room) return;

        const [sendPresence, onPresence] = room.makeAction('presence');
        const [sendPeerInfo, onPeerInfo] = room.makeAction('peerInfo');
        const [sendAttackPlayer, onAttackPlayer] = room.makeAction('attackPlayer');
        const [sendAttackBot, onAttackBot] = room.makeAction('attackBot');
        const [sendKillBroadcast, onKillBroadcast] = room.makeAction('killBroadcast');
        const [sendBotTick, onBotTick] = room.makeAction('botTick');

        this.p2pActions[type] = {
            sendPresence,
            sendPeerInfo,
            sendAttackPlayer,
            sendAttackBot,
            sendKillBroadcast,
            sendBotTick
        };

        room.onPeerJoin((peerId) => {
            this.isP2PConnected = true;
            this.peers[peerId] = { id: peerId, username: 'Player', kills: 0 };

            sendPeerInfo({
                id: this.clientId,
                username: this.username,
                kills: this.peers[this.clientId]?.kills || 0
            }, peerId);

            if (this.localPresences[this.clientId]) {
                sendPresence(this.localPresences[this.clientId], peerId);
            }

            this.updateHostElection();
            this.notifyStatus();
        });

        room.onPeerLeave((peerId) => {
            delete this.peers[peerId];
            delete this.localPresences[peerId];
            this.updateHostElection();
            this.notifyStatus();
            for (const cb of this.presenceCallbacks) cb(this.localPresences);
        });

        onPeerInfo((data, peerId) => {
            if (!data) return;
            this.isP2PConnected = true;
            this.peers[peerId] = {
                id: peerId,
                username: data.username || 'Player',
                kills: data.kills || 0
            };
            this.notifyStatus();
        });

        onPresence((data, peerId) => {
            if (this.isServerConnected) return;
            this.handleIncomingPresence(peerId, data);
        });

        onAttackPlayer((data, attackerId) => {
            if (!data || data.targetId !== this.clientId) return;
            this.handleIncomingDamage({
                attackerId,
                attackerName: this.peers[attackerId]?.username || 'Player',
                damage: data.damage,
                hitType: data.hitType,
                knockbackAngle: data.angle,
                knockbackForce: data.knockbackForce
            });
        });

        onAttackBot((data, attackerId) => {
            this.handleBotAttackFromPeer(data, attackerId);
        });

        onKillBroadcast((data) => {
            this.handleIncomingKill(data);
        });

        onBotTick((bots) => {
            if (this.isHost || this.isServerConnected || !bots) return;
            this.localPresences = { ...bots, ...this.localPresences };
            for (const cb of this.presenceCallbacks) cb(this.localPresences);
        });
    }

    handleIncomingPresence(peerId, data) {
        if (!data) return;
        data.id = peerId;
        data.name = this.peers[peerId]?.username || data.name || 'Player';
        this.localPresences[peerId] = data;
        for (const cb of this.presenceCallbacks) {
            cb(this.localPresences);
        }
    }

    handleIncomingDamage(data) {
        for (const cb of this.damageCallbacks) cb(data);
        if (typeof window !== 'undefined' && window.game && window.game.healthSystem) {
            window.game.healthSystem.processDamage(
                data.hitType || 'bodyHit',
                data.damage || 20,
                data.attackerId
            );
            if (data.knockbackAngle !== undefined && window.game.creature && window.game.creature.velocity) {
                const force = data.knockbackForce || 5;
                window.game.creature.velocity.x += Math.cos(data.knockbackAngle) * force;
                window.game.creature.velocity.y += Math.sin(data.knockbackAngle) * force;
            }
        }
    }

    handleIncomingKill(data) {
        if (!data) return;
        if (this.peers[data.killerId]) {
            this.peers[data.killerId].kills = (this.peers[data.killerId].kills || 0) + 1;
        }
        for (const cb of this.killBroadcastCallbacks) {
            cb(data);
        }
        if (data.killerId === this.clientId) {
            this.handleKillAwarded({
                victimName: data.victimName,
                kills: this.peers[this.clientId]?.kills || 1
            });
        }
    }

    handleKillAwarded(data) {
        for (const cb of this.killAwardedCallbacks) cb(data);
        if (typeof window !== 'undefined' && window.game && window.game.creature) {
            window.game.creature.kills = data.kills;
            if (this.peers[this.clientId]) {
                this.peers[this.clientId].kills = data.kills;
            }
            if (window.game.playerStats) {
                window.game.playerStats.updateCurrentKills(data.kills);
            }
            if (window.game.skinUnlockSystem && window.game.creature.type) {
                window.game.skinUnlockSystem.trackKill(window.game.creature.type);
            }
            window.game.updateLeaderboard();
        }
    }

    handleBotAttackFromPeer(data, attackerId) {
        if (!this.isHost || !data || !data.botId) return;
        const bot = this.serverBots.find(b => b.id === data.botId);
        if (!bot || !bot.isAlive) return;

        bot.health -= (data.damage || 25);
        if (bot.health <= 0) {
            bot.health = 0;
            bot.isAlive = false;
            bot.respawnTime = Date.now() + 5000;

            const killerName = this.peers[attackerId]?.username || 'Player';
            if (this.peers[attackerId]) {
                this.peers[attackerId].kills = (this.peers[attackerId].kills || 0) + 1;
            }

            const broadcast = {
                killerId: attackerId,
                killerName,
                victimId: bot.id,
                victimName: bot.name
            };

            this.dispatchBroadcast('sendKillBroadcast', 'killBroadcast', broadcast);
            for (const cb of this.killBroadcastCallbacks) cb(broadcast);

            if (attackerId === this.clientId) {
                this.handleKillAwarded({ victimName: bot.name, kills: this.peers[this.clientId].kills });
            }
        }
    }

    updateHostElection() {
        const allPeerIds = [this.clientId, ...Object.keys(this.peers)].sort();
        const shouldBeHost = allPeerIds[0] === this.clientId;

        if (shouldBeHost && !this.isHost) {
            this.isHost = true;
            this.startBotSimulation();
        } else if (!shouldBeHost && this.isHost) {
            this.isHost = false;
            this.stopBotSimulation();
        }
    }

    startBotSimulation() {
        if (this.botSimulationInterval) return;

        this.botSimulationInterval = setInterval(() => {
            if (this.isServerConnected) return;

            const now = Date.now();
            const formattedBots = {};

            for (const bot of this.serverBots) {
                if (!bot.isAlive) {
                    if (bot.respawnTime > 0 && now >= bot.respawnTime) {
                        bot.isAlive = true;
                        bot.health = 100;
                        bot.x = 400 + Math.random() * 1700;
                        bot.y = 400 + Math.random() * 1700;
                        bot.angle = Math.random() * Math.PI * 2;
                        bot.targetAngle = bot.angle;
                        bot.segments = this.createBotSegments(bot.type, bot.x, bot.y, bot.angle);
                    }
                    continue;
                }

                // AI Steering
                bot.turnTimer += 50;
                let nearestDist = 800;
                let targetX = -1;
                let targetY = -1;

                for (const p of Object.values(this.localPresences)) {
                    if (p && p.isAlive && !p.id?.startsWith('ai-') && p.x !== undefined && p.y !== undefined) {
                        const d = Math.hypot(p.x - bot.x, p.y - bot.y);
                        if (d < nearestDist) {
                            nearestDist = d;
                            targetX = p.x;
                            targetY = p.y;
                        }
                    }
                }

                if (targetX !== -1 && targetY !== -1) {
                    bot.targetAngle = Math.atan2(targetY - bot.y, targetX - bot.x);
                } else if (bot.turnTimer > 2000) {
                    bot.turnTimer = 0;
                    bot.targetAngle += (Math.random() - 0.5) * 1.2;
                }

                let angleDiff = bot.targetAngle - bot.angle;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                bot.angle += Math.max(-0.08, Math.min(0.08, angleDiff));

                const margin = 200;
                if (bot.x < margin) bot.targetAngle = 0;
                else if (bot.x > 2500 - margin) bot.targetAngle = Math.PI;
                else if (bot.y < margin) bot.targetAngle = Math.PI / 2;
                else if (bot.y > 2500 - margin) bot.targetAngle = -Math.PI / 2;

                bot.x += Math.cos(bot.angle) * bot.speed;
                bot.y += Math.sin(bot.angle) * bot.speed;
                bot.x = Math.max(100, Math.min(2400, bot.x));
                bot.y = Math.max(100, Math.min(2400, bot.y));

                bot.segments[0].x = bot.x;
                bot.segments[0].y = bot.y;
                bot.segments[0].angle = bot.angle;

                for (let i = 1; i < bot.segments.length; i++) {
                    const prev = bot.segments[i - 1];
                    const cur = bot.segments[i];
                    const dx = prev.x - cur.x;
                    const dy = prev.y - cur.y;
                    const ang = Math.atan2(dy, dx);
                    cur.x = prev.x - Math.cos(ang) * 13;
                    cur.y = prev.y - Math.sin(ang) * 13;
                    cur.angle = ang;
                }

                formattedBots[bot.id] = {
                    id: bot.id,
                    name: bot.name,
                    type: bot.type,
                    skinId: bot.skinId,
                    color: bot.color,
                    x: bot.x,
                    y: bot.y,
                    angle: bot.angle,
                    segments: bot.segments,
                    health: bot.health,
                    maxHealth: bot.maxHealth,
                    kills: bot.kills,
                    isAlive: bot.isAlive,
                    isDashing: false,
                    staminaReady: true,
                    stamina: 1.0
                };
            }

            this.localPresences = { ...formattedBots, ...this.localPresences };
            this.dispatchBroadcast('sendBotTick', 'botTick', { bots: formattedBots });

            for (const cb of this.presenceCallbacks) {
                cb(this.localPresences);
            }
        }, 50);
    }

    stopBotSimulation() {
        if (this.botSimulationInterval) {
            clearInterval(this.botSimulationInterval);
            this.botSimulationInterval = null;
        }
    }

    dispatchBroadcast(actionName, bcType, payload) {
        // 1. Trystero Nostr
        if (this.p2pActions.nostr?.[actionName]) {
            try { this.p2pActions.nostr[actionName](payload); } catch (e) {}
        }
        // 2. Trystero Torrent
        if (this.p2pActions.torrent?.[actionName]) {
            try { this.p2pActions.torrent[actionName](payload); } catch (e) {}
        }
        // 3. BroadcastChannel (cross-tab local)
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: bcType,
                    fromId: this.clientId,
                    data: payload,
                    ...(payload && typeof payload === 'object' ? payload : {})
                });
            } catch (e) {}
        }
    }

    dispatchDirect(actionName, bcType, payload, targetId) {
        if (this.p2pActions.nostr?.[actionName]) {
            try { this.p2pActions.nostr[actionName](payload, targetId); } catch (e) {}
        }
        if (this.p2pActions.torrent?.[actionName]) {
            try { this.p2pActions.torrent[actionName](payload, targetId); } catch (e) {}
        }
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: bcType,
                    fromId: this.clientId,
                    targetId,
                    data: payload,
                    ...(payload && typeof payload === 'object' ? payload : {})
                });
            } catch (e) {}
        }
    }

    getOnlineCount() {
        const humanPeersCount = Math.max(1, Object.keys(this.peers).length);
        const aliveBots = this.serverBots ? this.serverBots.filter(b => b.isAlive).length : 6;
        return humanPeersCount + aliveBots;
    }

    notifyStatus() {
        const count = this.getOnlineCount();
        const status = {
            connected: true,
            connecting: false,
            playersCount: count,
            peers: this.peers
        };
        for (const cb of this.statusCallbacks) {
            cb(status);
        }
    }

    subscribeStatus(callback) {
        this.statusCallbacks.push(callback);
        this.notifyStatus();
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    subscribeDamage(callback) {
        this.damageCallbacks.push(callback);
    }

    subscribeKillBroadcast(callback) {
        this.killBroadcastCallbacks.push(callback);
    }

    subscribeKillAwarded(callback) {
        this.killAwardedCallbacks.push(callback);
    }

    updatePresence(data) {
        if (!data) return;
        this.localPresences[this.clientId] = data;

        const now = performance.now();
        if (now - this.lastPresenceEmit >= 33) {
            this.lastPresenceEmit = now;
            if (this.socket && this.socket.connected) {
                this.socket.emit('updatePresence', data);
            }
            this.dispatchBroadcast('sendPresence', 'presence', data);
        }
    }

    attackPlayer(targetId, damage, hitType = 'bodyHit', angle = 0, knockbackForce = 6) {
        const payload = { targetId, damage, hitType, angle, knockbackForce };
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackPlayer', payload);
        }
        this.dispatchDirect('sendAttackPlayer', 'attackPlayer', payload, targetId);
    }

    attackBot(botId, damage, hitType = 'bodyHit', angle = 0) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackBot', { botId, damage, hitType, angle });
        } else if (this.isHost) {
            const bot = this.serverBots.find(b => b.id === botId);
            if (!bot || !bot.isAlive) return;
            bot.health -= (damage || 25);
            if (bot.health <= 0) {
                bot.health = 0;
                bot.isAlive = false;
                bot.respawnTime = Date.now() + 5000;
                if (this.peers[this.clientId]) {
                    this.peers[this.clientId].kills = (this.peers[this.clientId].kills || 0) + 1;
                    const kills = this.peers[this.clientId].kills;
                    const broadcast = {
                        killerId: this.clientId,
                        killerName: this.username,
                        victimId: bot.id,
                        victimName: bot.name
                    };
                    this.dispatchBroadcast('sendKillBroadcast', 'killBroadcast', broadcast);
                    for (const cb of this.killBroadcastCallbacks) cb(broadcast);
                    this.handleKillAwarded({ victimName: bot.name, kills });
                }
            }
        } else {
            this.dispatchBroadcast('sendAttackBot', 'attackBot', { botId, damage, hitType, angle });
        }
    }

    notifyDeath(killerId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerDied', { killerId });
        } else {
            const killerName = (killerId && this.peers[killerId]?.username) || 'Ocean';
            const broadcast = {
                killerId: killerId || null,
                killerName,
                victimId: this.clientId,
                victimName: this.username
            };
            this.dispatchBroadcast('sendKillBroadcast', 'killBroadcast', broadcast);
            for (const cb of this.killBroadcastCallbacks) cb(broadcast);
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('requestPresenceUpdate', { targetId, updateRequest });
        }
    }

    setUsername(newUsername) {
        let clean = String(newUsername || "").trim().substring(0, 16);
        if (!clean) clean = "Player";
        this.username = clean;
        try { localStorage.setItem('username', clean); } catch (e) {}
        if (this.peers[this.clientId]) {
            this.peers[this.clientId].username = clean;
        }
        if (this.socket && this.socket.connected) {
            this.socket.emit('setUsername', { username: clean });
        }
        const info = {
            id: this.clientId,
            username: clean,
            kills: this.peers[this.clientId]?.kills || 0
        };
        this.dispatchBroadcast('sendPeerInfo', 'peerSync', info);
        this.notifyStatus();
    }

    updateRoomState(data) {
        this.roomState = { ...this.roomState, ...data };
        try {
            localStorage.setItem('narwhal_room_state', JSON.stringify(this.roomState));
        } catch (e) {}

        if (this.socket && this.socket.connected) {
            this.socket.emit('updateRoomState', data);
        }
    }
}
