import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import started from "electron-squirrel-startup";
import { connectDB } from "./services/DatabaseService";
import { startVideoServer } from "./services/VideoServerService";
import { setupIpcHandlers } from "./ipc";
import { mcpService } from "./services/McpService";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

if (started) {
	app.quit();
}

const createWindow = () => {
	connectDB();

	const preloadPath = path.join(__dirname, "preload.js");
	console.log(`[Main] Using preload script at: ${preloadPath}`);

	const mainWindow = new BrowserWindow({
		minHeight: 720,
		minWidth: 1280,
		autoHideMenuBar: true,
		icon: path.join(__dirname, "../../src/assets/logo.png"),
		webPreferences: {
			preload: preloadPath,
		},
	});

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
		mainWindow.webContents.openDevTools({ mode: 'detach' });
	} else {
		mainWindow.loadFile(
			path.join(
				__dirname,
				`../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
			),
		);
	}
};

let settingsWindow: BrowserWindow | null = null;

ipcMain.handle("open-settings-window", () => {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.focus();
		return;
	}

	settingsWindow = new BrowserWindow({
		minHeight: 720,
		minWidth: 1280,
		autoHideMenuBar: true,
		icon: path.join(__dirname, "../../src/assets/logo.png"),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		settingsWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/settings/whisper-model`);
	} else {
		settingsWindow.loadFile(
			path.join(
				__dirname,
				`../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
			),
			{ hash: "/settings/whisper-model" },
		);
	}

	settingsWindow.on("closed", () => {
		settingsWindow = null;
	});
});

app.whenReady().then(async () => {
	console.log("[Main] App is ready. Starting services...");
	
	try {
		console.log("[Main] Starting Video Server...");
		await startVideoServer();
		console.log("[Main] Video Server started.");
	} catch (error) {
		console.error("[Main] Failed to start Video Server:", error);
	}

	console.log("[Main] Setting up IPC Handlers...");
	setupIpcHandlers();
	console.log("[Main] IPC Handlers ready.");

	try {
		console.log("[Main] Starting MCP Service...");
		mcpService.start();
		// MCP start log is inside the service
	} catch (error) {
		console.error("[Main] Failed to start MCP Service:", error);
	}
	
	console.log("[Main] Creating Main Window...");
	createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});
