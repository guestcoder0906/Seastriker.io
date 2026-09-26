export class GlobalLeaderboard {
    constructor(game) {
        this.game = game;
        this.leaderboardData = {
            totalKills: [],
            bestKills: []
        };
    }

    async fetchLeaderboard() {
        try {
            // Let the GlobalLeaderboardManager handle this
            return await this.game.globalLeaderboardManager.fetchGlobalLeaderboard();
        } catch (e) {
            console.error('Error fetching leaderboard:', e);
            return this.leaderboardData;
        }
    }

    async submitScore(username, bestKills, totalKills) {
        try {
            // Use the GlobalLeaderboardManager to submit the score
            return await this.game.globalLeaderboardManager.submitScore(username, bestKills, totalKills);
        } catch (e) {
            console.error('Error submitting score:', e);
            return false;
        }
    }
}

