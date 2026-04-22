import { spawnSync } from 'child_process';
import fs from 'fs';
import { normalizePath, matchesProjectId } from './BrowserPathUtils';

export { normalizePath, matchesProjectId };

/**
 * Chuyển đổi đường dẫn dài sang định dạng 8.3 (Short Path) trên Windows.

/**
 * Chuyển đổi đường dẫn dài sang định dạng 8.3 (Short Path) trên Windows.
 * Tránh lỗi khi truyền đường dẫn có khoảng trắng hoặc dấu tiếng Việt vào CLI.
 */
export const getWindowsShortPath = (longPath: string): string => {
    if (process.platform !== 'win32' || !longPath) return longPath;
    
    try {
        if (!fs.existsSync(longPath)) return longPath;
        
        const isDirectory = fs.statSync(longPath).isDirectory();
        const method = isDirectory ? 'GetFolder' : 'GetFile';
        
        // Escape single quotes for PowerShell
        const escapedPath = longPath.replace(/'/g, "''");
        const cmd = `(New-Object -ComObject Scripting.FileSystemObject).${method}('${escapedPath}').ShortPath`;
        
        const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf-8' });
        
        if (result.status === 0 && result.stdout) {
            return result.stdout.trim() || longPath;
        }
        return longPath;
    } catch (err) {
        console.error('[PathUtils] Failed to get short path:', err);
        return longPath;
    }
};
