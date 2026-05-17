import * as http from "http";
import * as url from "url";
import fs from "fs";
import { assertVideoFile, PathSecurityError } from "./PathSecurity";

const activeStreams = new Set<{ filePath: string; stream: fs.ReadStream }>();

/**
 * Close all active streams whose file path starts with the given prefix.
 * This must be called before deleting a project folder to release file locks on Windows.
 */
export const closeStreamsForPath = (pathPrefix: string): void => {
    const normalizedPrefix = pathPrefix.replace(/\\/g, '/').toLowerCase();
    for (const entry of activeStreams) {
        const normalizedPath = entry.filePath.replace(/\\/g, '/').toLowerCase();
        if (normalizedPath.startsWith(normalizedPrefix)) {
            try {
                entry.stream.destroy();
            } catch (error) {
                // Ignore destroy errors because the stream may already be closed.
                void error;
            }
            activeStreams.delete(entry);
        }
    }
};

export const startVideoServer = () => {
    return new Promise<void>((resolve) => {
        const videoHeaders = (req: http.IncomingMessage, extra: Record<string, string | number> = {}) => {
            const origin = req.headers.origin;
            const headers: Record<string, string | number> = {
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
                const requestedPath = parsedUrl.query.path as string;

                if (!requestedPath) {
                    res.writeHead(400);
                    res.end("Missing path parameter");
                    return;
                }

                let filePath: string;
                try {
                    filePath = assertVideoFile(requestedPath);
                } catch (error) {
                    if (error instanceof PathSecurityError) {
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
                    const stat = fs.statSync(filePath);
                    const fileSize = stat.size;
                    const rangeHeader = req.headers.range;

                    let readStream: fs.ReadStream;

                    if (rangeHeader) {
                        const parts = rangeHeader
                            .replace(/bytes=/, "")
                            .split("-");
                        const start = parseInt(parts[0], 10);
                        const end =
                            parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                        if (
                            start >= fileSize ||
                            end >= fileSize ||
                            start > end
                        ) {
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

                        readStream = fs.createReadStream(filePath, { start, end });
                    } else {
                        res.writeHead(200, videoHeaders(req, {
                            "Content-Length": fileSize,
                        }));
                        readStream = fs.createReadStream(filePath);
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
                } catch (err) {
                    console.error("Error streaming video:", err);
                    res.writeHead(500);
                    res.end("Server error");
                }
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        server.on("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
                console.warn("[VideoServerService] Port 9999 is already in use. Server may already be running.");
                resolve(); // Resolve anyway, as the server is presumably up
            } else {
                console.error("[VideoServerService] Server error:", err);
            }
        });

        server.listen(9999, "127.0.0.1", () => {
            console.log("Video server started on http://127.0.0.1:9999");
            resolve();
        });
    });
};
