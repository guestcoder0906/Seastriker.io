import { CONFIG } from '../core/config.js';
import { CreatureFactory } from '../entities/creatureFactory.js';
import { CreatureSelectionManager } from './creatureSelectionManager.js';

export class StartScreen {
    constructor(game) {
        this.game = game;
        this.visible = true;
        this.creatureSelectionManager = new CreatureSelectionManager(game);
        this.setupScreenElements();
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

        // Create creature selection section
        const selectionContainer = document.createElement('div');
        selectionContainer.className = 'selection-container';
        
        const selectionTitle = document.createElement('h2');
        selectionTitle.textContent = 'Choose Your Creature:';
        selectionContainer.appendChild(selectionTitle);

        // Add creature options - all creature skins are available directly as creatures for free
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
        
        // Add skins button
        const skinsButton = document.createElement('button');
        skinsButton.id = 'skins-button';
        skinsButton.textContent = 'SKINS';
        skinsButton.addEventListener('click', () => {
            this.hide();
            this.game.skinsScreen.show();
        });
        buttonContainer.appendChild(skinsButton);
        
        this.container.appendChild(buttonContainer);

        // Create instructions section
        const instructionsContainer = document.createElement('div');
        instructionsContainer.className = 'instructions-container';
        
        const instructionsTitle = document.createElement('h2');
        instructionsTitle.textContent = 'How To Play:';
        instructionsContainer.appendChild(instructionsTitle);
        
        // Create creature-specific instructions
        const creatureInstructions = document.createElement('div');
        creatureInstructions.className = 'creature-instructions';
        
        // Common controls
        const commonControls = document.createElement('div');
        commonControls.innerHTML = `
            <h3>Common Controls:</h3>
            <ul>
                <li>Move: Follow Mouse / Joystick</li>
                <li>Ram / Dash: Mouse Click / Tap RAM Button (requires &gt; ½ stamina, uses ½ stamina)</li>
                <li>Fast Swim (Sprint): Hold Shift / Tap SPRINT Button (smoothly drains stamina; ram requires &gt; ½ stamina)</li>
                <li>Dodge: Spacebar / Dodge Button (burst maneuver)</li>
                <li>Goal: Get the most kills on the leaderboard!</li>
            </ul>
        `;
        creatureInstructions.appendChild(commonControls);
        
        // Specific controls
        const specificControls = {
            narwhal: `
                <h3>Narwhal:</h3>
                <ul>
                    <li>Stab other creatures with your extended tusk</li>
                    <li>Press Spacebar/Dodge Button to dodge backward</li>
                    <li>High speed ram/dash attacks for lethal strikes</li>
                </ul>
            `,
            dolphin: `
                <h3>Bottlenose Dolphin:</h3>
                <ul>
                    <li>Bottlenose with a distinct nose and rounded melon head (not diamond)</li>
                    <li>Mouse Click / Tap RAM: Burst forward with a powerful snout ram!</li>
                    <li>Hold Shift to fast swim sprint with hydrodynamic agility</li>
                    <li>Whip a fast turn while sprinting to swing your Tail Snap attack!</li>
                </ul>
            `,
            shark: `
                <h3>Shark:</h3>
                <ul>
                    <li>Ram into others with your head</li>
                    <li>Faster movement than other creatures</li>
                    <li>Powerful ram attack for instant kills</li>
                </ul>
            `,
            squid: `
                <h3>Squid:</h3>
                <ul>
                    <li>Press Q/Ink Button to release ink cloud</li>
                    <li>Trap enemies in your tentacles for damage</li>
                    <li>Press Spacebar/Dodge Button for extended dodge</li>
                </ul>
            `,
            knifefish: `
                <h3>Knife Fish:</h3>
                <ul>
                    <li>Can see camouflaged creatures with full transparency</li>
                    <li>Can hide in coral reefs like squids</li>
                    <li>Damage increases 2x when boosting</li>
                    <li>Dodge has shorter cooldown (3s)</li>
                </ul>
            `
        };
        
        for (const type in specificControls) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = `specific-controls ${type}-controls`;
            controlsDiv.innerHTML = specificControls[type];
            creatureInstructions.appendChild(controlsDiv);
        }
        
        instructionsContainer.appendChild(creatureInstructions);
        this.container.appendChild(instructionsContainer);

        // Add to game container
        document.getElementById('game-container').appendChild(this.container);
    }
    
    // Update creature names based on selected skins
    updateCreatureNames() {
        const labels = {
            random: 'Random',
            narwhal: 'Narwhal',
            dolphin: 'Dolphin',
            shark: 'Shark',
            hammerhead: 'Hammerhead Shark',
            squid: 'Squid',
            octopus: 'Octopus',
            knifefish: 'Knife Fish'
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
        this.updateCreatureNames(); // Update creature names when showing the screen
    }
    
    hide() {
        this.visible = false;
        this.container.style.display = 'none';
    }
    
    startGame() {
        this.hide();
        // Use the creature type from the manager when spawning
        this.game.spawnPlayer(this.creatureSelectionManager.getSelectedCreature());
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
        
        this.show();
    }
}