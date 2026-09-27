import { CONFIG } from '../core/config.js';

export class SkinsScreen {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.setupSkinsScreen();
    }
    
    setupSkinsScreen() {
        this.container = document.createElement('div');
        this.container.id = 'skins-screen';
        this.container.className = 'game-screen';
        
        // Create header
        const header = document.createElement('h1');
        header.textContent = 'Creature Skins';
        this.container.appendChild(header);
        
        // Create container for skin categories
        this.skinCategoriesContainer = document.createElement('div');
        this.skinCategoriesContainer.className = 'skin-categories';
        this.container.appendChild(this.skinCategoriesContainer);
        
        // Create container for skin display
        this.skinDisplayContainer = document.createElement('div');
        this.skinDisplayContainer.className = 'skin-display-container';
        this.container.appendChild(this.skinDisplayContainer);
        
        // Create back button
        const backButton = document.createElement('button');
        backButton.id = 'back-button';
        backButton.textContent = 'BACK';
        backButton.addEventListener('click', () => this.hide());
        this.container.appendChild(backButton);
        
        // Add to game container
        document.getElementById('game-container').appendChild(this.container);
        
        // Initially hide
        this.container.style.display = 'none';
    }
    
    updateSkins() {
        // Clear current categories and skins
        this.skinCategoriesContainer.innerHTML = '';
        this.skinDisplayContainer.innerHTML = '';
        
        // Create tabs for each creature type
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'skin-tabs';
        
        const creatureTypes = ['narwhal', 'shark', 'squid'];
        
        creatureTypes.forEach(type => {
            const tab = document.createElement('div');
            tab.className = 'skin-tab';
            tab.textContent = type.charAt(0).toUpperCase() + type.slice(1) + ' Skins';
            tab.addEventListener('click', () => this.showSkins(type));
            
            this.skinCategoriesContainer.appendChild(tab);
        });
        
        // Show narwhal skins by default
        this.showSkins('narwhal');
    }
    
    showSkins(creatureType) {
        // Update tab selection
        const tabs = this.skinCategoriesContainer.querySelectorAll('.skin-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.textContent.toLowerCase().includes(creatureType)) {
                tab.classList.add('active');
            }
        });
        
        // Clear current skins
        this.skinDisplayContainer.innerHTML = '';
        
        // Get skins for this creature type
        const skins = this.game.skinSystem.skins[creatureType];
        
        // Create skin cards
        skins.forEach(skin => {
            const skinCard = document.createElement('div');
            skinCard.className = 'skin-card';
            if (skin.selected) {
                skinCard.classList.add('selected');
            }
            
            const skinName = document.createElement('h3');
            skinName.className = 'skin-name';
            skinName.textContent = skin.name + ' ';
            
            const freeBadge = document.createElement('span');
            freeBadge.className = 'free-badge';
            freeBadge.textContent = '[AVAILABLE]';
            freeBadge.style.color = '#00ff88';
            freeBadge.style.fontSize = '12px';
            skinName.appendChild(freeBadge);
            
            skinCard.appendChild(skinName);
            
            const skinDescription = document.createElement('p');
            skinDescription.className = 'skin-description';
            skinDescription.textContent = skin.description;
            skinCard.appendChild(skinDescription);
            
            const selectButton = document.createElement('button');
            selectButton.className = 'select-skin-button';
            selectButton.textContent = skin.selected ? 'SELECTED' : 'SELECT';
            selectButton.disabled = skin.selected;
            
            selectButton.addEventListener('click', () => {
                this.game.skinSystem.selectSkin(creatureType, skin.id);
                this.updateSkins();
                this.showSkins(creatureType);
            });
            
            skinCard.appendChild(selectButton);
            this.skinDisplayContainer.appendChild(skinCard);
        });
    }
    
    show() {
        this.visible = true;
        this.container.style.display = 'flex';
        this.updateSkins();
    }
    
    hide() {
        this.visible = false;
        this.container.style.display = 'none';
        this.game.startScreen.show();
    }
}