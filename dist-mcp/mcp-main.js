"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const DatabaseService_1 = require("./services/DatabaseService");
const VideoServerService_1 = require("./services/VideoServerService");
const McpService_1 = require("./services/McpService");
const AppPaths_1 = require("./services/AppPaths");
(0, AppPaths_1.configureAppIdentity)();
const run = async () => {
    console.log("[MCP Main] Booting standalone MCP process...");
    try {
        (0, DatabaseService_1.connectDB)();
        console.log("[MCP Main] Database ready.");
    }
    catch (error) {
        console.error("[MCP Main] Database init failed:", error);
        electron_1.app.quit();
        return;
    }
    try {
        await (0, VideoServerService_1.startVideoServer)();
        console.log("[MCP Main] Video server ready.");
    }
    catch (error) {
        console.error("[MCP Main] Video server init failed:", error);
        electron_1.app.quit();
        return;
    }
    try {
        McpService_1.mcpService.start();
        console.log("[MCP Main] MCP service started.");
    }
    catch (error) {
        console.error("[MCP Main] MCP service failed:", error);
        electron_1.app.quit();
    }
};
electron_1.app.whenReady().then(run);
electron_1.app.on("window-all-closed", () => {
    // Standalone MCP process has no windows; keep service alive until process exits.
});
//# sourceMappingURL=mcp-main.js.map