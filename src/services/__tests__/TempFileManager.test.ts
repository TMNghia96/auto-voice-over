import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tempManager, cleanupOldTempFiles } from '../TempFileManager';

/**
 * Unit tests for Bug #4: Memory Leak Fix
 * Tests the TempFileManager to ensure proper cleanup
 */
describe('FinalVideoService - Memory Leak Fix (Bug #4)', () => {
    const testTempDir = path.join(process.cwd(), 'test_temp_cleanup');
    
    beforeEach(() => {
        // Create test directory
        if (!fs.existsSync(testTempDir)) {
            fs.mkdirSync(testTempDir, { recursive: true });
        }
    });
    
    afterEach(async () => {
        // Cleanup test directory
        if (fs.existsSync(testTempDir)) {
            fs.rmSync(testTempDir, { recursive: true, force: true });
        }
    });
    
    it('should register and unregister temp directories', () => {
        const dir1 = path.join(testTempDir, 'temp1');
        const dir2 = path.join(testTempDir, 'temp2');
        
        fs.mkdirSync(dir1, { recursive: true });
        fs.mkdirSync(dir2, { recursive: true });
        
        tempManager.register(dir1);
        tempManager.register(dir2);
        
        // Directories should exist
        expect(fs.existsSync(dir1)).toBe(true);
        expect(fs.existsSync(dir2)).toBe(true);
        
        tempManager.unregister(dir1);
        tempManager.unregister(dir2);
    });
    
    it('should cleanup registered directories', async () => {
        const dir = path.join(testTempDir, 'temp_cleanup');
        fs.mkdirSync(dir, { recursive: true });
        
        // Create some files
        fs.writeFileSync(path.join(dir, 'file1.txt'), 'test');
        fs.writeFileSync(path.join(dir, 'file2.txt'), 'test');
        
        tempManager.register(dir);
        await tempManager.cleanup();
        
        // Directory should be removed
        expect(fs.existsSync(dir)).toBe(false);
    });
    
    it('should handle cleanup of non-existent directories', async () => {
        const dir = path.join(testTempDir, 'non_existent');
        
        tempManager.register(dir);
        
        // Should not throw error
        await expect(tempManager.cleanup()).resolves.not.toThrow();
    });
    
    it('should cleanup multiple directories', async () => {
        const dirs = [
            path.join(testTempDir, 'temp1'),
            path.join(testTempDir, 'temp2'),
            path.join(testTempDir, 'temp3'),
        ];
        
        // Create directories
        dirs.forEach(dir => {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'test.txt'), 'data');
            tempManager.register(dir);
        });
        
        await tempManager.cleanup();
        
        // All should be removed
        dirs.forEach(dir => {
            expect(fs.existsSync(dir)).toBe(false);
        });
    });
    
    it('should cleanup nested directories', async () => {
        const dir = path.join(testTempDir, 'parent');
        const subdir = path.join(dir, 'child');
        
        fs.mkdirSync(subdir, { recursive: true });
        fs.writeFileSync(path.join(subdir, 'file.txt'), 'test');
        
        tempManager.register(dir);
        await tempManager.cleanup();
        
        expect(fs.existsSync(dir)).toBe(false);
        expect(fs.existsSync(subdir)).toBe(false);
    });
    
    it('should cleanup old temp files based on age', async () => {
        const projectsDir = path.join(testTempDir, 'projects');
        const project1 = path.join(projectsDir, 'project1');
        const tempDir1 = path.join(project1, 'temp_final');
        
        fs.mkdirSync(tempDir1, { recursive: true });
        fs.writeFileSync(path.join(tempDir1, 'test.txt'), 'data');
        
        // Modify mtime to be 25 hours ago
        const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
        fs.utimesSync(tempDir1, oldTime, oldTime);
        
        await cleanupOldTempFiles(projectsDir);
        
        // Should be removed (older than 24 hours)
        expect(fs.existsSync(tempDir1)).toBe(false);
    });
    
    it('should not cleanup recent temp files', async () => {
        const projectsDir = path.join(testTempDir, 'projects');
        const project1 = path.join(projectsDir, 'project1');
        const tempDir1 = path.join(project1, 'temp_final');
        
        fs.mkdirSync(tempDir1, { recursive: true });
        fs.writeFileSync(path.join(tempDir1, 'test.txt'), 'data');
        
        await cleanupOldTempFiles(projectsDir);
        
        // Should still exist (less than 24 hours old)
        expect(fs.existsSync(tempDir1)).toBe(true);
    });
    
    it('should handle cleanup errors gracefully', async () => {
        const dir = path.join(testTempDir, 'locked_dir');
        fs.mkdirSync(dir, { recursive: true });
        
        tempManager.register(dir);
        
        // Mock rmSync to throw error
        const originalRmSync = fs.rmSync;
        vi.spyOn(fs, 'rmSync').mockImplementation(() => {
            throw new Error('Permission denied');
        });
        
        // Should not throw, just log error
        await expect(tempManager.cleanup()).resolves.not.toThrow();
        
        // Restore original
        vi.restoreAllMocks();
    });
    
    it('should handle empty projects directory', async () => {
        const projectsDir = path.join(testTempDir, 'empty_projects');
        fs.mkdirSync(projectsDir, { recursive: true });
        
        await expect(cleanupOldTempFiles(projectsDir)).resolves.not.toThrow();
    });
    
    it('should handle non-existent projects directory', async () => {
        const projectsDir = path.join(testTempDir, 'non_existent_projects');
        
        await expect(cleanupOldTempFiles(projectsDir)).resolves.not.toThrow();
    });
    
    it('should cleanup large temp directories', async () => {
        const dir = path.join(testTempDir, 'large_temp');
        fs.mkdirSync(dir, { recursive: true });
        
        // Create many files
        for (let i = 0; i < 100; i++) {
            fs.writeFileSync(path.join(dir, `file${i}.txt`), 'x'.repeat(1000));
        }
        
        tempManager.register(dir);
        await tempManager.cleanup();
        
        expect(fs.existsSync(dir)).toBe(false);
    });
    
    it('should handle concurrent cleanup calls', async () => {
        const dirs = Array.from({ length: 5 }, (_, i) => 
            path.join(testTempDir, `concurrent_${i}`)
        );
        
        dirs.forEach(dir => {
            fs.mkdirSync(dir, { recursive: true });
            tempManager.register(dir);
        });
        
        // Call cleanup multiple times concurrently
        const cleanups = [
            tempManager.cleanup(),
            tempManager.cleanup(),
            tempManager.cleanup(),
        ];
        
        await expect(Promise.all(cleanups)).resolves.not.toThrow();
        
        // All directories should be removed
        dirs.forEach(dir => {
            expect(fs.existsSync(dir)).toBe(false);
        });
    });
});
