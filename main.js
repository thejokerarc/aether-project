const electron = require('electron');
const { app, BrowserWindow, session } = electron;
const path = require('path');

// Ensure only one instance is running
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

let mainWindow;

// Fix: Auto-grant permissions for Camera/Mic
function setupPermissions() {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'geolocation', 'notifications'];
        if (allowedPermissions.includes(permission)) {
            callback(true); // Approve
        } else {
            callback(false); // Deny others
        }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission, origin) => {
        if (permission === 'media') return true;
        return false;
    });
}

function startServer() {
    console.log("Starting Internal Server Layer...");
    try {
        // Use require to boot the logic directly
        // We handle port conflicts inside simple_server.cjs
        require('./simple_server.cjs');
    } catch (e) {
        console.error("Server Boot Failed:", e);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: "Zeno OS Agent",
        backgroundColor: "#000000",
        frame: true,
        autoHideMenuBar: true, // Keep it clean
        show: false
    });

    // Remove menu completely
    mainWindow.setMenu(null);

    const tryLoad = () => {
        mainWindow.loadURL('http://localhost:3000').catch(() => {
            console.log("Waiting for Core...");
            setTimeout(tryLoad, 1000);
        });
    };

    tryLoad();

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    setupPermissions();
    startServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
