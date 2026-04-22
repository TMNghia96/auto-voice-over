// Mock Electron app để test standalone
import path from 'path';

const mockApp = {
    isPackaged: false,
    getPath: (name: string) => {
        if (name === 'userData') {
            return path.join(process.cwd(), 'test-userdata');
        }
        return process.cwd();
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
    if (id === 'electron') {
        return { app: mockApp };
    }
    return originalRequire.apply(this, arguments);
};

console.log('✓ Electron mock initialized');