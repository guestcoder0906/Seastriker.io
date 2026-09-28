import { SupabaseRealtimeManager } from './supabaseManager.js';

export class MultiplayerManager {
    constructor() {
        this.supabase = new SupabaseRealtimeManager();
        this.clientId = this.supabase.clientId;
        this.gameMode = this.loadInitialGameMode(); // 'singleplayer' | 'multiplayer'
        
        this.peers = { ...this.supabase.peers };
        this.localPresences = {};
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
        this.killFeedCallbacks = [];
        
        this.roomState = {
            globalLeaderboard: {
                bestKills: {},
                totalKills: {}
            }
        };

        // Forward callbacks from Supabase
        this.supabase.subscribePresence((remotePresences) => {
            if (this.gameMode === 'multiplayer') {
                this.localPresences = { ...remotePresences };
                this.peers = { ...this.supabase.peers };
                this.notifyPresence();
            }
        });

        this.supabase.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
            if (this.gameMode === 'multiplayer') {
                for (const cb of this.presenceRequestCallbacks) {
                    cb(updateRequest, fromClientId);
                }
            }
        });

        this.supabase.subscribeAnnouncements((announcement) => {
            for (const cb of this.killFeedCallbacks) {
                cb(announcement);
            }
        });
    }

    loadInitialGameMode() {
        try {
            const saved = localStorage.getItem('sea_striker_game_mode');
            if (saved === 'multiplayer' || saved === 'singleplayer') {
                return saved;
            }
        } catch (e) {}
        // Default to singleplayer so user can play immediately with zero setup!
        return 'singleplayer';
    }

    setGameMode(mode) {
        if (mode !== 'singleplayer' && mode !== 'multiplayer') return;
        this.gameMode = mode;
        try {
            localStorage.setItem('sea_striker_game_mode', mode);
        } catch (e) {}

        if (mode === 'singleplayer') {
            // Disconnect from Supabase to save bandwidth and prevent interference
            this.supabase.disconnect();
            // Reset peers to only local player
            this.peers = {
                [this.clientId]: { id: this.clientId, username: this.supabase.username }
            };
            this.localPresences = {};
            this.notifyPresence();
        } else if (mode === 'multiplayer') {
            this.supabase.hasCredentials().then((has) => {
                if (has) {
                    this.supabase.connect();
                }
            });
        }
    }

    get isServerConnected() {
        if (this.gameMode === 'singleplayer') return false;
        return this.supabase.connectionStatus === 'connected';
    }

    get connectionStatus() {
        if (this.gameMode === 'singleplayer') return 'singleplayer';
        return this.supabase.connectionStatus;
    }

    get pingMs() {
        return this.supabase.pingMs;
    }

    async initialize() {
        const username = this.supabase.username;
        this.peers[this.clientId] = { id: this.clientId, username };

        if (this.gameMode === 'multiplayer') {
            const has = await this.supabase.hasCredentials();
            if (has) {
                await this.supabase.connect();
            }
        }
        return true;
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    subscribeKillFeed(callback) {
        this.killFeedCallbacks.push(callback);
    }

    notifyPresence() {
        for (const cb of this.presenceCallbacks) {
            cb({ ...this.localPresences });
        }
    }

    updatePresence(data) {
        if (!data) return;
        this.localPresences[this.clientId] = data;

        if (this.gameMode === 'multiplayer' && this.supabase.connectionStatus === 'connected') {
            this.supabase.sendPresenceUpdate(data);
        } else {
            // In singleplayer, notify local listeners directly
            this.notifyPresence();
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.gameMode === 'multiplayer' && this.supabase.connectionStatus === 'connected') {
            this.supabase.sendCombatRequest(targetId, updateRequest);
        } else {
            // In single player, if target is an AI bot or self, process directly
            if (targetId && this.presenceRequestCallbacks.length > 0) {
                // If targeting self
                if (targetId === this.clientId) {
                    for (const cb of this.presenceRequestCallbacks) {
                        cb(updateRequest, this.clientId);
                    }
                }
            }
        }
    }

    broadcastInkCloud(cloud) {
        if (this.gameMode === 'multiplayer' && this.supabase.connectionStatus === 'connected') {
            this.supabase.sendInkCloud(cloud);
        }
    }

    broadcastKill(killerName, victimName) {
        if (this.gameMode === 'multiplayer' && this.supabase.connectionStatus === 'connected') {
            this.supabase.sendKillAnnouncement(killerName, victimName);
        }
    }

    updateRoomState(data) {
        this.roomState = { ...this.roomState, ...data };
        try {
            localStorage.setItem('narwhal_room_state', JSON.stringify(this.roomState));
        } catch (e) {}
    }

    setUsername(newUsername) {
        this.supabase.setUsername(newUsername);
        this.peers[this.clientId] = { id: this.clientId, username: newUsername };
    }
}
