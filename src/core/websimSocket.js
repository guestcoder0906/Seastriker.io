import { io } from "socket.io-client";
import { joinRoom as joinMqttRoom, selfId as mqttSelfId } from "@trystero-p2p/mqtt";
import { joinRoom as joinTorrentRoom, selfId as torrentSelfId } from "@trystero-p2p/torrent";

// Dedicated WebSocket Proxies (MQTT & WebTorrent) for real-time global connectivity on Vercel & serverless deployments
const DEDICATED_MQTT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://public.cloud.shiftr.io'
];

const DEDICATED_TORRENT_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.webtorrent.dev'
];

function bindAction(room, actionName) {
    if (!room || typeof room.makeAction !== 'function') {
        return { send: () => {}, onMessage: () => {} };
    }
    try {
        const res = room.makeAction(actionName);
        if (Array.isArray(res)) {
            return {
                send: (data, targetId) => {
                    try {
                        if (targetId) {
                            res[0](data, targetId);
                        } else {
                            res[0](data);
                        }
                    } catch (e) {
                        try { res[0](data); } catch (err) {}
                    }
                },
                onMessage: (handler) => res[1](handler)
            };
        }
        if (res && typeof res === 'object') {
            return {
                send: (data, targetId) => {
                    try {
                        if (typeof res.send === 'function') {
                            res.send(data, targetId ? { target: targetId } : undefined);
                        }
                    } catch (e) {}
                },
                onMessage: (handler) => {
                    if ('onMessage' in res) {
                        res.onMessage = (data, meta) => {
                            const peerId = typeof meta === 'string' ? meta : (meta?.peerId || '');
                            handler(data, peerId);
                        };
                    }
                }
            };
        }
    } catch (e) {
        console.warn(`[Network] Action bind failed for ${actionName}:`, e);
    }
    return { send: () => {}, onMessage: () => {} };
}

export class WebsimSocket {
    constructor() {
        const savedClientId = typeof localStorage !== 'undefined' ? localStorage.getItem('ocean_player_id') : null;
        this.clientId = savedClientId || mqttSelfId || torrentSelfId || ("player_" + Math.random().toString(36).substring(2, 9) + "_" + Math.floor(Math.random() * 1000));
        try { localStorage.setItem('ocean_player_id', this.clientId); } catch (e) {}

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
        this.p2pRoom = null;
        this.broadcastChannel = null;

        this.isServerConnected = false;
        this.isP2PConnected = false;
        this.isBroadcastActive = false;
        this.isConnecting = true;
        this.lastPresenceEmit = 0;
        this._recentDamage = {};

        // P2P Action dispatchers
        this.actions = null;

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

        this.initBroadcastChannel();
    }

