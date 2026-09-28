export class StatsScreen {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.setupStatsScreen();
    }
    
    setupStatsScreen() {
        this.container = document.createElement('div');
        this.container.id = 'stats-screen';
        this.container.className = 'game-screen';
        
        // Create header
        const header = document.createElement('h1');
        header.textContent = 'Player Stats';
        this.container.appendChild(header);
        
        // Create personal stats section
        const personalStatsContainer = document.createElement('div');
        personalStatsContainer.className = 'stats-section';
        
        const personalStatsHeader = document.createElement('h2');
        personalStatsHeader.textContent = 'Your Stats';
        personalStatsHeader.className = 'centered-header';
        personalStatsContainer.appendChild(personalStatsHeader);
        
        this.personalStats = document.createElement('div');
        this.personalStats.className = 'personal-stats';
        personalStatsContainer.appendChild(this.personalStats);
        
        this.container.appendChild(personalStatsContainer);
        
        // Create leaderboard section
        const leaderboardContainer = document.createElement('div');
        leaderboardContainer.className = 'stats-section';
        
        const leaderboardHeader = document.createElement('h2');
        leaderboardHeader.textContent = 'Leaderboard';
        leaderboardHeader.className = 'centered-header';
        leaderboardContainer.appendChild(leaderboardHeader);
        
        // Create tabs for different leaderboards
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'leaderboard-tabs';
        
        this.bestKillsTab = document.createElement('div');
        this.bestKillsTab.className = 'leaderboard-tab active';
        this.bestKillsTab.textContent = 'Best Kills';
        this.bestKillsTab.addEventListener('click', () => this.showLeaderboard('bestKills'));
        
        this.totalKillsTab = document.createElement('div');
        this.totalKillsTab.className = 'leaderboard-tab';
        this.totalKillsTab.textContent = 'Total Kills';
        this.totalKillsTab.addEventListener('click', () => this.showLeaderboard('totalKills'));
        
        tabsContainer.appendChild(this.bestKillsTab);
        tabsContainer.appendChild(this.totalKillsTab);
        leaderboardContainer.appendChild(tabsContainer);
        
        // Create leaderboard content
        this.leaderboardContent = document.createElement('div');
        this.leaderboardContent.className = 'leaderboard-content';
        leaderboardContainer.appendChild(this.leaderboardContent);
        
        this.container.appendChild(leaderboardContainer);
        
        // Create back button
        const backButton = document.createElement('button');
        backButton.id = 'back-button';
        backButton.textContent = 'BACK';
        backButton.addEventListener('click', () => this.hide());
        this.container.appendChild(backButton);
        
        // Initially hide
        this.container.style.display = 'none';
        
        // Add to game container
        document.getElementById('game-container').appendChild(this.container);
    }
    
    async updateStats() {
        // Update personal stats
        const stats = this.game.playerStats.getStats();
        
        this.personalStats.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Current Game Kills:</span>
                <span class="stat-value">${stats.currentKills}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Best Kills in a Game:</span>
                <span class="stat-value">${stats.bestKills}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Total Kills:</span>
                <span class="stat-value">${stats.totalKills}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Games Played:</span>
                <span class="stat-value">${stats.gamesPlayed}</span>
            </div>
        `;
        
        // Fetch and update leaderboard
        await this.updateLeaderboard();
        
        // Show best kills by default
        this.showLeaderboard('bestKills');
    }
    
    async updateLeaderboard() {
        // Fetch latest global leaderboard data using the manager
        this.game.globalLeaderboardManager.leaderboardData = await this.game.globalLeaderboardManager.fetchGlobalLeaderboard();
        const activeTab = this.totalKillsTab && this.totalKillsTab.classList.contains('active') ? 'totalKills' : 'bestKills';
        this.showLeaderboard(activeTab);
    }
    
    showLeaderboard(type) {
        // Update tab styles
        this.bestKillsTab.className = 'leaderboard-tab' + (type === 'bestKills' ? ' active' : '');
        this.totalKillsTab.className = 'leaderboard-tab' + (type === 'totalKills' ? ' active' : '');
        
        // Get global leaderboard data from the manager
        const leaderboard = this.game.globalLeaderboardManager.leaderboardData[type] || [];
        
        // Clear content
        this.leaderboardContent.innerHTML = '';
        
        if (leaderboard.length === 0) {
            const noData = document.createElement('div');
            noData.className = 'no-leaderboard-data';
            noData.textContent = 'No scores recorded yet.';
            this.leaderboardContent.appendChild(noData);
            return;
        }
        
        // Create table
        const table = document.createElement('table');
        table.className = 'leaderboard-table';
        
        // Add header row
        const header = document.createElement('tr');
        header.innerHTML = `
            <th>Rank</th>
            <th>Player</th>
            <th>${type === 'bestKills' ? 'Best Kills' : 'Total Kills'}</th>
        `;
        table.appendChild(header);
        
        // Add player rows
        leaderboard.forEach((entry, index) => {
            const row = document.createElement('tr');
            
            // Highlight current user
            const currentUsername = (this.game.room && this.game.room.peers && this.game.room.peers[this.game.room.clientId]?.username) || 
                                    (typeof localStorage !== 'undefined' && localStorage.getItem('username'));
            const isCurrentUser = currentUsername && entry.username && entry.username.toLowerCase() === currentUsername.toLowerCase();
            if (isCurrentUser) {
                row.className = 'current-user';
            }
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${entry.username || 'Unknown'}${isCurrentUser ? ' <strong style="color: #ffffff; font-weight: bold;">(You)</strong>' : ''}</td>
                <td>${entry.score}</td>
            `;
            
            table.appendChild(row);
        });
        
        this.leaderboardContent.appendChild(table);
    }
    
    show() {
        this.visible = true;
        this.container.style.display = 'flex';
        this.updateStats();
    }
    
    hide() {
        this.visible = false;
        this.container.style.display = 'none';
        
        // Show the start screen
        this.game.startScreen.show();
    }
}