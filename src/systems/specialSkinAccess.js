export class SpecialSkinAccess {
    constructor(game) {
        this.game = game;
        this.specialUsernames = ['pink', 'calba', 'frog'];
        this.unlockAllButton = null;
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        // Wait for game room to be initialized and user data to be available
        if (!this.game.room || !this.game.room.peers || !this.game.room.clientId) {
            setTimeout(() => this.initialize(), 500);
            return;
        }
        
        const username = this.game.room.peers[this.game.room.clientId]?.username;
        
        // Check if the current user is in the special users list
        if (username && this.specialUsernames.includes(username.toLowerCase())) {
            this.createUnlockAllButton();
        }
        
        this.initialized = true;
    }
    
    createUnlockAllButton() {
        // Create the unlock all button
        this.unlockAllButton = document.createElement('button');
        this.unlockAllButton.id = 'unlock-all-button';
        this.unlockAllButton.textContent = 'UNLOCK ALL SKINS';
        this.unlockAllButton.style.position = 'absolute';
        this.unlockAllButton.style.top = '10px';
        this.unlockAllButton.style.left = '10px';
        this.unlockAllButton.style.zIndex = '100';
        this.unlockAllButton.style.backgroundColor = '#ff00ff';
        this.unlockAllButton.style.color = 'white';
        this.unlockAllButton.style.border = 'none';
        this.unlockAllButton.style.padding = '8px 15px';
        this.unlockAllButton.style.borderRadius = '5px';
        this.unlockAllButton.style.cursor = 'pointer';
        
        // Add click handler
        this.unlockAllButton.addEventListener('click', () => {
            this.toggleAllSkins();
        });
        
        // Add to game container
        document.getElementById('game-container').appendChild(this.unlockAllButton);
    }
    
    toggleAllSkins() {
        if (!this.game.skinSystem) return;
        
        // Check current state - if all are unlocked, we're toggling off
        const allUnlocked = this.areAllSkinsUnlocked();
        
        // For each creature type and skin
        for (const creatureType in this.game.skinSystem.skins) {
            this.game.skinSystem.skins[creatureType].forEach(skin => {
                // Either unlock all or reset to default
                if (allUnlocked) {
                    // Reset to default - only default skin is unlocked
                    skin.unlocked = (skin.id === 'default');
                    // Only default skin is selected
                    skin.selected = (skin.id === 'default');
                } else {
                    // Unlock all skins
                    skin.unlocked = true;
                }
            });
        }
        
        // Save the changes
        this.game.skinSystem.saveSkinData();
        
        // Update button text
        this.unlockAllButton.textContent = allUnlocked ? 'UNLOCK ALL SKINS' : 'RESET TO DEFAULT';
        
        // If the skins screen is visible, update it
        if (this.game.skinsScreen && this.game.skinsScreen.visible) {
            this.game.skinsScreen.updateSkins();
        }
    }
    
    areAllSkinsUnlocked() {
        if (!this.game.skinSystem) return false;
        
        // Check if all skins are already unlocked
        for (const creatureType in this.game.skinSystem.skins) {
            for (const skin of this.game.skinSystem.skins[creatureType]) {
                if (skin.id !== 'default' && !skin.unlocked) {
                    return false; // Found at least one locked skin
                }
            }
        }
        
        return true; // All non-default skins are unlocked
    }
}