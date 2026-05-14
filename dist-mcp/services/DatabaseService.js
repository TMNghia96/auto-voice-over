"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProject = exports.updateProjectPin = exports.addProject = exports.getProjects = exports.connectDB = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let db = null;
const connectDB = () => {
    if (db)
        return db;
    const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'projects.db');
    try {
        db = new better_sqlite3_1.default(dbPath, {
            verbose: console.log
        });
        db.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                pinned INTEGER DEFAULT 0
            )
        `);
        return db;
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
};
exports.connectDB = connectDB;
const getProjects = () => {
    if (!db)
        (0, exports.connectDB)();
    const result = db
        .prepare('SELECT * FROM projects ORDER BY pinned DESC, createdAt DESC')
        .all();
    return result.map((p) => ({ ...p, pinned: !!p.pinned }));
};
exports.getProjects = getProjects;
const addProject = (project) => {
    if (!db)
        (0, exports.connectDB)();
    try {
        const insert = db.prepare('INSERT INTO projects (id, name, path, pinned) VALUES (@id, @name, @path, @pinned)');
        insert.run({ ...project, pinned: project.pinned ? 1 : 0 });
        return db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    }
    catch (error) {
        console.error('Error adding project:', error);
        return null;
    }
};
exports.addProject = addProject;
const updateProjectPin = (id, pinned) => {
    if (!db)
        (0, exports.connectDB)();
    try {
        const stmt = db.prepare('UPDATE projects SET pinned = ? WHERE id = ?');
        const info = stmt.run(pinned ? 1 : 0, id);
        return info.changes > 0;
    }
    catch (error) {
        console.error('Error updating project pin:', error);
        return false;
    }
};
exports.updateProjectPin = updateProjectPin;
const deleteProject = (id) => {
    if (!db)
        (0, exports.connectDB)();
    try {
        const info = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        return info.changes > 0;
    }
    catch (error) {
        console.error('Error deleting project:', error);
        return false;
    }
};
exports.deleteProject = deleteProject;
//# sourceMappingURL=DatabaseService.js.map