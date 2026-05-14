"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWindowsShortPath = exports.matchesProjectId = exports.normalizePath = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const BrowserPathUtils_1 = require("./BrowserPathUtils");
Object.defineProperty(exports, "normalizePath", { enumerable: true, get: function () { return BrowserPathUtils_1.normalizePath; } });
Object.defineProperty(exports, "matchesProjectId", { enumerable: true, get: function () { return BrowserPathUtils_1.matchesProjectId; } });
/**
 * Chuyển đổi đường dẫn dài sang định dạng 8.3 (Short Path) trên Windows.

/**
 * Chuyển đổi đường dẫn dài sang định dạng 8.3 (Short Path) trên Windows.
 * Tránh lỗi khi truyền đường dẫn có khoảng trắng hoặc dấu tiếng Việt vào CLI.
 */
const getWindowsShortPath = (longPath) => {
    if (process.platform !== 'win32' || !longPath)
        return longPath;
    try {
        if (!fs_1.default.existsSync(longPath))
            return longPath;
        const isDirectory = fs_1.default.statSync(longPath).isDirectory();
        const method = isDirectory ? 'GetFolder' : 'GetFile';
        // Escape single quotes for PowerShell
        const escapedPath = longPath.replace(/'/g, "''");
        const cmd = `(New-Object -ComObject Scripting.FileSystemObject).${method}('${escapedPath}').ShortPath`;
        const result = (0, child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf-8' });
        if (result.status === 0 && result.stdout) {
            return result.stdout.trim() || longPath;
        }
        return longPath;
    }
    catch (err) {
        console.error('[PathUtils] Failed to get short path:', err);
        return longPath;
    }
};
exports.getWindowsShortPath = getWindowsShortPath;
//# sourceMappingURL=PathUtils.js.map