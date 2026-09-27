import { CONFIG } from '../core/config.js';
import { CreatureFactory } from '../entities/creatureFactory.js';
import { CreatureSelectionManager } from './creatureSelectionManager.js';

export class StartScreen {
    constructor(game) {
        this.game = game;
        this.visible = true;
        this.creatureSelectionManager = new CreatureSelectionManager(game);
        this.validationTimeout = null;
        this.isValidUsername = true;
        this.setupScreenElements();
    }

    getRandomOceanName() {
        const prefixes = ["Apex", "Shadow", "Kraken", "Abyssal", "Tidal", "Frost", "Viper", "Echo", "Coral", "Phantom", "Rogue", "Swift", "Hydro", "Neon"];
        const suffixes = ["Striker", "Hunter", "Fin", "Fang", "Shark", "Whale", "Sniper", "Reaper", "Blade", "Tide", "Surge", "Ghost"];
        const p = prefixes[Math.floor(Math.random() * prefixes.length)];
        const s = suffixes[Math.floor(Math.random() * suffixes.length)];
        const num = Math.floor(10 + Math.random() * 89);
        return `${p}${s}_${num}`;
    }

    setupScreenElements() {
        // Create start screen container
        this.container = document.createElement('div');
        this.container.id = 'start-screen';
        this.container.className = 'game-screen';
        
        // Create header
        const header = document.createElement('h1');
        header.textContent = 'SeaStriker.io';
        this.container.appendChild(header);

        // Multiplayer server status badge
        const serverBadge = document.createElement('div');
        serverBadge.id = 'ocean-server-badge';
        serverBadge.className = 'server-status-badge online';
        serverBadge.innerHTML = `<span class="status-pulse-dot"></span> <strong>Multiplayer Online:</strong> 7 players in ocean`;
        this.serverBadge = serverBadge;
        this.container.appendChild(serverBadge);

        // Create username input section
        const usernameContainer = document.createElement('div');
        usernameContainer.className = 'username-input-container';

        const usernameLabel = document.createElement('label');
        usernameLabel.setAttribute('for', 'player-username-input');
        usernameLabel.textContent = 'Choose Your Ocean Nickname (Unique)';
        usernameContainer.appendChild(usernameLabel);

        const inputRow = document.createElement('div');
        inputRow.className = 'username-input-row';

        const input = document.createElement('input');
        input.id = 'player-username-input';
        input.type = 'text';
        input.maxLength = 16;
        input.placeholder = 'Enter unique nickname...';
        input.autocomplete = 'off';
        input.spellcheck = false;

        let initialName = '';
        try {
            initialName = localStorage.getItem('username') || '';
        } catch (e) {}
        if (!initialName) {
            initialName = this.getRandomOceanName();
            try {
                localStorage.setItem('username', initialName);
            } catch (e) {}
        }
        input.value = initialName;
        this.usernameInput = input;

        const diceBtn = document.createElement('button');
        diceBtn.id = 'random-name-btn';
        diceBtn.type = 'button';
        diceBtn.title = 'Generate Random Name';
        diceBtn.textContent = '🎲';
        diceBtn.addEventListener('click', () => {
            this.usernameInput.value = this.getRandomOceanName();
            this.validateUsername(this.usernameInput.value);
        });

        inputRow.appendChild(input);
        inputRow.appendChild(diceBtn);
        usernameContainer.appendChild(inputRow);

        const feedback = document.createElement('div');
        feedback.className = 'username-feedback valid';
        feedback.textContent = '✓ Unique ocean nickname available';
        usernameContainer.appendChild(feedback);
        this.usernameFeedback = feedback;

        input.addEventListener('input', () => {
            clearTimeout(this.validationTimeout);
            this.validationTimeout = setTimeout(() => {
                this.validateUsername(input.value);
            }, 250);
        });

        this.container.appendChild(usernameContainer);

        // Create creature selection section
        const selectionContainer = document.createElement('div');
        selectionContainer.className = 'selection-container';
        
        const selectionTitle = document.createElement('h2');
        selectionTitle.textContent = 'Choose Your Creature:';
        selectionContainer.appendChild(selectionTitle);

        // Add creature options
        const creatures = [
            { id: 'random', label: 'Random' },
            { id: 'narwhal', label: 'Narwhal' },
            { id: 'dolphin', label: 'Dolphin' },
            { id: 'shark', label: 'Shark' },
            { id: 'hammerhead', label: 'Hammerhead Shark' },
            { id: 'squid', label: 'Squid' },
            { id: 'octopus', label: 'Octopus' },
            { id: 'knifefish', label: 'Knife Fish' }
        ];
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'creature-options';
        
        creatures.forEach(creature => {
            const option = document.createElement('div');
            option.className = 'creature-option';
            option.setAttribute('data-creature', creature.id);
            if (creature.id === this.creatureSelectionManager.getSelectedCreature()) {
                option.classList.add('selected');
            }
            
            const name = document.createElement('h3');
            name.textContent = creature.label;
            option.appendChild(name);
            
            optionsContainer.appendChild(option);
            
            // Add click event
            option.addEventListener('click', () => {
                if (this.creatureSelectionManager.getSelectedCreature() === creature.id) {
                    return;
                }
                
                document.querySelectorAll('.creature-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                this.creatureSelectionManager.setSelectedCreature(creature.id);
                
                // If it's a skin creature, also select the skin in skinSystem
                if (this.game.skinSystem) {
                    if (creature.id === 'narwhal') {
                        this.game.skinSystem.selectSkin('narwhal', 'default');
                    } else if (creature.id === 'hammerhead') {
                        this.game.skinSystem.selectSkin('shark', 'hammerhead');
                    } else if (creature.id === 'shark') {
                        this.game.skinSystem.selectSkin('shark', 'default');
                    } else if (creature.id === 'octopus') {
                        this.game.skinSystem.selectSkin('squid', 'octopus');
                    } else if (creature.id === 'squid') {
                        this.game.skinSystem.selectSkin('squid', 'default');
                    }
                }
            });
        });
        
        selectionContainer.appendChild(optionsContainer);
        this.container.appendChild(selectionContainer);

        // Create play button
        const playButton = document.createElement('button');
        playButton.id = 'play-button';
        playButton.textContent = 'PLAY';
        playButton.addEventListener('click', () => this.startGame());
        this.container.appendChild(playButton);

        // Create button container for other buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        
        // Add stats button
        const statsButton = document.createElement('button');
        statsButton.id = 'stats-button';
        statsButton.textContent = 'VIEW STATS';
        statsButton.addEventListener('click', () => {
            this.hide();
            this.game.statsScreen.show();
        });
        buttonContainer.appendChild(statsButton);
        
        this.container.appendChild(buttonContainer);

        // Create instructions section
        const instructionsContainer = document.createElement('div');
        instructionsContainer.className = 'instructions-container';
        
        const instructionsTitle = document.createElement('h2');
        instructionsTitle.textContent = 'How To Play:';
        instructionsContainer.appendChild(instructionsTitle);
        
        // Common controls
        const commonControls = document.createElement('div');
        commonControls.innerHTML = `
            <h3>Common Controls:</h3>
            <ul>
                <li>Move: Follow Mouse / Joystick</li>
                <li>Ram / Dash: Mouse Click / Tap RAM Button</li>
                <li>Fast Swim (Sprint): Hold Shift / Tap SPRINT Button</li>
                <li>Dodge: Spacebar / Dodge Button</li>
                <li>Goal: Eliminate other creatures and climb the leaderboard!</li>
            </ul>
        `;
        instructionsContainer.appendChild(commonControls);
        this.container.appendChild(instructionsContainer);

        // Add to document
        document.body.appendChild(this.container);
        
        // Run initial check
        this.validateUsername(input.value);
    }

    async validateUsername(name) {
        const clean = String(name || '').trim();
        if (clean.length < 2) {
            this.isValidUsername = false;
            this.usernameFeedback.className = 'username-feedback invalid';
            this.usernameFeedback.textContent = 'Username must be at least 2 characters';
            if (this.usernameInput) {
                this.usernameInput.classList.remove('valid');
                this.usernameInput.classList.add('invalid');
            }
            return false;
        }

        try {
            const socketId = this.game.room && this.game.room.clientId ? this.game.room.clientId : null;
            const serverUrl = this.game.room?.serverUrl || '';
            const res = await fetch(serverUrl + '/api/check-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: clean, socketId })
            });

            if (res.ok) {
                const data = await res.json();
                if (!data.available) {
                    this.isValidUsername = false;
                    this.usernameFeedback.className = 'username-feedback warning';
                    this.usernameFeedback.textContent = data.message || 'Username taken by active player';
                    if (this.usernameInput) {
                        this.usernameInput.classList.remove('valid');
                        this.usernameInput.classList.add('invalid');
                    }
                    return false;
                }
            }
        } catch (e) {
            // Offline / cross-origin fallback
        }

        this.isValidUsername = true;
        this.usernameFeedback.className = 'username-feedback valid';
        this.usernameFeedback.textContent = '✓ Unique ocean name available!';
        if (this.usernameInput) {
            this.usernameInput.classList.remove('invalid');
            this.usernameInput.classList.add('valid');
        }
        return true;
    }

