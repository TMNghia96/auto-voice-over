"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupOldTempFiles = exports.tempManager = void 0;
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
/**
 * TempFileManager - Singleton class to manage temporary directories
 * FIX BUG #4: Ensures temp files are cleaned up even if process crashes
 */
class TempFileManager {
    static instance;
    tempDirs = new Set();
    isCleaningUp = false;
    constructor() {
        // Register cleanup handlers
        process.on('exit', () => this.cleanupSync());
        process.on('SIGINT', () => this.handleSignal('SIGINT'));
        process.on('SIGTERM', () => this.handleSignal('SIGTERM'));
        process.on('uncaughtException', (err) => {
            console.error('[TempManager] Uncaught exception:', err);
            this.cleanupSync();
            process.exit(1);
        });
    }
    static getInstance() {
        if (!TempFileManager.instance) {
            TempFileManager.instance = new TempFileManager();
        }
        return TempFileManager.instance;
    }
    register(dir) {
        this.tempDirs.add(dir);
        console.log(`[TempManager] Registered: ${dir}`);
    }
    unregister(dir) {
        this.tempDirs.delete(dir);
        console.log(`[TempManager] Unregistered: ${dir}`);
    }
    handleSignal(signal) {
        console.log(`[TempManager] Received ${signal}, cleaning up...`);
        this.cleanupSync();
        process.exit(0);
    }
    cleanupSync() {
        if (this.isCleaningUp)
            return;
        this.isCleaningUp = true;
        console.log(`[TempManager] Cleaning up ${this.tempDirs.size} directories...`);
        for (const dir of this.tempDirs) {
            try {
                if (fs_1.default.existsSync(dir)) {
                    fs_1.default.rmSync(dir, { recursive: true, force: true });
                    console.log(`[TempManager] Cleaned: ${dir}`);
                }
            }
            catch (e) {
                console.error(`[TempManager] Failed to clean ${dir}:`, e);
            }
        }
        this.tempDirs.clear();
        this.isCleaningUp = false;
    }
    async cleanup() {
        if (this.isCleaningUp)
            return;
        this.isCleaningUp = true;
        console.log(`[TempManager] Cleaning up ${this.tempDirs.size} directories...`);
        for (const dir of this.tempDirs) {
            try {
                // Force unlock files on Windows
                if (process.platform === 'win32') {
                    await this.unlockDirectory(dir);
                }
                // Remove directory with retries
                await fs_1.default.promises.rm(dir, {
                    recursive: true,
                    force: true,
                    maxRetries: 3,
                    retryDelay: 1000
                });
                console.log(`[TempManager] Cleaned: ${dir}`);
            }
            catch (e) {
                console.error(`[TempManager] Failed to clean ${dir}:`, e);
            }
        }
        this.tempDirs.clear();
        this.isCleaningUp = false;
    }
    async cleanupDirectory(dir) {
        try {
            if (process.platform === 'win32') {
                await this.unlockDirectory(dir);
            }
            await fs_1.default.promises.rm(dir, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 1000
            });
            this.unregister(dir);
            console.log(`[TempManager] Cleaned: ${dir}`);
        }
        catch (e) {
            console.error(`[TempManager] Failed to clean ${dir}:`, e);
        }
    }
    async unlockDirectory(dir) {
        return new Promise((resolve) => {
            // Try to kill processes holding files (requires handle.exe from Sysinternals)
            (0, child_process_1.exec)(`handle.exe "${dir}" /accepteula`, (error) => {
                // Ignore errors, handle.exe might not be installed
                resolve();
            });
            // Timeout after 2 seconds
            setTimeout(() => resolve(), 2000);
        });
    }
}
exports.tempManager = TempFileManager.getInstance();
/**
 * Cleanup old temp files on startup
 * Removes temp directories older than 24 hours
 */
const cleanupOldTempFiles = async (projectsDir) => {
    try {
        if (!fs_1.default.existsSync(projectsDir))
            return;
        const projects = await fs_1.default.promises.readdir(projectsDir);
        let cleanedCount = 0;
        for (const project of projects) {
            const projectPath = require('path').join(projectsDir, project);
            const tempDir = require('path').join(projectPath, 'temp_final');
            if (fs_1.default.existsSync(tempDir)) {
                const stat = await fs_1.default.promises.stat(tempDir);
                const age = Date.now() - stat.mtimeMs;
                // Cleanup if older than 24 hours
                if (age > 24 * 60 * 60 * 1000) {
                    console.log(`[Cleanup] Removing old temp: ${tempDir}`);
                    await fs_1.default.promises.rm(tempDir, { recursive: true, force: true });
                    cleanedCount++;
                }
            }
        }
        if (cleanedCount > 0) {
            console.log(`[Cleanup] Removed ${cleanedCount} old temp directories`);
        }
    }
    catch (e) {
        console.error('[Cleanup] Failed to cleanup old temp files:', e);
    }
};
exports.cleanupOldTempFiles = cleanupOldTempFiles;
//# sourceMappingURL=TempFileManager.js.map