"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startVideoServer = exports.closeStreamsForPath = void 0;
const http = __importStar(require("http"));
const url = __importStar(require("url"));
const fs_1 = __importDefault(require("fs"));
const PathSecurity_1 = require("./PathSecurity");
const activeStreams = new Set();
/**
 * Close all active streams whose file path starts with the given prefix.
 * This must be called before deleting a project folder to release file locks on Windows.
 */
const closeStreamsForPath = (pathPrefix) => {
    const normalizedPrefix = pathPrefix.replace(/\\/g, '/').toLowerCase();
    for (const entry of activeStreams) {
        const normalizedPath = entry.filePath.replace(/\\/g, '/').toLowerCase();
        if (normalizedPath.startsWith(normalizedPrefix)) {
            try {
                entry.stream.destroy();
            }
            catch (error) {
                // Ignore destroy errors because the stream may already be closed.
                void error;
            }
            activeStreams.delete(entry);
        }
    }
};
exports.closeStreamsForPath = closeStreamsForPath;
const startVideoServer = () => {
    return new Promise((resolve) => {
        const videoHeaders = (req, extra = {}) => {
            const origin = req.headers.origin;
            const headers = {
                "Accept-Ranges": "bytes",
                "Content-Type": "video/mp4",
                ...extra,
            };
            if (typeof origin === "string" && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
                headers["Access-Control-Allow-Origin"] = origin;
                headers["Vary"] = "Origin";
            }
            return headers;
        };
        const server = http.createServer((req, res) => {
            if (!req.url) {
                res.writeHead(404);
                res.end();
                return;
            }
            const parsedUrl = url.parse(req.url, true);
            if (parsedUrl.pathname === "/video") {
                const requestedPath = parsedUrl.query.path;
                if (!requestedPath) {
                    res.writeHead(400);
                    res.end("Missing path parameter");
                    return;
                }
                let filePath;
                try {
                    filePath = (0, PathSecurity_1.assertVideoFile)(requestedPath);
                }
                catch (error) {
                    if (error instanceof PathSecurity_1.PathSecurityError) {
                        res.writeHead(403);
                        res.end("Forbidden");
                        return;
                    }
                    console.error(`Video file not found: ${requestedPath}`);
                    res.writeHead(404);
                    res.end("File not found");
                    return;
                }
                try {
                    const stat = fs_1.default.statSync(filePath);
                    const fileSize = stat.size;
                    const rangeHeader = req.headers.range;
                    let readStream;
                    if (rangeHeader) {
                        const parts = rangeHeader
                            .replace(/bytes=/, "")
                            .split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                        if (start >= fileSize ||
                            end >= fileSize ||
                            start > end) {
                            res.writeHead(416, {
                                "Content-Range": `bytes */${fileSize}`,
                            });
                            res.end();
                            return;
                        }
                        const chunksize = end - start + 1;
                        res.writeHead(206, videoHeaders(req, {
                            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                            "Content-Length": chunksize,
                        }));
                        readStream = fs_1.default.createReadStream(filePath, { start, end });
                    }
                    else {
                        res.writeHead(200, videoHeaders(req, {
                            "Content-Length": fileSize,
                        }));
                        readStream = fs_1.default.createReadStream(filePath);
                    }
                    const entry = { filePath, stream: readStream };
                    activeStreams.add(entry);
                    const cleanup = () => {
                        activeStreams.delete(entry);
                        if (!readStream.destroyed) {
                            readStream.destroy();
                        }
                    };
                    readStream.on('end', cleanup);
                    readStream.on('error', cleanup);
                    readStream.on('close', cleanup);
                    res.on('close', cleanup);
                    readStream.pipe(res);
                }
                catch (err) {
                    console.error("Error streaming video:", err);
                    res.writeHead(500);
                    res.end("Server error");
                }
            }
            else {
                res.writeHead(404);
                res.end();
            }
        });
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.warn("[VideoServerService] Port 9999 is already in use. Server may already be running.");
                resolve(); // Resolve anyway, as the server is presumably up
            }
            else {
                console.error("[VideoServerService] Server error:", err);
            }
        });
        server.listen(9999, "127.0.0.1", () => {
            console.log("Video server started on http://127.0.0.1:9999");
            resolve();
        });
    });
};
exports.startVideoServer = startVideoServer;
//# sourceMappingURL=VideoServerService.js.map