import fs from "fs";
import path from "path";
import { getProjects } from "./DatabaseService";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".ogg", ".webm", ".opus"]);
const SRT_EXTENSIONS = new Set([".srt"]);

export class PathSecurityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PathSecurityError";
    }
}

const realPath = (targetPath: string): string => {
    if (!targetPath || typeof targetPath !== "string") {
        throw new PathSecurityError("Invalid path");
    }
    return fs.realpathSync(targetPath);
};

export const sanitizeProjectName = (projectName: string): string => {
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

export const isPathInside = (childPath: string, parentPath: string): boolean => {
    const relative = path.relative(parentPath, childPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export const getRegisteredProjectRoots = (): string[] => {
    try {
        return getProjects()
            .map((project) => project.path)
            .filter((projectPath) => typeof projectPath === "string" && projectPath.length > 0)
            .filter((projectPath) => fs.existsSync(projectPath))
            .map((projectPath) => realPath(projectPath));
    } catch (error) {
        console.warn("[PathSecurity] Failed to load registered projects:", error);
        return [];
    }
};

export const assertProjectRoot = (projectPath: string): string => {
    const resolvedProjectPath = realPath(projectPath);
    const registeredRoot = getRegisteredProjectRoots().find((root) => isPathInside(resolvedProjectPath, root));
    if (registeredRoot) return registeredRoot;

    const projectConfig = path.join(resolvedProjectPath, "project.json");
    if (fs.existsSync(projectConfig) && fs.statSync(resolvedProjectPath).isDirectory()) {
        return resolvedProjectPath;
    }

    throw new PathSecurityError("Project path is not registered");
};

export const assertInsideProject = (projectPath: string, targetPath: string): string => {
    const projectRoot = assertProjectRoot(projectPath);
    const resolvedTarget = realPath(targetPath);
    if (!isPathInside(resolvedTarget, projectRoot)) {
        throw new PathSecurityError("Path is outside the project");
    }
    return resolvedTarget;
};

export const findAllowedProjectRootForPath = (targetPath: string): string | null => {
    const resolvedTarget = realPath(targetPath);
    return getRegisteredProjectRoots().find((root) => isPathInside(resolvedTarget, root)) || null;
};

export const assertRegisteredFile = (filePath: string, allowedExtensions: Set<string>): string => {
    const resolvedFile = realPath(filePath);
    if (!fs.statSync(resolvedFile).isFile()) {
        throw new PathSecurityError("Path is not a file");
    }
    if (!allowedExtensions.has(path.extname(resolvedFile).toLowerCase())) {
        throw new PathSecurityError("File type is not allowed");
    }
    if (!findAllowedProjectRootForPath(resolvedFile)) {
        throw new PathSecurityError("File is outside registered projects");
    }
    return resolvedFile;
};

export const assertProjectMediaFile = (projectPath: string, filePath: string, allowedExtensions: Set<string>): string => {
    const resolvedFile = assertInsideProject(projectPath, filePath);
    if (!fs.statSync(resolvedFile).isFile()) {
        throw new PathSecurityError("Path is not a file");
    }
    if (!allowedExtensions.has(path.extname(resolvedFile).toLowerCase())) {
        throw new PathSecurityError("File type is not allowed");
    }
    return resolvedFile;
};

export const assertVideoFile = (filePath: string): string => assertRegisteredFile(filePath, VIDEO_EXTENSIONS);

export const assertAudioFile = (filePath: string): string => assertRegisteredFile(filePath, AUDIO_EXTENSIONS);

export const assertSrtFile = (filePath: string): string => assertRegisteredFile(filePath, SRT_EXTENSIONS);

export const assertAudioFileInProject = (projectPath: string, filePath: string): string =>
    assertProjectMediaFile(projectPath, filePath, AUDIO_EXTENSIONS);

export const assertSrtFileInProject = (projectPath: string, filePath: string): string =>
    assertProjectMediaFile(projectPath, filePath, SRT_EXTENSIONS);

export const assertWritablePathInRegisteredProject = (targetPath: string): string => {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
        throw new PathSecurityError("Parent directory does not exist");
    }

    const resolvedParent = realPath(parentDir);
    const root = getRegisteredProjectRoots().find((projectRoot) => isPathInside(resolvedParent, projectRoot));
    if (!root) {
        throw new PathSecurityError("Output path is outside registered projects");
    }

    return path.join(resolvedParent, path.basename(targetPath));
};

export const isAllowedLocalVideoSource = (filePath: string): boolean => {
    try {
        const resolvedFile = realPath(filePath);
        return fs.statSync(resolvedFile).isFile() && VIDEO_EXTENSIONS.has(path.extname(resolvedFile).toLowerCase());
    } catch {
        return false;
    }
};
