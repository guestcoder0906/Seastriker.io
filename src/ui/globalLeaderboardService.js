export const FAKE_PLACEHOLDER_PLAYERS = new Set([
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
                    const cleanData = {
                        bestKills: (data.bestKills || []).filter(e => e && e.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(e.username).toLowerCase().trim())),
                        totalKills: (data.totalKills || []).filter(e => e && e.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(e.username).toLowerCase().trim()))
                    };
                    this.leaderboardCache = cleanData;
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = cleanData;
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
                    const cleanData = {
                        bestKills: data.bestKills.filter(e => e && e.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(e.username).toLowerCase().trim())),
                        totalKills: data.totalKills.filter(e => e && e.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(e.username).toLowerCase().trim()))
                    };
                    this.leaderboardCache = cleanData;
                    try {
                        localStorage.setItem('cached_global_leaderboard', JSON.stringify(cleanData));
                    } catch (e) {}
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = cleanData;
                    }
                    if (this.game.statsScreen && this.game.statsScreen.container && this.game.statsScreen.container.style.display !== 'none') {
                        this.game.statsScreen.updateLeaderboard();
                    }
                }
            });

            this.game.room.supabase.subscribeScoreSubmit((payload) => {
                if (payload && payload.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(payload.username).toLowerCase().trim())) {
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
        
        const combined = {
            bestKills: [],
            totalKills: []
        };

        const mergeEntries = (data) => {
            if (!data) return;
            if (Array.isArray(data.bestKills)) {
                for (const item of data.bestKills) {
                    if (!item || !item.username) continue;
                    const name = String(item.username).trim();
                    if (FAKE_PLACEHOLDER_PLAYERS.has(name.toLowerCase())) continue;
                    const score = Number(item.score ?? item.best_kills ?? item.kills ?? 0) || 0;
                    if (score <= 0) continue;
                    const existing = combined.bestKills.find(e => e.username.toLowerCase() === name.toLowerCase());
                    if (existing) {
                        existing.score = Math.max(existing.score, score);
                    } else {
                        combined.bestKills.push({ username: name, score });
                    }
                }
            }
            if (Array.isArray(data.totalKills)) {
                for (const item of data.totalKills) {
                    if (!item || !item.username) continue;
                    const name = String(item.username).trim();
                    if (FAKE_PLACEHOLDER_PLAYERS.has(name.toLowerCase())) continue;
                    const score = Number(item.score ?? item.total_kills ?? item.kills ?? 0) || 0;
                    if (score <= 0) continue;
                    const existing = combined.totalKills.find(e => e.username.toLowerCase() === name.toLowerCase());
                    if (existing) {
                        existing.score = Math.max(existing.score, score);
                    } else {
                        combined.totalKills.push({ username: name, score });
                    }
                }
            }
        };

        // 1. Fetch from Supabase (Persistent cloud database & storage for all players)
        try {
            if (this.game && this.game.room && this.game.room.supabase) {
                const supabaseData = await this.game.room.supabase.fetchGlobalLeaderboardFromSupabase();
                if (supabaseData) {
                    mergeEntries(supabaseData);
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] Supabase fetch notice:', err);
        }

        // Direct fetch from Supabase public CDN endpoint if not yet loaded
        if (combined.bestKills.length === 0 && combined.totalKills.length === 0) {
            try {
                const supaRes = await fetch('https://hguresgswifsjamgypcg.supabase.co/storage/v1/object/public/global_leaderboard/leaderboard.json');
                if (supaRes.ok) {
                    const supaJson = await supaRes.json();
                    mergeEntries(supaJson);
                }
            } catch (supaErr) {
                console.warn('[Leaderboard] Supabase direct CDN fetch notice:', supaErr);
            }
        }
        
        // 2. Fetch from server REST API
        try {
            const res = await fetch('/api/leaderboard');
            if (res.ok) {
                const data = await res.json();
                mergeEntries(data);
            }
        } catch (err) {
            console.warn('[Leaderboard] API fetch notice:', err);
        }
        
        // 3. Try socket room state
        if (this.game.room && this.game.room.roomState && this.game.room.roomState.globalLeaderboard) {
            const formatted = this._formatLeaderboardData(this.game.room.roomState.globalLeaderboard);
            mergeEntries(formatted);
        }
        
        // 4. Try localStorage cache
        try {
            const saved = localStorage.getItem('cached_global_leaderboard');
            if (saved) {
                const parsed = JSON.parse(saved);
                mergeEntries(parsed);
            }
        } catch (e) {}

        // 5. Ensure local player's recorded high scores are merged
        if (this.game && this.game.playerStats) {
            const stats = this.game.playerStats.getStats();
            const currentName = (this.game.room && this.game.room.peers && this.game.room.peers[this.game.room.clientId]?.username) || 
                                (typeof localStorage !== 'undefined' && localStorage.getItem('username'));
            if (currentName) {
                if (stats.bestKills > 0) {
                    const exist = combined.bestKills.find(e => e.username.toLowerCase() === currentName.toLowerCase());
                    if (exist) {
                        exist.score = Math.max(exist.score, stats.bestKills);
                    } else {
                        combined.bestKills.push({ username: currentName, score: stats.bestKills });
                    }
                }
                if (stats.totalKills > 0) {
                    const exist = combined.totalKills.find(e => e.username.toLowerCase() === currentName.toLowerCase());
                    if (exist) {
                        exist.score = Math.max(exist.score, stats.totalKills);
                    } else {
                        combined.totalKills.push({ username: currentName, score: stats.totalKills });
                    }
                }
            }
        }
        
        // Sort descending
        combined.bestKills.sort((a, b) => b.score - a.score);
        combined.totalKills.sort((a, b) => b.score - a.score);

        this.leaderboardCache = combined;
        try {
            localStorage.setItem('cached_global_leaderboard', JSON.stringify(combined));
        } catch (e) {}

        if (this.game && this.game.globalLeaderboardManager) {
            this.game.globalLeaderboardManager.leaderboardData = combined;
        }

        return combined;
    }
    
    _formatLeaderboardData(leaderboardData) {
        const formattedData = {
            bestKills: [],
            totalKills: []
        };
        
        if (leaderboardData.bestKills) {
            for (const username in leaderboardData.bestKills) {
                if (FAKE_PLACEHOLDER_PLAYERS.has(username.toLowerCase().trim())) continue;
                formattedData.bestKills.push({
                    username: username,
                    score: Number(leaderboardData.bestKills[username]) || 0
                });
            }
            formattedData.bestKills.sort((a, b) => b.score - a.score);
        }
        
        if (leaderboardData.totalKills) {
            for (const username in leaderboardData.totalKills) {
                if (FAKE_PLACEHOLDER_PLAYERS.has(username.toLowerCase().trim())) continue;
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
        if (FAKE_PLACEHOLDER_PLAYERS.has(cleanName.toLowerCase())) return;

        const bk = Math.max(0, parseInt(payload.bestKills, 10) || 0);
        const tk = Math.max(0, parseInt(payload.totalKills, 10) || 0);

        if (!this.leaderboardCache) {
            this.leaderboardCache = { bestKills: [], totalKills: [] };
        } else {
            // Strip any stale fake players from cache
            this.leaderboardCache.bestKills = (this.leaderboardCache.bestKills || []).filter(e => e && e.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(e.username).toLowerCase().trim()));
            this.leaderboardCache.totalKills = (this.leaderboardCache.totalKills || []).filter(e => e && e.username && !FAKE_PLACEHOLDER_PLAYERS.has(String(e.username).toLowerCase().trim()));
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
        
        // 1. Submit via Supabase Database & Realtime broadcast (global internet synchronization)
        if (this.game && this.game.room && this.game.room.supabase) {
            try {
                this.game.room.supabase.saveScoreToSupabase(payload.username, payload.bestKills, payload.totalKills);
            } catch (supaErr) {
                console.warn('[Leaderboard] Supabase save warning:', supaErr);
            }
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
