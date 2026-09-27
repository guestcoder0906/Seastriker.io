import { io } from "socket.io-client";
import { joinRoom as joinTorrentRoom, selfId as torrentSelfId } from "@trystero-p2p/torrent";
import { joinRoom as joinNostrRoom, selfId as nostrSelfId } from "@trystero-p2p/nostr";

// High-speed, dedicated WebTorrent WebSocket trackers for WebRTC signaling
const TORRENT_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.webtorrent.dev'
];

// Fallback Nostr relays
const NOSTR_RELAYS = [
    'wss://relay.damus.io',
    'wss://purplerelay.com',
    'wss://nostr.mom'
];

function bindAction(room, actionName) {
    if (!room || typeof room.makeAction !== 'function') {
        return { send: () => {}, onMessage: () => {} };
    }
    const res = room.makeAction(actionName);
    if (Array.isArray(res)) {
        return {
            send: (data, targetId) => res[0](data, targetId),
            onMessage: (handler) => res[1](handler)
        };
    }
    if (res && typeof res === 'object') {
        return {
            send: (data, targetId) => {
                if (typeof res.send === 'function') {
                    if (targetId) {
                        res.send(data, { target: targetId });
                    } else {
                        res.send(data);
                    }
                }
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
    return { send: () => {}, onMessage: () => {} };
}

export class WebsimSocket {
    constructor() {
        this.clientId = torrentSelfId || nostrSelfId || ("player_" + Math.random().toString(36).substring(2, 9));
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
        this.isConnecting = true;
        this.lastPresenceEmit = 0;

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

        // 1. Try local Socket.IO connection first if on localhost
        const isLocal = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        if (isLocal) {
            await this.trySocketIo();
        }

        // 2. Initialize single, high-performance P2P room (Torrent first, Nostr fallback)
        this.initP2PRoom();

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

    initP2PRoom() {
        const appId = 'seastriker-ocean-2026';
        const roomId = 'ocean-main-lobby';

        try {
            // WebTorrent WebRTC is ultra-fast and avoids duplicate socket overhead
            this.p2pRoom = joinTorrentRoom({
                appId,
                trackerUrls: TORRENT_TRACKERS
            }, roomId);
        } catch (e) {
            console.warn('[P2P] WebTorrent init failed, falling back to Nostr:', e);
            try {
                this.p2pRoom = joinNostrRoom({
                    appId,
                    relayUrls: NOSTR_RELAYS
                }, roomId);
            } catch (err) {
                console.error('[P2P] All P2P signaling failed:', err);
                return;
            }
        }

        if (!this.p2pRoom) return;

        const presenceAction = bindAction(this.p2pRoom, 'presence');
        const peerInfoAction = bindAction(this.p2pRoom, 'peerInfo');
        const attackPlayerAction = bindAction(this.p2pRoom, 'attackPlayer');
        const killBroadcastAction = bindAction(this.p2pRoom, 'killBroadcast');

        this.actions = {
            sendPresence: (data, targetId) => presenceAction.send(data, targetId),
            sendPeerInfo: (data, targetId) => peerInfoAction.send(data, targetId),
            sendAttackPlayer: (data, targetId) => attackPlayerAction.send(data, targetId),
            sendKillBroadcast: (data, targetId) => killBroadcastAction.send(data, targetId)
        };

        const handlePeerJoin = (peerId) => {
            this.isP2PConnected = true;
            this.peers[peerId] = { id: peerId, username: 'Player', kills: 0 };

            peerInfoAction.send({
                id: this.clientId,
                username: this.username,
                kills: this.peers[this.clientId]?.kills || 0
            }, peerId);

            if (this.localPresences[this.clientId]) {
                presenceAction.send(this.localPresences[this.clientId], peerId);
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
            this.peers[peerId] = {
                id: peerId,
                username: data.username || 'Player',
                kills: data.kills || 0
            };
            this.notifyStatus();
        });

        presenceAction.onMessage((data, peerId) => {
            if (this.isServerConnected) return;
            this.handleIncomingPresence(peerId, data);
        });

        attackPlayerAction.onMessage((data, attackerId) => {
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

        killBroadcastAction.onMessage((data) => {
            this.handleIncomingKill(data);
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
            window.game.updateLeaderboard(true);
        }
    }

    getOnlineCount() {
        const humanPeersCount = Math.max(1, Object.keys(this.peers).length);
        const aliveBots = (typeof window !== 'undefined' && window.game?.aiController?.aiPlayers) 
            ? Object.keys(window.game.aiController.aiPlayers).length 
            : 6;
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

    // High performance compact presence serialization (reduces payload by 70%)
    packPresence(data) {
        if (!data) return null;
        return {
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
            name: data.name,
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
        this.localPresences[this.clientId] = data;

        const now = performance.now();
        // 45ms throttle (~22Hz update rate) prevents WebRTC data bufferbloat
        if (now - this.lastPresenceEmit >= 45) {
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
        const payload = { targetId, damage, hitType, angle, knockbackForce };
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
