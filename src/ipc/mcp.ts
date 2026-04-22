import { ipcMain } from 'electron';
import { mcpService } from '../services/McpService';

export const setupMcpIpc = () => {
    ipcMain.handle('mcp-get-status', () => {
        return mcpService.getStatus();
    });
};
