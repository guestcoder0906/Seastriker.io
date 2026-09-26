export class PlayerStats {
    constructor(game) {
        this.game = game;
        this.stats = {
            currentKills: 0,
            bestKills: 0,
            totalKills: 0,
            gamesPlayed: 0
        };
        this.loadStats();
    }

    loadStats() {
        try {
            const savedStats = localStorage.getItem('seaStrikerStats');
            if (savedStats) {
                const parsed = JSON.parse(savedStats);
                this.stats = {
                    ...this.stats,
                    ...parsed
                };
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    saveStats() {
        try {
            localStorage.setItem('seaStrikerStats', JSON.stringify(this.stats));
        } catch (e) {
            console.error('Failed to save stats:', e);
        }
    }

    updateCurrentKills(kills) {
        this.stats.currentKills = kills;
        if (kills > this.stats.bestKills) {
            this.stats.bestKills = kills;
        }
        this.saveStats();
    }

    recordGameEnd() {
        this.stats.totalKills += this.stats.currentKills;
        this.stats.gamesPlayed++;
        this.stats.currentKills = 0;
        this.saveStats();
    }

    getStats() {
        return { ...this.stats };
    }
}

