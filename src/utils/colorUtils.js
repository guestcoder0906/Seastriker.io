export class ColorUtils {
    static getNarwhalColor() {
        // Light grey and light blue shades for narwhals
        const baseHue = 240; // Blue hue
        const hueVariation = 30;
        const saturation = 20 + Math.random() * 20; // 20-40% saturation (desaturated)
        const lightness = 70 + Math.random() * 20;    // 70-90% lightness (lighter)
        const greyLightness = 80 + Math.random() * 15; // 80-95% lightness for grey shades
        const useGrey = Math.random() < 0.5;          // 50% chance for grey
        if (useGrey) {
            return `hsl(0, 0%, ${greyLightness}%)`; // Shades of light grey
        } else {
            const hue = baseHue - hueVariation / 2 + Math.random() * hueVariation;
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`; // Light blue shades
        }
    }
    
    static getSharkColor() {
        // Dark grey and blue shades for sharks
        const baseHue = 240; // Blue hue
        const hueVariation = 20;
        const saturation = 50 + Math.random() * 30; // 50-80% saturation
        const lightness = 20 + Math.random() * 20;    // 20-40% lightness (darker)
        const greyLightness = 30 + Math.random() * 15; // Darker grey shades
        const useGrey = Math.random() < 0.5;          // 50% chance for dark grey
        if (useGrey) {
            return `hsl(0, 0%, ${greyLightness}%)`; // Shades of dark grey
        } else {
            const hue = baseHue - hueVariation / 2 + Math.random() * hueVariation;
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        }
    }
    
    static getHammerheadSharkColor() {
        // Only grey shades for hammerhead sharks - no blue variants
        const greyLightness = 30 + Math.random() * 15; // Darker grey shades
        return `hsl(0, 0%, ${greyLightness}%)`; // Always grey
    }
    
    // Added missing function for squid colors
    static getSquidColor() {
        // No more purple for squid/octopus - only red to orange hues
        const hue = 350 + Math.random() * 30; // 350-20 (red to orange-red)
        const saturation = 60 + Math.random() * 30; // 60-90% saturation
        const lightness = 40 + Math.random() * 20;  // 40-60% lightness
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    static getKnifeFishColor() {
        // Brownish-grey shades for knife fish
        const hue = 30 + Math.random() * 10; // 30-40 (brown)
        const saturation = 15 + Math.random() * 10; // 15-25% (low saturation)
        const lightness = 35 + Math.random() * 15; // 35-50% (medium darkness)
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    static getDolphinColor() {
        // Dolphins come in light blue or light grey colors
        const useGrey = Math.random() < 0.5;
        if (useGrey) {
            // Light grey tones
            const lightness = 68 + Math.random() * 12; // 68-80%
            return `hsl(210, 8%, ${lightness}%)`;
        } else {
            // Light blue tones
            const hue = 198 + Math.random() * 14; // 198-212 (soft oceanic light blue)
            const saturation = 55 + Math.random() * 20; // 55-75%
            const lightness = 65 + Math.random() * 12; // 65-77%
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        }
    }
}