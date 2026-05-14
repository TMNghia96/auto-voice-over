"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TempFileManager_1 = require("../TempFileManager");
/**
 * Unit tests for Bug #4: Memory Leak Fix
 * Tests the TempFileManager to ensure proper cleanup
 */
(0, vitest_1.describe)('FinalVideoService - Memory Leak Fix (Bug #4)', () => {
    const testTempDir = path_1.default.join(process.cwd(), 'test_temp_cleanup');
    (0, vitest_1.beforeEach)(() => {
        // Create test directory
        if (!fs_1.default.existsSync(testTempDir)) {
            fs_1.default.mkdirSync(testTempDir, { recursive: true });
        }
    });
    (0, vitest_1.afterEach)(async () => {
        // Cleanup test directory
        if (fs_1.default.existsSync(testTempDir)) {
            fs_1.default.rmSync(testTempDir, { recursive: true, force: true });
        }
    });
    (0, vitest_1.it)('should register and unregister temp directories', () => {
        const dir1 = path_1.default.join(testTempDir, 'temp1');
        const dir2 = path_1.default.join(testTempDir, 'temp2');
        fs_1.default.mkdirSync(dir1, { recursive: true });
        fs_1.default.mkdirSync(dir2, { recursive: true });
        TempFileManager_1.tempManager.register(dir1);
        TempFileManager_1.tempManager.register(dir2);
        // Directories should exist
        (0, vitest_1.expect)(fs_1.default.existsSync(dir1)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(dir2)).toBe(true);
        TempFileManager_1.tempManager.unregister(dir1);
        TempFileManager_1.tempManager.unregister(dir2);
    });
    (0, vitest_1.it)('should cleanup registered directories', async () => {
        const dir = path_1.default.join(testTempDir, 'temp_cleanup');
        fs_1.default.mkdirSync(dir, { recursive: true });
        // Create some files
        fs_1.default.writeFileSync(path_1.default.join(dir, 'file1.txt'), 'test');
        fs_1.default.writeFileSync(path_1.default.join(dir, 'file2.txt'), 'test');
        TempFileManager_1.tempManager.register(dir);
        await TempFileManager_1.tempManager.cleanup();
        // Directory should be removed
        (0, vitest_1.expect)(fs_1.default.existsSync(dir)).toBe(false);
    });
    (0, vitest_1.it)('should handle cleanup of non-existent directories', async () => {
        const dir = path_1.default.join(testTempDir, 'non_existent');
        TempFileManager_1.tempManager.register(dir);
        // Should not throw error
        await (0, vitest_1.expect)(TempFileManager_1.tempManager.cleanup()).resolves.not.toThrow();
    });
    (0, vitest_1.it)('should cleanup multiple directories', async () => {
        const dirs = [
            path_1.default.join(testTempDir, 'temp1'),
            path_1.default.join(testTempDir, 'temp2'),
            path_1.default.join(testTempDir, 'temp3'),
        ];
        // Create directories
        dirs.forEach(dir => {
            fs_1.default.mkdirSync(dir, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(dir, 'test.txt'), 'data');
            TempFileManager_1.tempManager.register(dir);
        });
        await TempFileManager_1.tempManager.cleanup();
        // All should be removed
        dirs.forEach(dir => {
            (0, vitest_1.expect)(fs_1.default.existsSync(dir)).toBe(false);
        });
    });
    (0, vitest_1.it)('should cleanup nested directories', async () => {
        const dir = path_1.default.join(testTempDir, 'parent');
        const subdir = path_1.default.join(dir, 'child');
        fs_1.default.mkdirSync(subdir, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(subdir, 'file.txt'), 'test');
        TempFileManager_1.tempManager.register(dir);
        await TempFileManager_1.tempManager.cleanup();
        (0, vitest_1.expect)(fs_1.default.existsSync(dir)).toBe(false);
        (0, vitest_1.expect)(fs_1.default.existsSync(subdir)).toBe(false);
    });
    (0, vitest_1.it)('should cleanup old temp files based on age', async () => {
        const projectsDir = path_1.default.join(testTempDir, 'projects');
        const project1 = path_1.default.join(projectsDir, 'project1');
        const tempDir1 = path_1.default.join(project1, 'temp_final');
        fs_1.default.mkdirSync(tempDir1, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(tempDir1, 'test.txt'), 'data');
        // Modify mtime to be 25 hours ago
        const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
        fs_1.default.utimesSync(tempDir1, oldTime, oldTime);
        await (0, TempFileManager_1.cleanupOldTempFiles)(projectsDir);
        // Should be removed (older than 24 hours)
        (0, vitest_1.expect)(fs_1.default.existsSync(tempDir1)).toBe(false);
    });
    (0, vitest_1.it)('should not cleanup recent temp files', async () => {
        const projectsDir = path_1.default.join(testTempDir, 'projects');
        const project1 = path_1.default.join(projectsDir, 'project1');
        const tempDir1 = path_1.default.join(project1, 'temp_final');
        fs_1.default.mkdirSync(tempDir1, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(tempDir1, 'test.txt'), 'data');
        await (0, TempFileManager_1.cleanupOldTempFiles)(projectsDir);
        // Should still exist (less than 24 hours old)
        (0, vitest_1.expect)(fs_1.default.existsSync(tempDir1)).toBe(true);
    });
    (0, vitest_1.it)('should handle cleanup errors gracefully', async () => {
        const dir = path_1.default.join(testTempDir, 'locked_dir');
        fs_1.default.mkdirSync(dir, { recursive: true });
        TempFileManager_1.tempManager.register(dir);
        // Mock rmSync to throw error
        const originalRmSync = fs_1.default.rmSync;
        vitest_1.vi.spyOn(fs_1.default, 'rmSync').mockImplementation(() => {
            throw new Error('Permission denied');
        });
        // Should not throw, just log error
        await (0, vitest_1.expect)(TempFileManager_1.tempManager.cleanup()).resolves.not.toThrow();
        // Restore original
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)('should handle empty projects directory', async () => {
        const projectsDir = path_1.default.join(testTempDir, 'empty_projects');
        fs_1.default.mkdirSync(projectsDir, { recursive: true });
        await (0, vitest_1.expect)((0, TempFileManager_1.cleanupOldTempFiles)(projectsDir)).resolves.not.toThrow();
    });
    (0, vitest_1.it)('should handle non-existent projects directory', async () => {
        const projectsDir = path_1.default.join(testTempDir, 'non_existent_projects');
        await (0, vitest_1.expect)((0, TempFileManager_1.cleanupOldTempFiles)(projectsDir)).resolves.not.toThrow();
    });
    (0, vitest_1.it)('should cleanup large temp directories', async () => {
        const dir = path_1.default.join(testTempDir, 'large_temp');
        fs_1.default.mkdirSync(dir, { recursive: true });
        // Create many files
        for (let i = 0; i < 100; i++) {
            fs_1.default.writeFileSync(path_1.default.join(dir, `file${i}.txt`), 'x'.repeat(1000));
        }
        TempFileManager_1.tempManager.register(dir);
        await TempFileManager_1.tempManager.cleanup();
        (0, vitest_1.expect)(fs_1.default.existsSync(dir)).toBe(false);
    });
    (0, vitest_1.it)('should handle concurrent cleanup calls', async () => {
        const dirs = Array.from({ length: 5 }, (_, i) => path_1.default.join(testTempDir, `concurrent_${i}`));
        dirs.forEach(dir => {
            fs_1.default.mkdirSync(dir, { recursive: true });
            TempFileManager_1.tempManager.register(dir);
        });
        // Call cleanup multiple times concurrently
        const cleanups = [
            TempFileManager_1.tempManager.cleanup(),
            TempFileManager_1.tempManager.cleanup(),
            TempFileManager_1.tempManager.cleanup(),
        ];
        await (0, vitest_1.expect)(Promise.all(cleanups)).resolves.not.toThrow();
        // All directories should be removed
        dirs.forEach(dir => {
            (0, vitest_1.expect)(fs_1.default.existsSync(dir)).toBe(false);
        });
    });
});
//# sourceMappingURL=TempFileManager.test.js.map