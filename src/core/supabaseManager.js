import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://hguresgswifsjamgypcg.supabase.co';
const DEFAULT_SUPABASE_SECRET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndXJlc2dzd2lmc2phbWd5cGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Mjc1MzksImV4cCI6MjEwNjEwMzUzOX0.B-pFItn9R0R3SIGvACysblN1-Wy6OhrhX27xspAsvtA';

export class SupabaseRealtimeManager {
    constructor() {
        this.client = null;
        this.channel = null;
        this.clientId = this.loadInitialClientId();
        this.username = this.loadInitialUsername();
        this.currentRoom = 'ocean-global-1';
        
        this.connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
        this.statusListeners = [];
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
        this.combatCallbacks = [];
        this.announcementCallbacks = [];
        this.leaderboardCallbacks = [];
        this.scoreSubmitCallbacks = [];
        
        this.peers = {};
        this.remotePresences = {};
        this.localPresence = null;
        this.lastBroadcastTime = 0;
        this.broadcastThrottleMs = 33; // ~30 fps smooth low-latency updates
        
        this.pingMs = 0;
        this.lastPingSent = 0;
        this.pingInterval = null;

        this.peers[this.clientId] = { id: this.clientId, username: this.username };
        
        this.setupUnloadListeners();
    }

    loadInitialClientId() {
        try {
            const saved = sessionStorage.getItem('sea_striker_client_id');
            if (saved && saved.startsWith('player_')) return saved;
            const newId = 'player_' + Math.random().toString(36).substring(2, 9);
            sessionStorage.setItem('sea_striker_client_id', newId);
            return newId;
        } catch (e) {
            return 'player_' + Math.random().toString(36).substring(2, 9);
        }
    }

