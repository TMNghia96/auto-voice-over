"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultFadeDuration = exports.getDefaultFadeDuration = exports.setDefaultBackgroundVolume = exports.getDefaultBackgroundVolume = exports.setActivePromptId = exports.getActivePromptId = exports.savePrompts = exports.getPrompts = exports.saveProjectMetadata = exports.getProjectMetadata = exports.deleteProjectFolder = exports.createProjectFolder = exports.setApiKey = exports.hasApiKey = exports.getApiKey = exports.setPinnedPath = exports.getPinnedPath = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const AppPaths_1 = require("./AppPaths");
const PathSecurity_1 = require("./PathSecurity");
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
const CONFIG_PATH = isDev
    ? path_1.default.join(process.cwd(), 'src/config/config.json')
    : path_1.default.join((0, AppPaths_1.getAppUserDataPath)(), 'config.json');
const readConfig = () => {
    try {
        if (fs_1.default.existsSync(CONFIG_PATH)) {
            const data = fs_1.default.readFileSync(CONFIG_PATH, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error("Error reading config:", error);
    }
    return {};
};
const writeConfig = (updates) => {
    try {
        const dir = path_1.default.dirname(CONFIG_PATH);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        const existing = readConfig();
        const config = { ...existing, ...updates };
        fs_1.default.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf-8');
        return true;
    }
    catch (error) {
        console.error("Error writing config:", error);
        return false;
    }
};
const getPinnedPath = () => {
    return readConfig().pinnedPath || "";
};
exports.getPinnedPath = getPinnedPath;
const setPinnedPath = (pinnedPath) => {
    return writeConfig({ pinnedPath });
};
exports.setPinnedPath = setPinnedPath;
const getApiKey = (provider) => {
    const config = readConfig();
    return config.apiKeys?.[provider] || "";
};
exports.getApiKey = getApiKey;
const hasApiKey = (provider) => {
    return (0, exports.getApiKey)(provider).trim().length > 0;
};
exports.hasApiKey = hasApiKey;
const setApiKey = (provider, key) => {
    const config = readConfig();
    const apiKeys = { ...(config.apiKeys || {}), [provider]: key };
    return writeConfig({ apiKeys });
};
exports.setApiKey = setApiKey;
const createProjectFolder = (basePath, projectName) => {
    try {
        if (!basePath || !fs_1.default.existsSync(basePath) || !fs_1.default.statSync(basePath).isDirectory()) {
            return false;
        }
        const safeProjectName = (0, PathSecurity_1.sanitizeProjectName)(projectName);
        const targetDir = path_1.default.join(fs_1.default.realpathSync(basePath), safeProjectName);
        if (fs_1.default.existsSync(targetDir)) {
            return false;
        }
        fs_1.default.mkdirSync(targetDir, { recursive: true });
        const metadata = {
            id: Date.now().toString(), // Simple ID, or passed from DB?
            name: safeProjectName,
            createdAt: new Date().toISOString(),
            status: 'created'
        };
        const configFile = path_1.default.join(targetDir, 'project.json');
        fs_1.default.writeFileSync(configFile, JSON.stringify(metadata, null, 4), 'utf-8');
        return true;
    }
    catch (error) {
        console.error("Error creating project folder:", error);
        return false;
    }
};
exports.createProjectFolder = createProjectFolder;
const deleteProjectFolder = (projectPath) => {
    try {
        const safeProjectPath = (0, PathSecurity_1.assertProjectRoot)(projectPath);
        if (fs_1.default.existsSync(safeProjectPath)) {
            fs_1.default.rmSync(safeProjectPath, { recursive: true, force: true });
        }
        return true;
    }
    catch (error) {
        console.error("Error deleting project folder:", error);
        return false;
    }
};
exports.deleteProjectFolder = deleteProjectFolder;
const getProjectMetadata = (projectPath) => {
    try {
        const safeProjectPath = (0, PathSecurity_1.assertProjectRoot)(projectPath);
        const configFile = path_1.default.join(safeProjectPath, 'project.json');
        if (fs_1.default.existsSync(configFile)) {
            const data = fs_1.default.readFileSync(configFile, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error("Error reading project metadata:", error);
    }
    return null;
};
exports.getProjectMetadata = getProjectMetadata;
const saveProjectMetadata = (projectPath, metadata) => {
    try {
        const safeProjectPath = (0, PathSecurity_1.assertProjectRoot)(projectPath);
        const configFile = path_1.default.join(safeProjectPath, 'project.json');
        let existing = {};
        if (fs_1.default.existsSync(configFile)) {
            try {
                existing = JSON.parse(fs_1.default.readFileSync(configFile, 'utf-8'));
            }
            catch (e) { }
        }
        const updated = { ...existing, ...metadata, updatedAt: new Date().toISOString() };
        fs_1.default.writeFileSync(configFile, JSON.stringify(updated, null, 4), 'utf-8');
        return true;
    }
    catch (error) {
        console.error("Error writing project metadata:", error);
        return false;
    }
};
exports.saveProjectMetadata = saveProjectMetadata;
const DEFAULT_PROMPT = {
    id: "minecraft-default",
    name: "Minecraft Video",
    systemPrompt: `You are a professional Minecraft subtitle translator.

STYLE RULES:
- Use official Minecraft terminology for the target language
- Keep translations natural, conversational, and suitable for voice-over dubbing
- Keep proper nouns (player names, server names) unchanged
- Translations should be concise and match subtitle timing

MINECRAFT GLOSSARY:
Use the correct official translations for these Minecraft terms:

Mobs: Creeper, Zombie, Skeleton, Spider, Enderman, Blaze, Ghast, Wither, Ender Dragon, Piglin, Hoglin, Zoglin, Warden, Allay, Villager, Iron Golem, Snow Golem, Phantom, Drowned, Husk, Stray, Witch, Pillager, Ravager, Vex, Evoker, Vindicator, Shulker, Guardian, Elder Guardian, Silverfish, Endermite, Slime, Magma Cube, Bee, Wolf, Cat, Fox, Axolotl, Frog, Sniffer, Camel, Breeze, Bogged, Wither Skeleton

Items/Blocks: Diamond, Netherite, Obsidian, Bedrock, Redstone, Glowstone, End Stone, Nether Brick, Deepslate, Copper, Amethyst, Sculk, Anvil, Enchanting Table, Brewing Stand, Beacon, Conduit, Lodestone, Respawn Anchor, Shulker Box, Ender Chest, Barrel, Blast Furnace, Smoker, Composter, Lectern, Cartography Table, Smithing Table, Stonecutter, Grindstone, Loom, Campfire, Soul Campfire, Lantern, Soul Lantern, Chain, Candle, Tinted Glass, Spyglass, Bundle, Brush, Elytra, Trident, Totem of Undying, Shield, Crossbow, Firework Rocket

Biomes/Dimensions: Overworld, Nether, The End, Deep Dark, Ancient City, Stronghold, Nether Fortress, Bastion Remnant, End City, Ocean Monument, Woodland Mansion, Trial Chamber, Plains, Forest, Desert, Taiga, Jungle, Swamp, Badlands, Mushroom Island, Cherry Grove, Mangrove Swamp, Lush Cave, Dripstone Cave, Frozen Ocean, Warm Ocean, Meadow, Snowy Slopes, Stony Peaks

Gameplay: Survival, Creative, Hardcore, Adventure, Spectator, Enchantment, Potion, Splash Potion, Lingering Potion, Experience (XP), Level, Hunger, Health, Hearts, Armor, Durability, Crafting, Smelting, Brewing, Farming, Mining, Speedrun, Speedrunning, PvP, PvE, Mob farm, XP farm, Iron farm, Gold farm, Raid farm, Chunk, Spawn, Respawn, Portal, Nether Portal, End Portal, Ender Eye, Blaze Rod, Ender Pearl, Nether Star, Dragon Egg, Wither Rose, Trading, Villager Trading, Emerald, Loot, Chest loot, Structure, Generated structure

Redstone/Technical: Redstone, Piston, Sticky Piston, Observer, Comparator, Repeater, Hopper, Dropper, Dispenser, TNT, Minecart, Rail, Powered Rail, Detector Rail, Activator Rail, Daylight Detector, Target Block, Sculk Sensor, Calibrated Sculk Sensor, Tripwire Hook, Pressure Plate, Button, Lever, Trapdoor, Fence Gate, Note Block, Jukebox, Bell

Enchantments: Sharpness, Smite, Bane of Arthropods, Knockback, Fire Aspect, Looting, Sweeping Edge, Unbreaking, Mending, Efficiency, Fortune, Silk Touch, Protection, Blast Protection, Fire Protection, Projectile Protection, Feather Falling, Respiration, Aqua Affinity, Depth Strider, Frost Walker, Soul Speed, Swift Sneak, Thorns, Power, Punch, Flame, Infinity, Loyalty, Riptide, Channeling, Impaling, Multishot, Piercing, Quick Charge, Luck of the Sea, Lure, Curse of Vanishing, Curse of Binding, Wind Burst, Breach, Density

Status Effects: Speed, Slowness, Haste, Mining Fatigue, Strength, Instant Health, Instant Damage, Jump Boost, Nausea, Regeneration, Resistance, Fire Resistance, Water Breathing, Invisibility, Blindness, Night Vision, Hunger, Weakness, Poison, Wither, Health Boost, Absorption, Saturation, Glowing, Levitation, Luck, Bad Luck, Slow Falling, Conduit Power, Hero of the Village, Darkness, Wind Charged, Weaving, Oozing, Infested, Raid Omen, Trial Omen`,
    isDefault: true,
};
const getPrompts = () => {
    const config = readConfig();
    if (!config.translatePrompts || config.translatePrompts.length === 0) {
        writeConfig({ translatePrompts: [DEFAULT_PROMPT] });
        return [DEFAULT_PROMPT];
    }
    return config.translatePrompts;
};
exports.getPrompts = getPrompts;
const savePrompts = (prompts) => {
    return writeConfig({ translatePrompts: prompts });
};
exports.savePrompts = savePrompts;
const getActivePromptId = () => {
    const config = readConfig();
    return config.activePromptId || "minecraft-default";
};
exports.getActivePromptId = getActivePromptId;
const setActivePromptId = (id) => {
    return writeConfig({ activePromptId: id });
};
exports.setActivePromptId = setActivePromptId;
const getDefaultBackgroundVolume = () => {
    const config = readConfig();
    return config.defaultBackgroundVolume ?? 10;
};
exports.getDefaultBackgroundVolume = getDefaultBackgroundVolume;
const setDefaultBackgroundVolume = (volume) => {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    return writeConfig({ defaultBackgroundVolume: clamped });
};
exports.setDefaultBackgroundVolume = setDefaultBackgroundVolume;
const getDefaultFadeDuration = () => {
    const config = readConfig();
    return config.defaultFadeDuration ?? 0.5;
};
exports.getDefaultFadeDuration = getDefaultFadeDuration;
const setDefaultFadeDuration = (duration) => {
    const clamped = Math.max(0, Math.min(2.0, duration));
    return writeConfig({ defaultFadeDuration: clamped });
};
exports.setDefaultFadeDuration = setDefaultFadeDuration;
//# sourceMappingURL=ConfigService.js.map