    initBroadcastChannel() {
        if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
        try {
            this.broadcastChannel = new BroadcastChannel('seastriker_ocean_multiplayer');
            this.isBroadcastActive = true;
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
                        kills: this.peers[this.clientId]?.kills || 0
                    });
                    this.notifyStatus();
                } else if (msg.type === 'peerSync') {
                    this.peers[msg.fromId] = {
                        id: msg.fromId,
                        username: msg.username || 'Player',
                        kills: msg.kills || 0
                    };
                    this.notifyStatus();
                } else if (msg.type === 'peerLeft') {
                    delete this.peers[msg.fromId];
                    delete this.localPresences[msg.fromId];
                    this.notifyStatus();
                    for (const cb of this.presenceCallbacks) cb(this.localPresences);
                } else if (msg.type === 'presence') {
                    this.handleIncomingPresence(msg.fromId, msg.data);
                } else if (msg.type === 'attackPlayer' && msg.targetId === this.clientId) {
                    this.handleIncomingDamage(msg.data);
                } else if (msg.type === 'presenceUpdateRequest' && msg.targetId === this.clientId) {
                    for (const cb of this.presenceRequestCallbacks) {
                        cb(msg.data.updateRequest, msg.fromId);
                    }
                } else if (msg.type === 'killBroadcast') {
                    this.handleIncomingKill(msg.data);
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
            console.warn('[BroadcastChannel] init error:', e);
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

        // 1. Connect to Dedicated WebSocket / Socket.IO server (runs on Cloud Run, dev server, or configured proxy)
        await this.trySocketIo();

        // 2. Initialize Dedicated WebSocket Proxy P2P Mesh (MQTT Brokers & WebTorrent for Vercel & serverless)
        this.initP2PMesh();

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
        this.notifyStatus();
    }

    trySocketIo() {
        return new Promise((resolve) => {
            try {
                // Determine WebSocket server / proxy target
                let targetUrl = undefined;
                if (typeof window !== 'undefined') {
                    const customProxy = window.WEBSOCKET_PROXY_URL || 
                        (window.localStorage && window.localStorage.getItem('ocean_ws_proxy')) ||
                        (typeof process !== 'undefined' && process.env?.VITE_WS_PROXY_URL) ||
                        (import.meta?.env?.VITE_WS_PROXY_URL);

                    if (customProxy) {
                        targetUrl = customProxy;
                    }
                }

                this.socket = io(targetUrl, {
                    auth: { 
                        username: this.username,
                        clientId: this.clientId 
                    },
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 4,
                    timeout: 2500
                });

                this.socket.on('connect', () => {
                    this.isServerConnected = true;
                    if (this.socket.id) {
                        const oldId = this.clientId;
                        this.clientId = this.socket.id;
                        if (oldId && oldId !== this.clientId) {
                            delete this.peers[oldId];
                            delete this.localPresences[oldId];
                        }
                        this.peers[this.clientId] = { id: this.clientId, username: this.username, kills: 0 };
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    this.notifyStatus();
                    resolve();
                });

                this.socket.on('init', (data) => {
                    this.isServerConnected = true;
                    if (data.id) {
                        this.clientId = data.id;
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    if (data.roomState) this.roomState = data.roomState;
                    if (data.peers) {
                        for (const pid in data.peers) {
                            if (!pid.startsWith('ai-')) {
                                this.peers[pid] = data.peers[pid];
                            }
                        }
                    }
                    if (data.bots) {
                        this.localPresences = { ...data.bots, ...this.localPresences };
                    }
                    this.notifyStatus();
                    resolve();
                });

                this.socket.on('networkTick', (data) => {
                    if (!data) return;
                    if (data.peers) {
                        for (const pid in data.peers) {
                            if (!pid.startsWith('ai-')) {
                                this.peers[pid] = data.peers[pid];
                            }
                        }
                    }
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
                this.socket.on('presenceUpdateRequest', (data) => {
                    if (!data || !data.updateRequest) return;
                    for (const cb of this.presenceRequestCallbacks) {
                        cb(data.updateRequest, data.fromClientId);
                    }
                });
                this.socket.on('killBroadcast', (data) => this.handleIncomingKill(data));
                this.socket.on('killAwarded', (data) => this.handleKillAwarded(data));

                this.socket.on('peerJoined', (peer) => {
                    if (peer && peer.id && !peer.id.startsWith('ai-')) {
                        this.peers[peer.id] = peer;
                        this.notifyStatus();
                    }
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

                setTimeout(resolve, 2000);
            } catch (e) {
                resolve();
            }
        });
    }

    initP2PMesh() {
        const appId = 'seastriker-ocean-global-2026';
        const roomId = 'ocean-main-arena';

        // 1. Try Dedicated WebSocket MQTT Proxies (works everywhere, ideal for Vercel)
        try {
            this.p2pRoom = joinMqttRoom({
                appId,
                relayUrls: DEDICATED_MQTT_BROKERS
            }, roomId);
        } catch (e) {
            console.warn('[Network] MQTT proxy room failed, falling back to WebTorrent:', e);
            try {
                this.p2pRoom = joinTorrentRoom({
                    appId,
                    trackerUrls: DEDICATED_TORRENT_TRACKERS
                }, roomId);
            } catch (err) {
                console.error('[Network] All P2P signaling failed:', err);
                return;
            }
        }

        if (!this.p2pRoom) return;

        const presenceAction = bindAction(this.p2pRoom, 'presence');
        const peerInfoAction = bindAction(this.p2pRoom, 'peerInfo');
        const attackPlayerAction = bindAction(this.p2pRoom, 'attackPlayer');
        const presenceRequestAction = bindAction(this.p2pRoom, 'presenceRequest');
        const killBroadcastAction = bindAction(this.p2pRoom, 'killBroadcast');

        this.actions = {
            sendPresence: (data, targetId) => presenceAction.send(data, targetId),
            sendPeerInfo: (data, targetId) => peerInfoAction.send(data, targetId),
            sendAttackPlayer: (data, targetId) => attackPlayerAction.send(data, targetId),
            sendPresenceRequest: (data, targetId) => presenceRequestAction.send(data, targetId),
            sendKillBroadcast: (data, targetId) => killBroadcastAction.send(data, targetId)
        };

        const handlePeerJoin = (peerId) => {
            this.isP2PConnected = true;
            this.peers[peerId] = { id: peerId, username: 'Player', kills: 0 };
            
            peerInfoAction.send({
                id: this.clientId,
                username: this.username,
                kills: this.peers[this.clientId]?.kills || 0
            });

            if (this.localPresences[this.clientId]) {
                presenceAction.send(this.localPresences[this.clientId]);
            }
            this.notifyStatus();
        };

        const handlePeerLeave = (peerId) => {
            delete this.peers[peerId];
            delete this.localPresences[peerId];
            this.notifyStatus();
            for (const cb of this.presenceCallbacks) cb(this.localPresences);
        };

        if (typeof this.p2pRoom.onPeerJoin === 'function') {
            this.p2pRoom.onPeerJoin(handlePeerJoin);
        } else {
            this.p2pRoom.onPeerJoin = handlePeerJoin;
        }

        if (typeof this.p2pRoom.onPeerLeave === 'function') {
            this.p2pRoom.onPeerLeave(handlePeerLeave);
        } else {
            this.p2pRoom.onPeerLeave = handlePeerLeave;
        }

        peerInfoAction.onMessage((data, peerId) => {
            if (!data) return;
            this.isP2PConnected = true;
            const actualId = data.id || peerId;
            this.peers[actualId] = {
                id: actualId,
                username: data.username || 'Player',
                kills: data.kills || 0
            };
            this.notifyStatus();
        });

        presenceAction.onMessage((data, peerId) => {
            const actualId = data?.id || peerId;
            this.handleIncomingPresence(actualId, data);
        });

        attackPlayerAction.onMessage((data, attackerId) => {
            if (!data || (data.targetId && data.targetId !== this.clientId)) return;
            this.handleIncomingDamage({
                attackerId: data.attackerId || attackerId,
                attackerName: data.attackerName || this.peers[attackerId]?.username || 'Player',
                damage: data.damage,
                hitType: data.hitType,
                knockbackAngle: data.angle,
                knockbackForce: data.knockbackForce
            });
        });

        presenceRequestAction.onMessage((data, senderId) => {
            if (!data || (data.targetId && data.targetId !== this.clientId)) return;
            for (const cb of this.presenceRequestCallbacks) {
                cb(data.updateRequest, data.fromClientId || senderId);
            }
        });

        killBroadcastAction.onMessage((data) => {
            this.handleIncomingKill(data);
        });
    }

    handleIncomingPresence(peerId, data) {
        if (!data || peerId.startsWith('ai-')) return;
        data.id = peerId;
        data.name = this.peers[peerId]?.username || data.name || 'Player';
        this.localPresences[peerId] = data;
        for (const cb of this.presenceCallbacks) {
            cb(this.localPresences);
        }
    }

    handleIncomingDamage(data) {
        if (!data) return;
        const now = performance.now();
        const damageKey = `${data.attackerId}_${data.damage}_${data.hitType}`;
        if (this._recentDamage[damageKey] && (now - this._recentDamage[damageKey] < 180)) {
            return; // Deduplicate multi-channel delivery
        }
        this._recentDamage[damageKey] = now;

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
            const currentKills = (this.peers[this.clientId]?.kills || 0) + 1;
            this.handleKillAwarded({
                victimName: data.victimName,
                kills: currentKills
            });
        }
    }

    handleKillAwarded(data) {
        if (!data) return;
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
            window.game.updateLeaderboard(true);
        }
    }

    // Return count of REAL human players (AIs NEVER count as players)
    getRealPlayerCount() {
        const humanPeers = Object.values(this.peers || {}).filter(p => p && p.id && !p.id.startsWith('ai-'));
        return Math.max(1, humanPeers.length);
    }

    // Compatible alias: strictly returns REAL players count
    getOnlineCount() {
        return this.getRealPlayerCount();
    }

    // Count of AI bots / ocean wildlife (distinct from real players)
    getAIBotCount() {
        if (typeof window !== 'undefined' && window.game?.aiController?.aiPlayers) {
            return Object.keys(window.game.aiController.aiPlayers).length;
        }
        return 6;
    }

    notifyStatus() {
        const realPlayersCount = this.getRealPlayerCount();
        const aiBotCount = this.getAIBotCount();
        const status = {
            connected: this.isServerConnected || this.isP2PConnected || this.isBroadcastActive,
            connecting: this.isConnecting,
            playersCount: realPlayersCount,
            aiCount: aiBotCount,
            isServerConnected: this.isServerConnected,
            isP2PConnected: this.isP2PConnected,
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

    // High performance compact presence serialization
    packPresence(data) {
        if (!data) return null;
        return {
            id: this.clientId,
            x: Math.round(data.x * 10) / 10,
            y: Math.round(data.y * 10) / 10,
            angle: Math.round((data.angle || 0) * 100) / 100,
            segments: data.segments ? data.segments.map(s => ({
                x: Math.round(s.x * 10) / 10,
                y: Math.round(s.y * 10) / 10,
                angle: Math.round(s.angle * 100) / 100,
                scale: s.scale,
                round: s.round
            })) : [],
            color: data.color,
            name: this.username || data.name,
            type: data.type,
            skinId: data.skinId,
            isDashing: !!data.isDashing,
            isDodging: !!data.isDodging,
            isAlive: !!data.isAlive,
            health: data.health !== undefined ? Math.round(data.health) : 100,
            kills: data.kills || 0
        };
    }

    updatePresence(data) {
        if (!data) return;
        this.localPresences[this.clientId] = { ...data, id: this.clientId, name: this.username };
        const now = performance.now();

        // 40ms throttle (~25Hz update rate)
        if (now - this.lastPresenceEmit >= 40) {
            this.lastPresenceEmit = now;
            const packed = this.packPresence(data);

            if (this.socket && this.socket.connected) {
                this.socket.emit('updatePresence', packed);
            }

            if (this.actions?.sendPresence) {
                try { this.actions.sendPresence(packed); } catch (e) {}
            }

            if (this.broadcastChannel) {
                try {
                    this.broadcastChannel.postMessage({
                        type: 'presence',
                        fromId: this.clientId,
                        data: packed
                    });
                } catch (e) {}
            }
        }
    }

    attackPlayer(targetId, damage, hitType = 'bodyHit', angle = 0, knockbackForce = 6) {
        if (!targetId || targetId === this.clientId) return;
        const payload = {
            targetId,
            attackerId: this.clientId,
            attackerName: this.username,
            damage,
            hitType,
            angle,
            knockbackForce
        };

        if (this.socket && this.socket.connected) {
            this.socket.emit('attackPlayer', payload);
        }

        if (this.actions?.sendAttackPlayer) {
            try { this.actions.sendAttackPlayer(payload, targetId); } catch (e) {}
        }

        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: 'attackPlayer',
                    fromId: this.clientId,
                    targetId,
                    data: payload
                });
            } catch (e) {}
        }
    }

    attackBot(botId, damage, hitType = 'bodyHit', angle = 0) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackBot', { botId, damage, hitType, angle });
        }
    }

    notifyDeath(killerId) {
        const killerName = (killerId && this.peers[killerId]?.username) || 'Ocean';
        const broadcast = {
            killerId: killerId || null,
            killerName,
            victimId: this.clientId,
            victimName: this.username
        };

        if (this.socket && this.socket.connected) {
            this.socket.emit('playerDied', { killerId });
        }

        if (this.actions?.sendKillBroadcast) {
            try { this.actions.sendKillBroadcast(broadcast); } catch (e) {}
        }

        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: 'killBroadcast',
                    fromId: this.clientId,
                    data: broadcast
                });
            } catch (e) {}
        }

        for (const cb of this.killBroadcastCallbacks) cb(broadcast);
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (!targetId || targetId === this.clientId) return;
        const payload = { targetId, updateRequest, fromClientId: this.clientId };

        if (this.socket && this.socket.connected) {
            this.socket.emit('requestPresenceUpdate', payload);
        }

        if (this.actions?.sendPresenceRequest) {
            try { this.actions.sendPresenceRequest(payload, targetId); } catch (e) {}
        }

        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: 'presenceUpdateRequest',
                    fromId: this.clientId,
                    targetId,
                    data: payload
                });
            } catch (e) {}
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

        if (this.actions?.sendPeerInfo) {
            try { this.actions.sendPeerInfo(info); } catch (e) {}
        }

        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: 'peerSync',
                    fromId: this.clientId,
                    ...info
                });
            } catch (e) {}
        }

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
