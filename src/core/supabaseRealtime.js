import { createClient } from "@supabase/supabase-js";

export class SupabaseRealtimeService {
    constructor(options = {}) {
        this.clientId = options.clientId || "player_" + Math.random().toString(36).substring(2, 9);
        this.username = options.username || "Player_" + Math.floor(100 + Math.random() * 900);
        
        // Configuration
        this.url = options.url || "";
        this.anonKey = options.anonKey || "";
        this.roomName = options.roomName || "seastriker-ocean-arena";
        
        this.client = null;
        this.channel = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.status = "disconnected"; // disconnected, connecting, connected, error
        this.errorMessage = "";
        
        // Presence & state
        this.peers = {};
        this.remotePresences = {};
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
        this.statusCallbacks = [];
        this.roomStateCallbacks = [];
        
        // Throttling for broadcast updates to keep network fast and within limits
        this.lastBroadcastTime = 0;
        this.pendingPresenceData = null;
        this.broadcastIntervalMs = 33; // ~30 updates per second
        this.broadcastTimer = null;
    }

    onStatusChange(callback) {
        this.statusCallbacks.push(callback);
    }

    notifyStatus(status, message = "") {
        this.status = status;
        this.errorMessage = message;
        this.isConnected = status === "connected";
        this.isConnecting = status === "connecting";
        for (const cb of this.statusCallbacks) {
            try {
                cb({ status, message, isConnected: this.isConnected, roomName: this.roomName });
            } catch (err) {
                console.error("[SupabaseRealtime] Status callback error:", err);
            }
        }
    }

    setUsername(newUsername) {
        this.username = newUsername;
        if (this.peers[this.clientId]) {
            this.peers[this.clientId].username = newUsername;
        }
        if (this.isConnected && this.channel) {
            this.channel.track({
                id: this.clientId,
                username: newUsername,
                updatedAt: Date.now()
            }).catch(() => {});
        }
    }

    async connect(config = {}) {
        if (config.url) this.url = config.url.trim();
        if (config.anonKey) this.anonKey = config.anonKey.trim();
        if (config.roomName) this.roomName = config.roomName.trim();
        if (config.username) this.username = config.username.trim();

        if (!this.url || !this.anonKey) {
            this.notifyStatus("error", "Supabase Project URL and Anon API Key are required.");
            return false;
        }

        // Validate URL format
        try {
            const parsed = new URL(this.url);
            if (!parsed.protocol.startsWith("http")) {
                throw new Error("URL must start with https://");
            }
        } catch (e) {
            this.notifyStatus("error", "Invalid Supabase Project URL format (must be https://your-project.supabase.co).");
            return false;
        }

        // Clean up any existing connection
        await this.disconnect();

        this.notifyStatus("connecting", `Connecting to Supabase channel "${this.roomName}"...`);

        try {
            this.client = createClient(this.url, this.anonKey, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                },
                realtime: {
                    params: {
                        eventsPerSecond: 35
                    }
                }
            });

            this.channel = this.client.channel(this.roomName, {
                config: {
                    presence: { key: this.clientId },
                    broadcast: { self: false, ack: false }
                }
            });

            // 1. Presence tracking: sync, join, leave
            this.channel.on("presence", { event: "sync" }, () => {
                const presenceState = this.channel.presenceState();
                const newPeers = { ...this.peers };
                
                // Keep local peer
                newPeers[this.clientId] = { id: this.clientId, username: this.username };

                for (const key in presenceState) {
                    if (key !== this.clientId && Array.isArray(presenceState[key]) && presenceState[key].length > 0) {
                        const latest = presenceState[key][0];
                        newPeers[key] = {
                            id: key,
                            username: latest.username || "Player_" + key.substring(0, 4)
                        };
                    }
                }

                // Remove peers that are no longer in presence state
                for (const pId in newPeers) {
                    if (pId !== this.clientId && !presenceState[pId]) {
                        delete newPeers[pId];
                        delete this.remotePresences[pId];
                    }
                }

                this.peers = newPeers;
                this.notifyPresences();
            });

