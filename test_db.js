const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'auto-voice-over-tool', 'projects.db');

try {
    const db = new Database(dbPath);
    const projects = db.prepare('SELECT * FROM projects ORDER BY createdAt DESC LIMIT 1').all();
    console.log(JSON.stringify(projects, null, 2));
} catch (err) {
    console.error('Failed', err);
}