    setupUnloadListeners() {
        if (typeof window === 'undefined') return;
        const handleUnload = () => {
            if (this.channel && this.connectionStatus === 'connected') {
                this.broadcast('peer_leave', { id: this.clientId, username: this.username });
                try {
                    this.channel.untrack();
                } catch (e) {}
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
    }

    loadInitialUsername() {
        try {
            const saved = localStorage.getItem('username');
            if (saved && saved.trim()) return saved.trim();
        } catch (e) {}
        const defaultName = 'Striker_' + Math.floor(100 + Math.random() * 900);
        try {
            localStorage.setItem('username', defaultName);
        } catch (e) {}
        return defaultName;
    }

    getCredentials() {
        let url = '';
        let key = '';

        // 1. Check client Vite build environment, prioritizing SUPABASE_SECRET_KEY / VITE_SUPABASE_SECRET_KEY
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
            key = import.meta.env.SUPABASE_SECRET_KEY ||
                  import.meta.env.VITE_SUPABASE_SECRET_KEY ||
                  import.meta.env.VITE_SUPABASE_ANON_KEY ||
                  import.meta.env.SUPABASE_ANON_KEY || '';
        }

        // 2. Check process.env (Node runtime or Vite define)
        if (!key && typeof process !== 'undefined' && process.env) {
            url = url || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
            key = process.env.SUPABASE_SECRET_KEY ||
                  process.env.VITE_SUPABASE_SECRET_KEY ||
                  process.env.VITE_SUPABASE_ANON_KEY ||
                  process.env.SUPABASE_ANON_KEY || '';
        }

        // 3. Fallback to default credentials
        if (!url || !key) {
            url = url || DEFAULT_SUPABASE_URL;
            key = key || DEFAULT_SUPABASE_SECRET_KEY;
        }

        return {
            url: url.trim(),
            key: key.trim(),
            roomCode: this.currentRoom
        };
    }

    hasCredentials() {
        const creds = this.getCredentials();
        return Boolean(creds.url && creds.key && creds.url.startsWith('http'));
    }

    onStatusChange(listener) {
        this.statusListeners.push(listener);
        listener(this.connectionStatus, { ping: this.pingMs, peersCount: Object.keys(this.peers).length });
    }

    notifyStatus(status, extra = {}) {
        this.connectionStatus = status;
        const info = {
            status,
            ping: this.pingMs,
            peersCount: Object.keys(this.peers).length,
            room: this.currentRoom,
            ...extra
        };
        for (const cb of this.statusListeners) {
            try {
                cb(status, info);
            } catch (err) {
                console.error('[Supabase] Status listener error:', err);
            }
        }
    }

    async connect(roomCode = null) {
        const targetRoom = roomCode ? roomCode.trim() : this.currentRoom;
        
        if (this.connectionStatus === 'connected' && this.channel && this.currentRoom === targetRoom) {
            return true;
        }
        
        this.currentRoom = targetRoom;
        await this.disconnect();
        this.notifyStatus('connecting');

        try {
            const creds = this.getCredentials();
            if (!creds.url || !creds.key) {
                this.notifyStatus('error', { error: 'No Supabase credentials configured.' });
                return false;
            }

            this.client = createClient(creds.url, creds.key, {
                realtime: {
                    params: {
                        eventsPerSecond: 50
                    }
                }
            });

            const channelName = `ocean-arena-${this.currentRoom}`;
            this.channel = this.client.channel(channelName, {
                config: {
                    presence: { key: this.clientId },
                    broadcast: { self: false }
                }
            });

            this.setupChannelListeners();

            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    if (this.connectionStatus !== 'connected') {
                        this.notifyStatus('error', { error: 'Connection timed out' });
                        resolve(false);
                    }
                }, 8000);

                this.channel.subscribe(async (status, err) => {
                    if (status === 'SUBSCRIBED') {
                        clearTimeout(timer);
                        this.notifyStatus('connected');
                        this.startPingLoop();

                        const initialPresence = {
                            id: this.clientId,
                            username: this.username,
                            joinedAt: Date.now(),
                            isAlive: false
                        };
                        try {
                            await this.channel.track(initialPresence);
                        } catch (trackErr) {
                            console.warn('[Supabase] Track error:', trackErr);
                        }

                        this.broadcast('peer_hello', {
                            id: this.clientId,
                            username: this.username
                        });

                        resolve(true);
                    } else if (status === 'CLOSED') {
                        this.notifyStatus('disconnected');
                    } else if (status === 'CHANNEL_ERROR') {
                        clearTimeout(timer);
                        this.notifyStatus('error', { error: err?.message || 'Supabase Channel Error' });
                        resolve(false);
                    }
                });
            });
        } catch (err) {
            console.error('[Supabase] Connect error:', err);
            this.notifyStatus('error', { error: err.message });
            return false;
        }
    }

    setupChannelListeners() {
        if (!this.channel) return;

        // 1. Presence Sync
        this.channel.on('presence', { event: 'sync' }, () => {
            const state = this.channel.presenceState();
            const newPeers = { ...this.peers };
            newPeers[this.clientId] = { id: this.clientId, username: this.username };

            for (const [key, presences] of Object.entries(state)) {
                if (presences && presences.length > 0) {
                    const latest = presences[presences.length - 1];
                    newPeers[key] = {
                        id: key,
                        username: latest.username || latest.name || ('Player_' + key.substring(0, 4))
                    };
                    // Only initialize remotePresence if we don't already have live position data for them
                    if (key !== this.clientId && !this.remotePresences[key] && latest.segments && latest.segments.length > 0) {
                        this.remotePresences[key] = latest;
                    }
                }
            }

            this.peers = newPeers;
            this.notifyPresenceUpdate();
            this.notifyStatus(this.connectionStatus);
        });

        // 2. Presence Join
        this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
            if (newPresences && newPresences.length > 0) {
                const latest = newPresences[newPresences.length - 1];
                this.peers[key] = {
                    id: key,
                    username: latest.username || latest.name || ('Player_' + key.substring(0, 4))
                };
                if (key !== this.clientId && !this.remotePresences[key] && latest.segments && latest.segments.length > 0) {
                    this.remotePresences[key] = latest;
                }
                this.notifyAnnouncement({
                    type: 'join',
                    username: this.peers[key].username
                });
                this.notifyPresenceUpdate();
            }
        });

        // 3. Presence Leave
        this.channel.on('presence', { event: 'leave' }, ({ key }) => {
            const leavingUser = this.peers[key]?.username;
            delete this.peers[key];
            delete this.remotePresences[key];
            if (leavingUser) {
                this.notifyAnnouncement({
                    type: 'leave',
                    username: leavingUser
                });
            }
            this.notifyPresenceUpdate();
        });

        // 3b. Fast explicit peer leave broadcast
        this.channel.on('broadcast', { event: 'peer_leave' }, ({ payload }) => {
            if (payload && payload.id) {
                const leavingUser = payload.username || this.peers[payload.id]?.username;
                delete this.peers[payload.id];
                delete this.remotePresences[payload.id];
                if (leavingUser) {
                    this.notifyAnnouncement({
                        type: 'leave',
                        username: leavingUser
                    });
                }
                this.notifyPresenceUpdate();
            }
        });

        // 3c. Global Leaderboard Realtime Sync
        this.channel.on('broadcast', { event: 'leaderboard_update' }, ({ payload }) => {
            if (payload) {
                for (const cb of this.leaderboardCallbacks) {
                    cb(payload);
                }
            }
        });

        this.channel.on('broadcast', { event: 'submit_score' }, ({ payload }) => {
            if (payload && payload.username) {
                for (const cb of this.scoreSubmitCallbacks) {
                    cb(payload);
                }
            }
        });

        // 4. Fast Position Update
        this.channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
            if (!payload || !payload.id || payload.id === this.clientId) return;
            const existing = this.remotePresences[payload.id];
            // Only drop if within a small out-of-order jitter window (<1200ms)
            // If payload.t jumped backwards by >1200ms, it's a page reload or clock reset, so accept it!
            if (existing && existing.t && payload.t) {
                if (payload.t < existing.t && (existing.t - payload.t) < 1200) {
                    return; // Drop delayed duplicate packet
                }
            }
            payload.lastSeen = performance.now();
            this.remotePresences[payload.id] = payload;
            if (payload.name && !this.peers[payload.id]) {
                this.peers[payload.id] = { id: payload.id, username: payload.name };
            }
            this.notifyPresenceUpdate();
        });

        // 5. Combat Action
        this.channel.on('broadcast', { event: 'combat_action' }, ({ payload }) => {
            if (!payload) return;
            if (payload.targetId === this.clientId) {
                for (const cb of this.presenceRequestCallbacks) {
                    cb(payload.updateRequest, payload.fromClientId);
                }
            }
            for (const cb of this.combatCallbacks) {
                cb(payload);
            }
        });

        // 6. Ink Clouds
        this.channel.on('broadcast', { event: 'ink_cloud' }, ({ payload }) => {
            if (!payload || payload.senderId === this.clientId) return;
            if (typeof window !== 'undefined' && window.game && window.game.inkSystem) {
                window.game.inkSystem.addRemoteInkCloud(payload.cloud);
            }
        });

        // 7. Announcements / Kill Feed
        this.channel.on('broadcast', { event: 'kill_announcement' }, ({ payload }) => {
            if (payload) {
                this.notifyAnnouncement(payload);
            }
        });

        // 8. Ping / Pong
        this.channel.on('broadcast', { event: 'ping' }, ({ payload }) => {
            if (payload && payload.senderId !== this.clientId) {
                this.channel.send({
                    type: 'broadcast',
                    event: 'pong',
                    payload: { targetId: payload.senderId, t: payload.t }
                }).catch(() => {});
            }
        });

        this.channel.on('broadcast', { event: 'pong' }, ({ payload }) => {
            if (payload && payload.targetId === this.clientId && payload.t) {
                this.pingMs = Math.max(1, Math.round(performance.now() - payload.t));
                this.notifyStatus(this.connectionStatus);
            }
        });
    }

    startPingLoop() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if (this.channel && this.connectionStatus === 'connected') {
                this.lastPingSent = performance.now();
                this.channel.send({
                    type: 'broadcast',
                    event: 'ping',
                    payload: { senderId: this.clientId, t: this.lastPingSent }
                }).catch(() => {});

                // Gracefully prune stale remote presences with no updates for > 7 seconds
                const now = performance.now();
                let pruned = false;
                for (const id in this.remotePresences) {
                    const pres = this.remotePresences[id];
                    if (pres && pres.lastSeen && (now - pres.lastSeen > 7000)) {
                        delete this.remotePresences[id];
                        delete this.peers[id];
                        pruned = true;
                    }
                }
                if (pruned) {
                    this.notifyPresenceUpdate();
                }
            }
        }, 3000);
    }

    async disconnect() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        if (this.channel) {
            try {
                await this.channel.untrack();
            } catch (e) {}
            try {
                this.client?.removeChannel(this.channel);
            } catch (e) {}
            this.channel = null;
        }

        this.client = null;
        this.remotePresences = {};
        this.peers = { [this.clientId]: { id: this.clientId, username: this.username } };
        this.notifyStatus('disconnected');
    }

    broadcast(event, payload) {
        if (!this.channel || this.connectionStatus !== 'connected') return;
        this.channel.send({
            type: 'broadcast',
            event,
            payload
        }).catch(() => {});
    }

    sendPresenceUpdate(presenceData) {
        if (!presenceData) return;
        this.localPresence = presenceData;

        const now = performance.now();
        if (now - this.lastBroadcastTime >= this.broadcastThrottleMs) {
            this.lastBroadcastTime = now;
            
            // Clean minimal payload for high performance
            const compactPayload = {
                id: this.clientId,
                name: presenceData.name || this.username,
                x: presenceData.x,
                y: presenceData.y,
                segments: presenceData.segments,
                color: presenceData.color,
                velocity: presenceData.velocity,
                isDashing: presenceData.isDashing,
                isDodging: presenceData.isDodging,
                isAlive: presenceData.isAlive,
                kills: presenceData.kills,
                health: presenceData.health,
                type: presenceData.type,
                skinId: presenceData.skinId,
                isHiddenInReef: presenceData.isHiddenInReef,
                rotationAngle: presenceData.rotationAngle,
                t: now
            };

            this.broadcast('pos', compactPayload);
        }
    }

    sendCombatRequest(targetId, updateRequest) {
        this.broadcast('combat_action', {
            targetId,
            updateRequest,
            fromClientId: this.clientId
        });
    }

    sendInkCloud(cloud) {
        this.broadcast('ink_cloud', {
            senderId: this.clientId,
            cloud
        });
    }

    sendKillAnnouncement(killerName, victimName) {
        this.broadcast('kill_announcement', {
            type: 'kill',
            killer: killerName,
            victim: victimName,
            time: Date.now()
        });
    }

    notifyPresenceUpdate() {
        const combined = { ...this.remotePresences };
        if (this.localPresence) {
            combined[this.clientId] = this.localPresence;
        }
        for (const cb of this.presenceCallbacks) {
            cb(combined);
        }
    }

    notifyAnnouncement(data) {
        for (const cb of this.announcementCallbacks) {
            cb(data);
        }
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    subscribeCombat(callback) {
        this.combatCallbacks.push(callback);
    }

    subscribeAnnouncements(callback) {
        this.announcementCallbacks.push(callback);
    }

    subscribeLeaderboard(callback) {
        this.leaderboardCallbacks.push(callback);
    }

    subscribeScoreSubmit(callback) {
        this.scoreSubmitCallbacks.push(callback);
    }

    sendLeaderboardUpdate(leaderboardData) {
        this.broadcast('leaderboard_update', leaderboardData);
    }

    sendScoreSubmit(scoreData) {
        this.broadcast('submit_score', scoreData);
    }

    setUsername(newUsername) {
        if (!newUsername || !newUsername.trim()) return;
        this.username = newUsername.trim().substring(0, 16);
        try {
            localStorage.setItem('username', this.username);
        } catch (e) {}

        this.peers[this.clientId] = { id: this.clientId, username: this.username };

        if (this.channel && this.connectionStatus === 'connected') {
            this.channel.track({
                id: this.clientId,
                username: this.username,
                isAlive: this.localPresence ? this.localPresence.isAlive : false
            }).catch(() => {});
        }
    }
}
