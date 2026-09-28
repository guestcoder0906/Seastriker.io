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
        this.selectedMode = this.game.room.gameMode || 'multiplayer';
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

        // Game Mode Selection (Single Player vs Multiplayer)
        this.setupGameModeSelector();

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
        feedback.textContent = '✓ Ready to swim';
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
        playButton.textContent = 'PLAY SINGLE PLAYER';
        playButton.addEventListener('click', () => this.startGame());
        this.playButton = playButton;
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
                <li>Single Player: Battle smart AI narwhals, sharks, squids, and knife fish!</li>
                <li>Multiplayer: Live PvP ocean arena synced in real time!</li>
            </ul>
        `;
        instructionsContainer.appendChild(commonControls);
        this.container.appendChild(instructionsContainer);

        // Add to document
        document.body.appendChild(this.container);
        
        // Run initial check
        this.validateUsername(input.value);
        this.updateModeSelectorUI();
    }

    setupGameModeSelector() {
        const modeSection = document.createElement('div');
        modeSection.className = 'game-mode-section';

        modeSection.innerHTML = `
            <div class="mode-selector-tabs">
                <div class="mode-card ${this.selectedMode === 'singleplayer' ? 'selected' : ''}" id="mode-singleplayer" data-mode="singleplayer">
                    <div class="mode-card-header">
                        <span class="mode-card-title">🕹️ Single Player</span>
                        <span class="mode-card-badge ai-badge">Vs AI Bots</span>
                    </div>
                    <p class="mode-card-desc">Solo ocean survival arena against smart AI marine predators. Instant start, zero lag, play offline.</p>
                </div>

                <div class="mode-card ${this.selectedMode === 'multiplayer' ? 'selected' : ''}" id="mode-multiplayer" data-mode="multiplayer">
                    <div class="mode-card-header">
                        <span class="mode-card-title">🌐 Multiplayer</span>
                        <span class="mode-card-badge realtime-badge">Live Arena</span>
                    </div>
                    <p class="mode-card-desc">Real-time ocean battle against live players with instant synchronized movement & combat.</p>
                </div>
            </div>
        `;

        this.container.appendChild(modeSection);
        this.modeSection = modeSection;

        // Click handlers
        const singleBtn = modeSection.querySelector('#mode-singleplayer');
        const multiBtn = modeSection.querySelector('#mode-multiplayer');

        singleBtn.addEventListener('click', () => {
            this.setGameMode('singleplayer');
        });

        multiBtn.addEventListener('click', () => {
            this.setGameMode('multiplayer');
        });
    }

    setGameMode(mode) {
        this.selectedMode = mode;
        this.game.room.setGameMode(mode);
        this.updateModeSelectorUI();
    }

    updateModeSelectorUI() {
        if (!this.modeSection) return;

        const singleCard = this.modeSection.querySelector('#mode-singleplayer');
        const multiCard = this.modeSection.querySelector('#mode-multiplayer');

        if (singleCard && multiCard) {
            singleCard.classList.toggle('selected', this.selectedMode === 'singleplayer');
            multiCard.classList.toggle('selected', this.selectedMode === 'multiplayer');
        }

        if (this.playButton) {
            if (this.selectedMode === 'singleplayer') {
                this.playButton.textContent = 'PLAY (VS AI)';
            } else {
                this.playButton.textContent = 'PLAY';
            }
        }
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
    
    show() {
        this.visible = true;
        this.container.style.display = 'flex';
        this.updateCreatureNames();
        this.updateModeSelectorUI();
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

        // Sync with multiplayer manager
        if (this.game.room) {
            this.game.room.setUsername(cleanName);
            this.game.room.setGameMode(this.selectedMode);
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
            header.after(scoreDisplay);
        }
        
        // Change play button text
        if (this.playButton) {
            if (this.selectedMode === 'singleplayer') {
                this.playButton.textContent = 'PLAY AGAIN (SINGLE PLAYER)';
            } else {
                this.playButton.textContent = 'REJOIN MULTIPLAYER ARENA';
            }
        }
        
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
