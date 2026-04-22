import fs from 'fs';
import { exec } from 'child_process';

/**
 * TempFileManager - Singleton class to manage temporary directories
 * FIX BUG #4: Ensures temp files are cleaned up even if process crashes
 */
class TempFileManager {
    private static instance: TempFileManager;
    private tempDirs: Set<string> = new Set();
    private isCleaningUp = false;
    
    private constructor() {
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
    
    static getInstance(): TempFileManager {
        if (!TempFileManager.instance) {
            TempFileManager.instance = new TempFileManager();
        }
        return TempFileManager.instance;
    }
    
    register(dir: string): void {
        this.tempDirs.add(dir);
        console.log(`[TempManager] Registered: ${dir}`);
    }
    
    unregister(dir: string): void {
        this.tempDirs.delete(dir);
        console.log(`[TempManager] Unregistered: ${dir}`);
    }
    
    private handleSignal(signal: string): void {
        console.log(`[TempManager] Received ${signal}, cleaning up...`);
        this.cleanupSync();
        process.exit(0);
    }
    
    private cleanupSync(): void {
        if (this.isCleaningUp) return;
        this.isCleaningUp = true;
        
        console.log(`[TempManager] Cleaning up ${this.tempDirs.size} directories...`);
        
        for (const dir of this.tempDirs) {
            try {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                    console.log(`[TempManager] Cleaned: ${dir}`);
                }
            } catch (e) {
                console.error(`[TempManager] Failed to clean ${dir}:`, e);
            }
        }
        
        this.tempDirs.clear();
        this.isCleaningUp = false;
    }
    
    async cleanup(): Promise<void> {
        if (this.isCleaningUp) return;
        this.isCleaningUp = true;
        
        console.log(`[TempManager] Cleaning up ${this.tempDirs.size} directories...`);
        
        for (const dir of this.tempDirs) {
            try {
                // Force unlock files on Windows
                if (process.platform === 'win32') {
                    await this.unlockDirectory(dir);
                }
                
                // Remove directory with retries
                await fs.promises.rm(dir, { 
                    recursive: true, 
                    force: true,
                    maxRetries: 3,
                    retryDelay: 1000
                });
                
                console.log(`[TempManager] Cleaned: ${dir}`);
            } catch (e) {
                console.error(`[TempManager] Failed to clean ${dir}:`, e);
            }
        }
        
        this.tempDirs.clear();
        this.isCleaningUp = false;
    }
    
    private async unlockDirectory(dir: string): Promise<void> {
        return new Promise((resolve) => {
            // Try to kill processes holding files (requires handle.exe from Sysinternals)
            exec(`handle.exe "${dir}" /accepteula`, (error) => {
                // Ignore errors, handle.exe might not be installed
                resolve();
            });
            
            // Timeout after 2 seconds
            setTimeout(() => resolve(), 2000);
        });
    }
}

export const tempManager = TempFileManager.getInstance();

/**
 * Cleanup old temp files on startup
 * Removes temp directories older than 24 hours
 */
export const cleanupOldTempFiles = async (projectsDir: string): Promise<void> => {
    try {
        if (!fs.existsSync(projectsDir)) return;
        
        const projects = await fs.promises.readdir(projectsDir);
        let cleanedCount = 0;
        
        for (const project of projects) {
            const projectPath = require('path').join(projectsDir, project);
            const tempDir = require('path').join(projectPath, 'temp_final');
            
            if (fs.existsSync(tempDir)) {
                const stat = await fs.promises.stat(tempDir);
                const age = Date.now() - stat.mtimeMs;
                
                // Cleanup if older than 24 hours
                if (age > 24 * 60 * 60 * 1000) {
                    console.log(`[Cleanup] Removing old temp: ${tempDir}`);
                    await fs.promises.rm(tempDir, { recursive: true, force: true });
                    cleanedCount++;
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[Cleanup] Removed ${cleanedCount} old temp directories`);
        }
    } catch (e) {
        console.error('[Cleanup] Failed to cleanup old temp files:', e);
    }
};
