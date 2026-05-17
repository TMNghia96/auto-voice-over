"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedLocalVideoSource = exports.assertWritablePathInRegisteredProject = exports.assertSrtFileInProject = exports.assertAudioFileInProject = exports.assertSrtFile = exports.assertAudioFile = exports.assertVideoFile = exports.assertProjectMediaFile = exports.assertRegisteredFile = exports.findAllowedProjectRootForPath = exports.assertInsideProject = exports.assertProjectRoot = exports.getRegisteredProjectRoots = exports.isPathInside = exports.sanitizeProjectName = exports.PathSecurityError = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DatabaseService_1 = require("./DatabaseService");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".ogg", ".webm", ".opus"]);
const SRT_EXTENSIONS = new Set([".srt"]);
class PathSecurityError extends Error {
    constructor(message) {
        super(message);
        this.name = "PathSecurityError";
    }
}
exports.PathSecurityError = PathSecurityError;
const realPath = (targetPath) => {
    if (!targetPath || typeof targetPath !== "string") {
        throw new PathSecurityError("Invalid path");
    }
    return fs_1.default.realpathSync(targetPath);
};
const sanitizeProjectName = (projectName) => {
    const sanitized = projectName
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    if (!sanitized || sanitized === "." || sanitized === "..") {
        throw new PathSecurityError("Invalid project name");
    }
    return sanitized;
};
exports.sanitizeProjectName = sanitizeProjectName;
const isPathInside = (childPath, parentPath) => {
    const relative = path_1.default.relative(parentPath, childPath);
    return relative === "" || (!relative.startsWith("..") && !path_1.default.isAbsolute(relative));
};
exports.isPathInside = isPathInside;
const getRegisteredProjectRoots = () => {
    try {
        return (0, DatabaseService_1.getProjects)()
            .map((project) => project.path)
            .filter((projectPath) => typeof projectPath === "string" && projectPath.length > 0)
            .filter((projectPath) => fs_1.default.existsSync(projectPath))
            .map((projectPath) => realPath(projectPath));
    }
    catch (error) {
        console.warn("[PathSecurity] Failed to load registered projects:", error);
        return [];
    }
};
exports.getRegisteredProjectRoots = getRegisteredProjectRoots;
const assertProjectRoot = (projectPath) => {
    const resolvedProjectPath = realPath(projectPath);
    const registeredRoot = (0, exports.getRegisteredProjectRoots)().find((root) => (0, exports.isPathInside)(resolvedProjectPath, root));
    if (registeredRoot)
        return registeredRoot;
    const projectConfig = path_1.default.join(resolvedProjectPath, "project.json");
    if (fs_1.default.existsSync(projectConfig) && fs_1.default.statSync(resolvedProjectPath).isDirectory()) {
        return resolvedProjectPath;
    }
    throw new PathSecurityError("Project path is not registered");
};
exports.assertProjectRoot = assertProjectRoot;
const assertInsideProject = (projectPath, targetPath) => {
    const projectRoot = (0, exports.assertProjectRoot)(projectPath);
    const resolvedTarget = realPath(targetPath);
    if (!(0, exports.isPathInside)(resolvedTarget, projectRoot)) {
        throw new PathSecurityError("Path is outside the project");
    }
    return resolvedTarget;
};
exports.assertInsideProject = assertInsideProject;
const findAllowedProjectRootForPath = (targetPath) => {
    const resolvedTarget = realPath(targetPath);
    return (0, exports.getRegisteredProjectRoots)().find((root) => (0, exports.isPathInside)(resolvedTarget, root)) || null;
};
exports.findAllowedProjectRootForPath = findAllowedProjectRootForPath;
const assertRegisteredFile = (filePath, allowedExtensions) => {
    const resolvedFile = realPath(filePath);
    if (!fs_1.default.statSync(resolvedFile).isFile()) {
        throw new PathSecurityError("Path is not a file");
    }
    if (!allowedExtensions.has(path_1.default.extname(resolvedFile).toLowerCase())) {
        throw new PathSecurityError("File type is not allowed");
    }
    if (!(0, exports.findAllowedProjectRootForPath)(resolvedFile)) {
        throw new PathSecurityError("File is outside registered projects");
    }
    return resolvedFile;
};
exports.assertRegisteredFile = assertRegisteredFile;
const assertProjectMediaFile = (projectPath, filePath, allowedExtensions) => {
    const resolvedFile = (0, exports.assertInsideProject)(projectPath, filePath);
    if (!fs_1.default.statSync(resolvedFile).isFile()) {
        throw new PathSecurityError("Path is not a file");
    }
    if (!allowedExtensions.has(path_1.default.extname(resolvedFile).toLowerCase())) {
        throw new PathSecurityError("File type is not allowed");
    }
    return resolvedFile;
};
exports.assertProjectMediaFile = assertProjectMediaFile;
const assertVideoFile = (filePath) => (0, exports.assertRegisteredFile)(filePath, VIDEO_EXTENSIONS);
exports.assertVideoFile = assertVideoFile;
const assertAudioFile = (filePath) => (0, exports.assertRegisteredFile)(filePath, AUDIO_EXTENSIONS);
exports.assertAudioFile = assertAudioFile;
const assertSrtFile = (filePath) => (0, exports.assertRegisteredFile)(filePath, SRT_EXTENSIONS);
exports.assertSrtFile = assertSrtFile;
const assertAudioFileInProject = (projectPath, filePath) => (0, exports.assertProjectMediaFile)(projectPath, filePath, AUDIO_EXTENSIONS);
exports.assertAudioFileInProject = assertAudioFileInProject;
const assertSrtFileInProject = (projectPath, filePath) => (0, exports.assertProjectMediaFile)(projectPath, filePath, SRT_EXTENSIONS);
exports.assertSrtFileInProject = assertSrtFileInProject;
const assertWritablePathInRegisteredProject = (targetPath) => {
    const parentDir = path_1.default.dirname(targetPath);
    if (!fs_1.default.existsSync(parentDir)) {
        throw new PathSecurityError("Parent directory does not exist");
    }
    const resolvedParent = realPath(parentDir);
    const root = (0, exports.getRegisteredProjectRoots)().find((projectRoot) => (0, exports.isPathInside)(resolvedParent, projectRoot));
    if (!root) {
        throw new PathSecurityError("Output path is outside registered projects");
    }
    return path_1.default.join(resolvedParent, path_1.default.basename(targetPath));
};
exports.assertWritablePathInRegisteredProject = assertWritablePathInRegisteredProject;
const isAllowedLocalVideoSource = (filePath) => {
    try {
        const resolvedFile = realPath(filePath);
        return fs_1.default.statSync(resolvedFile).isFile() && VIDEO_EXTENSIONS.has(path_1.default.extname(resolvedFile).toLowerCase());
    }
    catch {
        return false;
    }
};
exports.isAllowedLocalVideoSource = isAllowedLocalVideoSource;
//# sourceMappingURL=PathSecurity.js.map