export class SpecialSkinAccess {
    constructor(game) {
        this.game = game;
        this.specialUsernames = ['pink', 'calba', 'frog'];
        this.unlockAllButton = null;
        this.initialized = false;
    }
    
    async initialize() {
        // All creatures and skins are freely accessible to all players by default.
        // No unlock button is needed.
        this.initialized = true;
    }
    
    createUnlockAllButton() {
        // No-op: all players already have access to all creatures and skins
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
        
        // Update button text if present
        if (this.unlockAllButton) {
            this.unlockAllButton.textContent = allUnlocked ? 'UNLOCK ALL SKINS' : 'RESET TO DEFAULT';
        }
        
        // If the skins screen is visible, update it
        if (this.game.skinsScreen && this.game.skinsScreen.visible) {
            this.game.skinsScreen.updateSkins();
        }
    }
    
    areAllSkinsUnlocked() {
        if (!this.game.skinSystem) return false;
        
        // Check if all skins are already unlocked
        for (const creatureType in this.game.skinSystem.skins) {
            const list = this.game.skinSystem.skins[creatureType];
            if (!Array.isArray(list)) continue;
            for (const skin of list) {
                if (skin.id !== 'default' && !skin.unlocked) {
                    return false; // Found at least one locked skin
                }
            }
        }
        
        return true; // All non-default skins are unlocked
    }
}