"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHardwareInfo = void 0;
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const getHardwareInfo = () => {
    return new Promise((resolve) => {
        const cpuName = os_1.default.cpus()[0]?.model || "Unknown CPU";
        const totalRamGB = Math.round(os_1.default.totalmem() / (1024 * 1024 * 1024));
        // Detect GPUs on Windows using PowerShell
        if (process.platform === "win32") {
            (0, child_process_1.exec)("powershell -command \"Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name\"", (error, stdout) => {
                let gpus = [];
                let hasNvidiaGpu = false;
                let hasAmdGpu = false;
                let hasVulkanGpu = false;
                if (!error && stdout) {
                    const lines = stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    gpus = lines;
                    hasNvidiaGpu = lines.some(name => name.toLowerCase().includes("nvidia"));
                    hasAmdGpu = lines.some(name => name.toLowerCase().includes("amd") || name.toLowerCase().includes("radeon"));
                    const hasIntelGpu = lines.some(name => name.toLowerCase().includes("intel") && (name.toLowerCase().includes("arc") ||
                        name.toLowerCase().includes("iris") ||
                        name.toLowerCase().includes("uhd") ||
                        name.toLowerCase().includes("hd graphics")));
                    console.log("[HardwareService] Found GPUs:", lines);
                    hasVulkanGpu = hasNvidiaGpu || hasAmdGpu || hasIntelGpu;
                    console.log("[HardwareService] hasNvidiaGpu:", hasNvidiaGpu, "hasAmdGpu:", hasAmdGpu, "hasVulkanGpu:", hasVulkanGpu);
                }
                else if (error) {
                    console.error("[HardwareService] PowerShell error:", error);
                }
                resolve({
                    cpuName,
                    totalRamGB,
                    gpus,
                    hasNvidiaGpu,
                    hasAmdGpu,
                    hasVulkanGpu,
                });
            });
        }
        else {
            resolve({
                cpuName,
                totalRamGB,
                gpus: ["Unknown GPU"],
                hasNvidiaGpu: false,
                hasAmdGpu: false,
                hasVulkanGpu: false,
            });
        }
    });
};
exports.getHardwareInfo = getHardwareInfo;
//# sourceMappingURL=HardwareService.js.map