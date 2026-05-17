import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export const APP_USER_DATA_NAME = 'mc';

export const getAppUserDataPath = (): string => {
    const userDataPath = path.join(app.getPath('appData'), APP_USER_DATA_NAME);
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
    return userDataPath;
};

export const configureAppIdentity = (): string => {
    app.setName(APP_USER_DATA_NAME);
    const userDataPath = getAppUserDataPath();
    app.setPath('userData', userDataPath);
    return userDataPath;
};