    updateCreatureNames() {
        const labels = {
            'narwhal': 'Narwhal',
            'dolphin': 'Dolphin',
            'shark': 'Shark',
            'hammerhead': 'Hammerhead Shark',
            'squid': 'Squid',
            'octopus': 'Octopus',
            'knifefish': 'Knife Fish',
            'random': 'Random'
        };
        
        const options = this.container.querySelectorAll('.creature-option');
        options.forEach(option => {
            const creatureType = option.getAttribute('data-creature');
            const nameElement = option.querySelector('h3');
            if (nameElement && labels[creatureType]) {
                nameElement.textContent = labels[creatureType];
            }
        });
    }

    updateNetworkStatus(status) {
        if (!this.serverBadge) return;
        const realCount = this.game.room?.getRealPlayerCount ? this.game.room.getRealPlayerCount() : (status?.playersCount || 1);
        const botCount = this.game.room?.getAIBotCount ? this.game.room.getAIBotCount() : (status?.aiCount || 6);
        const connecting = status?.connecting ?? (this.game.room && this.game.room.isConnecting);

        if (connecting) {
            this.serverBadge.className = 'server-status-badge connecting';
            this.serverBadge.innerHTML = `<span class="status-pulse-dot yellow"></span> Connecting to Multiplayer Ocean...`;
        } else {
            this.serverBadge.className = 'server-status-badge online';
            const playerLabel = realCount === 1 
                ? '<strong>Multiplayer Online:</strong> 1 Player (online)' 
                : `<strong>Multiplayer Online:</strong> ${realCount} Players (online)`;
            this.serverBadge.innerHTML = `<span class="status-pulse-dot"></span> ${playerLabel} <span style="opacity: 0.7; font-size: 0.85em;">(${botCount} Ocean Wildlife)</span>`;
        }
    }
    
