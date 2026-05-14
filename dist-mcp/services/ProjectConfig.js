"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigPath = getConfigPath;
exports.loadProjectConfig = loadProjectConfig;
exports.saveProjectConfig = saveProjectConfig;
exports.getVoicePreference = getVoicePreference;
exports.setVoicePreference = setVoicePreference;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_CONFIG = {
    version: 1,
    voicePreferences: {},
    concurrencySettings: { initial: 5, min: 3, max: 15 },
};
function getConfigPath(projectPath) {
    return path_1.default.join(projectPath, '.auto-voice-over', 'config.json');
}
function loadProjectConfig(projectPath) {
    const configPath = getConfigPath(projectPath);
    if (!fs_1.default.existsSync(configPath))
        return { ...DEFAULT_CONFIG };
    try {
        const content = fs_1.default.readFileSync(configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    }
    catch (err) {
        console.error('Failed to load project config:', err);
        return { ...DEFAULT_CONFIG };
    }
}
function saveProjectConfig(projectPath, config) {
    const configPath = getConfigPath(projectPath);
    const configDir = path_1.default.dirname(configPath);
    if (!fs_1.default.existsSync(configDir))
        fs_1.default.mkdirSync(configDir, { recursive: true });
    try {
        fs_1.default.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to save project config:', err);
    }
}
function getVoicePreference(projectPath, lang) {
    return loadProjectConfig(projectPath).voicePreferences?.[lang];
}
function setVoicePreference(projectPath, lang, voiceId) {
    const config = loadProjectConfig(projectPath);
    if (!config.voicePreferences)
        config.voicePreferences = {};
    config.voicePreferences[lang] = voiceId;
    saveProjectConfig(projectPath, config);
}
//# sourceMappingURL=ProjectConfig.js.map