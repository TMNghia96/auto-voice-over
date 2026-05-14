import { app } from "electron";
import { connectDB } from "./services/DatabaseService";
import { startVideoServer } from "./services/VideoServerService";
import { mcpService } from "./services/McpService";

const run = async () => {
  console.log("[MCP Main] Booting standalone MCP process...");

  try {
    connectDB();
    console.log("[MCP Main] Database ready.");
  } catch (error) {
    console.error("[MCP Main] Database init failed:", error);
    app.quit();
    return;
  }

  try {
    await startVideoServer();
    console.log("[MCP Main] Video server ready.");
  } catch (error) {
    console.error("[MCP Main] Video server init failed:", error);
    app.quit();
    return;
  }

  try {
    mcpService.start();
    console.log("[MCP Main] MCP service started.");
  } catch (error) {
    console.error("[MCP Main] MCP service failed:", error);
    app.quit();
  }
};

app.whenReady().then(run);

app.on("window-all-closed", () => {
  // Standalone MCP process has no windows; keep service alive until process exits.
});