            this.channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
                if (key !== this.clientId && newPresences && newPresences.length > 0) {
                    const info = newPresences[0];
                    this.peers[key] = {
                        id: key,
                        username: info.username || "Player_" + key.substring(0, 4)
                    };
                    this.notifyPresences();
                }
            });

            this.channel.on("presence", { event: "leave" }, ({ key }) => {
                if (key !== this.clientId) {
                    delete this.peers[key];
                    delete this.remotePresences[key];
                    this.notifyPresences();
                }
            });

            // 2. High-speed broadcast: movement & creature state
            this.channel.on("broadcast", { event: "presenceUpdate" }, ({ payload }) => {
                if (!payload || !payload.clientId || payload.clientId === this.clientId) return;
                
                const cId = payload.clientId;
                if (payload.data) {
                    this.remotePresences[cId] = payload.data;
                    if (payload.data.name && (!this.peers[cId] || this.peers[cId].username !== payload.data.name)) {
                        this.peers[cId] = { id: cId, username: payload.data.name };
                    }
                    this.notifyPresences();
                }
            });

            // 3. Combat & collision requests (tusk hits, body hits, ink clouds, knockback, lethal damage, kills)
            this.channel.on("broadcast", { event: "combatRequest" }, ({ payload }) => {
                if (!payload) return;
                
                // If this message is targeted at us
                if (payload.targetId === this.clientId) {
                    for (const cb of this.presenceRequestCallbacks) {
                        try {
                            cb(payload.updateRequest, payload.fromClientId);
                        } catch (err) {
                            console.error("[SupabaseRealtime] Error executing combat callback:", err);
                        }
                    }
                }
            });

            // 4. Room state / leaderboard synchronization
            this.channel.on("broadcast", { event: "roomStateSync" }, ({ payload }) => {
                if (!payload) return;
                for (const cb of this.roomStateCallbacks) {
                    try {
                        cb(payload);
                    } catch (err) {}
                }
            });

            // 5. Subscribe to channel
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (!this.isConnected) {
                        this.notifyStatus("error", "Supabase Realtime connection timed out (check project URL and API key).");
                        resolve(false);
                    }
                }, 8000);

                this.channel.subscribe(async (status) => {
                    if (status === "SUBSCRIBED") {
                        clearTimeout(timeout);
                        this.notifyStatus("connected", `Connected to Supabase Realtime channel "${this.roomName}"`);
                        
                        // Register local presence
                        try {
                            await this.channel.track({
                                id: this.clientId,
                                username: this.username,
                                joinedAt: Date.now()
                            });
                        } catch (e) {
                            console.warn("[SupabaseRealtime] Track presence warning:", e);
                        }
                        
                        resolve(true);
                    } else if (status === "CHANNEL_ERROR") {
                        clearTimeout(timeout);
                        this.notifyStatus("error", "Supabase channel error: Check your Supabase URL, anon key, and project status.");
                        resolve(false);
                    } else if (status === "TIMED_OUT") {
                        clearTimeout(timeout);
                        this.notifyStatus("error", "Supabase channel connection timed out.");
                        resolve(false);
                    } else if (status === "CLOSED") {
                        this.notifyStatus("disconnected", "Supabase channel closed.");
                    }
                });
            });

        } catch (err) {
            console.error("[SupabaseRealtime] Connection error:", err);
            this.notifyStatus("error", err.message || "Failed to initialize Supabase client.");
            return false;
        }
    }

    async disconnect() {
        if (this.broadcastTimer) {
            clearTimeout(this.broadcastTimer);
            this.broadcastTimer = null;
        }

        if (this.channel && this.client) {
            try {
                await this.channel.untrack().catch(() => {});
                await this.client.removeChannel(this.channel);
            } catch (e) {}
            this.channel = null;
        }
        this.client = null;
        this.remotePresences = {};
        this.peers = { [this.clientId]: { id: this.clientId, username: this.username } };
        this.notifyStatus("disconnected");
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    subscribeRoomState(callback) {
        this.roomStateCallbacks.push(callback);
    }

    notifyPresences() {
        const snapshot = { ...this.remotePresences };
        for (const cb of this.presenceCallbacks) {
            try {
                cb(snapshot);
            } catch (err) {}
        }
    }

    updatePresence(data) {
        if (!data) return;
        this.pendingPresenceData = data;
        
        const now = performance.now();
        if (now - this.lastBroadcastTime >= this.broadcastIntervalMs) {
            this.flushPresenceBroadcast();
        } else if (!this.broadcastTimer) {
            this.broadcastTimer = setTimeout(() => {
                this.broadcastTimer = null;
                this.flushPresenceBroadcast();
            }, this.broadcastIntervalMs - (now - this.lastBroadcastTime));
        }
    }

    flushPresenceBroadcast() {
        if (!this.pendingPresenceData || !this.isConnected || !this.channel) return;
        
        this.lastBroadcastTime = performance.now();
        const payload = {
            clientId: this.clientId,
            data: this.pendingPresenceData
        };

        this.channel.send({
            type: "broadcast",
            event: "presenceUpdate",
            payload
        }).catch(() => {});
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (!targetId || !this.channel || !this.isConnected) return;

        this.channel.send({
            type: "broadcast",
            event: "combatRequest",
            payload: {
                targetId,
                updateRequest,
                fromClientId: this.clientId
            }
        }).catch((err) => {
            console.error("[SupabaseRealtime] Error broadcasting combat request:", err);
        });
    }

    sendRoomState(roomStateData) {
        if (!this.channel || !this.isConnected) return;
        this.channel.send({
            type: "broadcast",
            event: "roomStateSync",
            payload: roomStateData
        }).catch(() => {});
    }
}
