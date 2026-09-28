export class GlobalLeaderboardService {
    constructor(game) {
        this.game = game;
        this.initialized = false;
        this.leaderboardCache = null;
        this.setupSocketListener();
        this.setupSupabaseListener();
    }
    
    setupSocketListener() {
        if (this.game && this.game.room && this.game.room.socket) {
            this.game.room.socket.on('leaderboardUpdate', (data) => {
                if (data) {
                    this.leaderboardCache = data;
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = data;
                    }
                    if (this.game.statsScreen && this.game.statsScreen.container && this.game.statsScreen.container.style.display !== 'none') {
                        this.game.statsScreen.updateLeaderboard();
                    }
                }
            });
        }
    }

    setupSupabaseListener() {
        if (this.game && this.game.room && this.game.room.supabase) {
            this.game.room.supabase.subscribeLeaderboard((data) => {
                if (data && Array.isArray(data.bestKills) && Array.isArray(data.totalKills)) {
                    this.leaderboardCache = data;
                    try {
                        localStorage.setItem('cached_global_leaderboard', JSON.stringify(data));
                    } catch (e) {}
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = data;
                    }
                    if (this.game.statsScreen && this.game.statsScreen.container && this.game.statsScreen.container.style.display !== 'none') {
                        this.game.statsScreen.updateLeaderboard();
                    }
                }
            });

            this.game.room.supabase.subscribeScoreSubmit((payload) => {
                if (payload && payload.username) {
                    this.mergeScore(payload);
                }
            });
        }
    }
    
    async initialize() {
        if (this.initialized) return;
        this.setupSocketListener();
        this.setupSupabaseListener();
        this.initialized = true;
    }
    
    async fetchGlobalLeaderboard() {
        await this.initialize();
        
        // 1. Try fetching from server REST API
        try {
            const res = await fetch('/api/leaderboard');
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.bestKills) && Array.isArray(data.totalKills)) {
                    this.leaderboardCache = data;
                    try {
                        localStorage.setItem('cached_global_leaderboard', JSON.stringify(data));
                    } catch (e) {}
                    return data;
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] API fetch failed, trying fallback:', err);
        }
        
        // 2. Try socket room state
        if (this.game.room && this.game.room.roomState && this.game.room.roomState.globalLeaderboard) {
            const formatted = this._formatLeaderboardData(this.game.room.roomState.globalLeaderboard);
            this.leaderboardCache = formatted;
            return formatted;
        }
        
        // 3. Try localStorage cache
        try {
            const saved = localStorage.getItem('cached_global_leaderboard');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && Array.isArray(parsed.bestKills)) {
                    this.leaderboardCache = parsed;
                    return parsed;
                }
            }
        } catch (e) {}
        
        // 4. Empty fallback if offline
        const fallback = {
            bestKills: [],
            totalKills: []
        };
        this.leaderboardCache = fallback;
        return fallback;
    }
    
    _formatLeaderboardData(leaderboardData) {
        const fakeNames = new Set([
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

        const formattedData = {
            bestKills: [],
            totalKills: []
        };
        
        if (leaderboardData.bestKills) {
            for (const username in leaderboardData.bestKills) {
                if (fakeNames.has(username.toLowerCase().trim())) continue;
                formattedData.bestKills.push({
                    username: username,
                    score: Number(leaderboardData.bestKills[username]) || 0
                });
            }
            formattedData.bestKills.sort((a, b) => b.score - a.score);
        }
        
        if (leaderboardData.totalKills) {
            for (const username in leaderboardData.totalKills) {
                if (fakeNames.has(username.toLowerCase().trim())) continue;
                formattedData.totalKills.push({
                    username: username,
                    score: Number(leaderboardData.totalKills[username]) || 0
                });
            }
            formattedData.totalKills.sort((a, b) => b.score - a.score);
        }
        
        return formattedData;
    }

    mergeScore(payload) {
        if (!payload || !payload.username) return;
        const cleanName = payload.username.trim();
        const bk = Math.max(0, parseInt(payload.bestKills, 10) || 0);
        const tk = Math.max(0, parseInt(payload.totalKills, 10) || 0);

        if (!this.leaderboardCache) {
            this.leaderboardCache = { bestKills: [], totalKills: [] };
        }

        // Merge into bestKills
        const bestIdx = this.leaderboardCache.bestKills.findIndex(e => e.username.toLowerCase() === cleanName.toLowerCase());
        if (bestIdx >= 0) {
            this.leaderboardCache.bestKills[bestIdx].score = Math.max(this.leaderboardCache.bestKills[bestIdx].score, bk);
        } else if (bk > 0) {
            this.leaderboardCache.bestKills.push({ username: cleanName, score: bk });
        }
        this.leaderboardCache.bestKills.sort((a, b) => b.score - a.score);

        // Merge into totalKills
        const totalIdx = this.leaderboardCache.totalKills.findIndex(e => e.username.toLowerCase() === cleanName.toLowerCase());
        if (totalIdx >= 0) {
            this.leaderboardCache.totalKills[totalIdx].score = Math.max(this.leaderboardCache.totalKills[totalIdx].score, tk);
        } else if (tk > 0) {
            this.leaderboardCache.totalKills.push({ username: cleanName, score: tk });
        }
        this.leaderboardCache.totalKills.sort((a, b) => b.score - a.score);

        try {
            localStorage.setItem('cached_global_leaderboard', JSON.stringify(this.leaderboardCache));
        } catch (e) {}

        if (this.game.globalLeaderboardManager) {
            this.game.globalLeaderboardManager.leaderboardData = this.leaderboardCache;
        }
        if (this.game.statsScreen && this.game.statsScreen.container && this.game.statsScreen.container.style.display !== 'none') {
            this.game.statsScreen.updateLeaderboard();
        }
    }
    
    async submitScore(username, bestKills, totalKills) {
        if (!username) return false;
        
        const payload = {
            username: username.trim(),
            bestKills: Math.max(0, parseInt(bestKills, 10) || 0),
            totalKills: Math.max(0, parseInt(totalKills, 10) || 0)
        };

        // Update local cache immediately
        this.mergeScore(payload);
        
        // 1. Submit via Supabase Realtime broadcast (global internet synchronization)
        if (this.game && this.game.room && this.game.room.supabase) {
            this.game.room.supabase.sendScoreSubmit(payload);
            if (this.leaderboardCache) {
                this.game.room.supabase.sendLeaderboardUpdate(this.leaderboardCache);
            }
        }

        // 2. Submit via REST API
        try {
            const res = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.leaderboard) {
                    this.leaderboardCache = data.leaderboard;
                    try {
                        localStorage.setItem('cached_global_leaderboard', JSON.stringify(data.leaderboard));
                    } catch (e) {}
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = data.leaderboard;
                    }
                    if (this.game.room && this.game.room.supabase) {
                        this.game.room.supabase.sendLeaderboardUpdate(data.leaderboard);
                    }
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] API submit failed, using fallback channels:', err);
        }
        
        // 3. Emit via socket
        if (this.game.room && this.game.room.socket && this.game.room.isServerConnected) {
            this.game.room.socket.emit('submitScore', payload);
        }
        
        // 4. Update roomState
        if (this.game.room) {
            this.game.room.updateRoomState({
                globalLeaderboard: {
                    bestKills: { [payload.username]: payload.bestKills },
                    totalKills: { [payload.username]: payload.totalKills }
                }
            });
        }
        
        return true;
    }
}
