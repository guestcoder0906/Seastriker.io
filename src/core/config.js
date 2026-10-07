export const CONFIG = {
    // Game settings
    WORLD_WIDTH: 2500,
    WORLD_HEIGHT: 2500,
    
    // Narwhal settings
    NARWHAL_LENGTH: 125,         // not used directly, but could represent total body length
    SEGMENTS: 15,                // increased for smoother body (was 3)
    SEGMENT_SIZE: 25,            // distance between segments
    TUSK_LENGTH: 75,             // Longer tusk reach (increased from 50)
    NARWHAL_SIZE_MULTIPLIER: 0.9,  // Make narwhals slightly smaller than sharks
    
    // Physics settings
    // Same exact speed for both AI and player
    BASE_SPEED: 4.0,  // Balanced, responsive swimming speed for both AI and players
    DASH_MULTIPLIER: 2.25,       // Punchy, controlled ram
    DASH_DURATION: 300,          // ms
    DASH_COOLDOWN: 30,           // 30 frames ram cooldown for all creatures
    RAM_COOLDOWN: 30,            // 30 frames
    DODGE_FORCE: 8.0,            // Responsive, controlled dodge
    DODGE_COOLDOWN: 15,          // frames
    DODGE_DURATION: 300,         // ms
    
    // Fast swim / Sprint settings (Holding Shift)
    FAST_SWIM_MULTIPLIER: 1.45,  // Responsive sprint acceleration
    FAST_SWIM_DRAIN_RATE: 1 / 180, // Depletes full green to red smoothly (~3.0s continuous sprint)
    FAST_SWIM_REGEN_RATE: 1 / 250, // Slightly slower stamina regen (~4.15s to recover full stamina)
    FAST_SWIM_MIN_STAMINA: 0.5,  // Sprint available while green circle is halfway or more green (>= 0.5)
    EXHAUSTED_SPEED_MULTIPLIER: 0.80, // Speed penalty when out of stamina / exhausted
    BURST_STAMINA_COST: 0.5,     // Ramming uses half stamina (0.5)
    BURST_MIN_STAMINA: 0.5,      // Stamina has to be more than 1/2 (> 0.5) to ram
    
    // Combat settings
    KILL_VELOCITY_THRESHOLD: 3.2,
    KNOCKBACK_FORCE: 0.45,
    MINIMUM_IMPACT_VELOCITY: 0.25, // Minimum velocity for tusk damage
    COLLISION_COOLDOWN: 800,   // 800ms cooldown before same creatures can damage each other again

    // Segment collision settings 
    SEGMENT_COLLISION_FORCE: 0.14, // Force applied when segments collide
    SEGMENT_OVERLAP: 0.8, // How much segments can overlap (0.8 = 80% of segment size)
    
    // Visual settings
    SAND_COLOR: "#dfb875",
    WATER_OVERLAY_COLOR: "rgba(14, 116, 204, 0.32)",
    WATER_COLOR: "#081d34", 
    WATER_DEPTH_COLORS: ["#d4aa60", "#e5c483", "#caa052", "#edd49b"], 
    BUBBLE_FREQUENCY: 0.01,
    BUBBLE_MAX_SIZE: 5,
    BUBBLE_MIN_SIZE: 1,
    
    // Narwhal physics
    ELASTICITY: 0.01,            // how tightly segments follow
    HEAD_SCALE: 2.5,             // max scale for the head (start of body)
    TAIL_SCALE: 0.2,
    
    // AI settings
    AI_SIGHT_RANGE: 800,
    AI_DECISION_RATE: 20, // Frames between AI decisions
    
    // Mobile settings
    MOBILE_CAMERA_SCALE: 0.7, // Even wider view for mobile (changed from 0.8)
    
    // Shark settings
    SHARK_SPEED_MULTIPLIER: 1.20,  // Sharks are 20% faster
    SHARK_RAM_DAMAGE: 28,          // Lowered shark ram damage (was 38, originally 50)
    SHARK_HEAD_DAMAGE: 36,         // Lowered direct head bite damage (was 48, originally 60)
    SHARK_DASH_DAMAGE: 70,         // Lowered shark dash damage (was 85, originally 100)
    SHARK_SIZE_MULTIPLIER: 1.1,    // Make sharks slightly bigger (slightly increased from 1.1)
    SHARK_SEGMENT_ELASTICITY: 0.1, // Increased elasticity for sharks for stiffness
    
    // Hammerhead Shark settings
    HAMMERHEAD_SHARK_AI_CHANCE: 0.3, // 30% chance for AI sharks to be hammerhead
    HAMMERHEAD_VISION_MULTIPLIER: 1.5, // 50% larger sight range
    HAMMERHEAD_ATTACK_RANGE_MULTIPLIER: 1.3, // 30% wider attack range

    // Dolphin settings (Replaced kabob narwhal)
    DOLPHIN_MAX_HEALTH: 120,             // Slightly higher max health (120 vs default 100)
    DOLPHIN_SIZE_MULTIPLIER: 1.15,       // Slightly bigger size
    DOLPHIN_SPEED_MULTIPLIER: 1.10,      // Slightly faster than narwhal
    DOLPHIN_TURN_FACTOR: 0.14,           // Smooth turning
    DOLPHIN_VISION_MULTIPLIER: 1.35,     // Slightly bigger range of sight like hammerhead shark
    DOLPHIN_RAM_DAMAGE: 16,              // Ramming deals slightly less damage (lowered from 20)
    DOLPHIN_HEAD_DAMAGE: 20,             // Direct head-on ram (lowered from 25)
    DOLPHIN_HIGH_SPEED_RAM_DAMAGE: 45,   // Lethal dash ram damage (lowered from 60)
    DOLPHIN_TAIL_SNAP_DAMAGE: 8,         // Dolphin tail attack deals slightly less damage (lowered from 11)
    DOLPHIN_TURN_SNAP_THRESHOLD: 0.11,   // Turning threshold to trigger tail snap (larger so it happens less often)
    DOLPHIN_AI_CHANCE: 0.25,             // 25% chance for AI to be dolphin

    // Fixed timing settings
    FRAME_RATE: 60, // Target frame rate
    TIME_STEP: 1000 / 60, // Fixed time step in ms (16.67ms for 60 FPS)
    USE_FIXED_TIMESTEP: true, // Force fixed time step for consistent physics

    // Stamina settings (simplified)
    STAMINA_COOLDOWN: 180,       // 3 seconds (60 frames per second)
    
    // Health settings
    MAX_HEALTH: 100,             // Maximum health points
    HEALTH_REGEN_RATE: 0.14,     // Health points regenerated per frame (slightly slower, was 0.2)
    HEAD_HIT_DAMAGE: 70,         // Head hit damage (lowered so narwhal head attack is ~35)
    BODY_HIT_DAMAGE: 18,         // Damage for body hits (lowered from 25)
    TAIL_HIT_DAMAGE: 8,          // Damage for tail hits (lowered from 10)
    
    // Player count settings - NPCs made less common overall
    MIN_TOTAL_PLAYERS: 4,
    MAX_TOTAL_PLAYERS: 6,
    
    // Upgrade settings
    TUSK_UPGRADE_1: 1.5,          // 50% longer tusk at 3 kills
    TUSK_UPGRADE_2: 2.0,          // 100% longer tusk at 10 kills
    STAMINA_COOLDOWN_UPGRADE_1: 2.0, // Reduced cooldown at 5 kills (seconds)
    STAMINA_COOLDOWN_UPGRADE_2: 1.5, // Even shorter cooldown at 20 kills (seconds)
    SPEED_UPGRADE: 1.5,           // 50% speed boost at 15 kills
    
    // New squid-specific upgrade modifiers
    SQUID_DAMAGE_UPGRADE_1: 1.20, // 20% more damage with first tusk upgrade
    SQUID_DAMAGE_UPGRADE_2: 1.40, // 40% more damage with second tusk upgrade
    SQUID_INK_COOLDOWN_UPGRADE_1: 1.25, // 25% faster ink cooldown with first stamina upgrade
    SQUID_INK_COOLDOWN_UPGRADE_2: 1.5,  // 50% faster ink cooldown with second stamina upgrade

    // Squid settings
    SQUID_COLOR: "rgba(100, 30, 150, 0.8)", // Example squid color, purple-ish
    SQUID_SIZE_MULTIPLIER: 0.74,   // Squid slightly smaller than octopus
    SQUID_SEGMENTS: 8,
    SQUID_BASE_ELASTICITY: 0.05,   // Higher elasticity for squid body
    SQUID_TENTACLE_ELASTICITY: 0.5, // Very elastic tentacles
    TENTACLE_LENGTH: 45,
    TENTACLE_SEGMENTS: 6,
    TENTACLE_THICKNESS: 10,

    // New squid ability settings
    SQUID_DODGE_DURATION: 500,     // Longer dodge for squids (ms)
    SQUID_INK_COOLDOWN: 7000,      // 7 seconds cooldown for ink ability (ms)
    SQUID_INK_DURATION: 5000,      // 5 seconds ink cloud duration (ms)
    SQUID_INK_RADIUS: 100,         // Radius of ink cloud
    SQUID_INK_EFFECT_DURATION: 4000, // Duration of ink effect on players (ms)
    SQUID_TENTACLE_DAMAGE: 20,     // Lowered squid attack damage per hit (down from 25)

    // Octopus settings
    OCTOPUS_SIZE_MULTIPLIER: 0.82,     // Octopus a bit smaller (lowered from 1.1)
    OCTOPUS_TENTACLE_LENGTH: 3.0,      // Octopus has longer tentacles
    OCTOPUS_TENTACLE_COUNT: 8,         // Octopus has 8 tentacles
    OCTOPUS_HEAD_DAMAGE: 18,           // Lowered octopus attack damage (down from 20)
    OCTOPUS_AI_CHANCE: 0.3,            // 30% chance for AI squids to be octopus
    OCTOPUS_CAMOUFLAGE_DURATION: 3000, // 3 seconds of camouflage
    OCTOPUS_CAMOUFLAGE_COOLDOWN: 5000, // 5 seconds cooldown
    OCTOPUS_CAMOUFLAGE_COOLDOWN_UPGRADE_1: 1.25, // 25% faster cooldown with first upgrade
    OCTOPUS_CAMOUFLAGE_COOLDOWN_UPGRADE_2: 1.5,  // 50% faster cooldown with second upgrade
    
    // Rock formation settings (Replaced coral reefs)
    ROCK_COUNT: 14,                   // Number of rock formations in the world
    ROCK_MIN_SIZE: 160,               // Minimum size of rocks
    ROCK_MAX_SIZE: 280,               // Maximum size of rocks
    ROCK_SLOW_MULTIPLIER: 0.38,       // 62% speed reduction for non-apex creatures inside rocks
    CORAL_REEF_COUNT: 14,             // Backwards compatibility alias
    CORAL_REEF_MIN_SIZE: 160,
    CORAL_REEF_MAX_SIZE: 280,
    CORAL_REEF_HIDE_TIME: 1000,
    CORAL_REEF_COLLISION_FORCE: 5,

    // Knife Fish settings
    KNIFEFISH_SIZE_MULTIPLIER: 0.52,      // Knife fish slightly smaller (lowered from 0.6)
    KNIFEFISH_SPEED_MULTIPLIER: 1.15,     // Nimble but well balanced
    KNIFEFISH_SEGMENTS: 10,               // More segments than narwhal, less than squid
    KNIFEFISH_ATTACK_DAMAGE: 14,          // Base damage (lowered from 20)
    KNIFEFISH_BOOST_DAMAGE_MULTIPLIER: 2.5, // Damage multiplier when boosting (lowered from 3.0)
    KNIFEFISH_DODGE_FORCE: 10.0,          // Balanced dodge force
    KNIFEFISH_DODGE_COOLDOWN: 180,        // 3 seconds (60 frames per second)
    KNIFEFISH_STAMINA_COOLDOWN: 180,      // 3 seconds cooldown
    KNIFEFISH_MINIMUM_IMPACT_VELOCITY: 2, // Lower minimum velocity for damage
    KNIFEFISH_AI_CHANCE: 0.25,            // 25% chance for AI knife fish
    KNIFEFISH_DODGE_DURATION: 450,        // 50% longer dodge duration than narwhal's 300ms
    KNIFEFISH_HEALTH_REGEN_MULTIPLIER: 1.85, // Knife fish regenerates health 85% faster to balance lower max HP
    KNIFEFISH_REGEN_DELAY: 1500,          // Begins regenerating health after 1.5s of no damage (rapid recovery)
};