    show() {
        this.visible = true;
        this.container.style.display = 'flex';
        this.updateCreatureNames();
        if (this.game.room) {
            const realCount = this.game.room.getRealPlayerCount ? this.game.room.getRealPlayerCount() : 1;
            const botCount = this.game.room.getAIBotCount ? this.game.room.getAIBotCount() : 6;
            this.updateNetworkStatus({
                connected: true,
                playersCount: realCount,
                aiCount: botCount
            });
        }
    }
    
    hide() {
        this.visible = false;
        this.container.style.display = 'none';
    }
    
    async startGame() {
        let cleanName = (this.usernameInput ? this.usernameInput.value : '').trim().substring(0, 16);
        if (!cleanName || cleanName.length < 2) {
            cleanName = this.getRandomOceanName();
            if (this.usernameInput) this.usernameInput.value = cleanName;
        }

        // Save username locally
        try {
            localStorage.setItem('username', cleanName);
        } catch (e) {}

        // Sync with room peers
        if (this.game.room) {
            if (this.game.room.peers && this.game.room.clientId) {
                this.game.room.peers[this.game.room.clientId] = {
                    id: this.game.room.clientId,
                    username: cleanName
                };
            }
            if (this.game.room.socket && this.game.room.isServerConnected) {
                this.game.room.socket.emit('setUsername', { username: cleanName });
            }
        }

        this.hide();
        // Spawn player with chosen username
        this.game.spawnPlayer(this.creatureSelectionManager.getSelectedCreature(), cleanName);
    }
    
    showDeathScreen(kills) {
        // Update the screen for death state
        const header = this.container.querySelector('h1');
        header.textContent = 'Game Over';
        
        // Show final score
        const scoreDisplay = document.createElement('div');
        scoreDisplay.className = 'death-score';
        scoreDisplay.innerHTML = `<h2>Final Score: ${kills} Kills</h2>`;
        
        // Replace any existing death score
        const existingScore = this.container.querySelector('.death-score');
        if (existingScore) {
            existingScore.replaceWith(scoreDisplay);
        } else {
            // Insert after the header
            header.after(scoreDisplay);
        }
        
        // Change play button text
        const playButton = this.container.querySelector('#play-button');
        playButton.textContent = 'PLAY AGAIN';
        
        // Make sure the stats button is visible
        const statsButton = this.container.querySelector('#stats-button');
        if (statsButton) {
            statsButton.style.display = 'block';
        }

        // Refresh username in input
        try {
            const currentName = localStorage.getItem('username');
            if (currentName && this.usernameInput) {
                this.usernameInput.value = currentName;
            }
        } catch (e) {}
        
        this.show();
    }
}
