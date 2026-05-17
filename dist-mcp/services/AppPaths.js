"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureAppIdentity = exports.getAppUserDataPath = exports.APP_USER_DATA_NAME = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.APP_USER_DATA_NAME = 'mc';
const getAppUserDataPath = () => {
    const userDataPath = path_1.default.join(electron_1.app.getPath('appData'), exports.APP_USER_DATA_NAME);
    if (!fs_1.default.existsSync(userDataPath)) {
        fs_1.default.mkdirSync(userDataPath, { recursive: true });
    }
    return userDataPath;
};
exports.getAppUserDataPath = getAppUserDataPath;
const configureAppIdentity = () => {
    electron_1.app.setName(exports.APP_USER_DATA_NAME);
    const userDataPath = (0, exports.getAppUserDataPath)();
    electron_1.app.setPath('userData', userDataPath);
    return userDataPath;
};
exports.configureAppIdentity = configureAppIdentity;
//# sourceMappingURL=AppPaths.js.map