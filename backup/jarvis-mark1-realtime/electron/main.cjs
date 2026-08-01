const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const VITE_URL = 'http://localhost:5173';

let companionWindow;
let artifactWindow;

// Focus existing instance if user opens Jarvis again from desktop
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (companionWindow) {
      companionWindow.show();
      companionWindow.focus();
    }
    if (artifactWindow) artifactWindow.show();
  });
}

function getWindow(target) {
  if (target === 'companion') return companionWindow;
  if (target === 'artifact') return artifactWindow;
  return null;
}

function createWindows() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  companionWindow = new BrowserWindow({
    width: 320,
    height: 420,
    x: width - 340,
    y: height - 440,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  artifactWindow = new BrowserWindow({
    width: 520,
    height: 640,
    x: width - 880,
    y: height - 660,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    companionWindow.loadURL(`${VITE_URL}?window=companion&autovoice=1`);
    artifactWindow.loadURL(`${VITE_URL}?window=artifact`);
  } else {
    companionWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?window=companion&autovoice=1' });
    artifactWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?window=artifact' });
  }
}

ipcMain.handle('toggle-artifact-fullscreen', () => {
  if (artifactWindow.isFullScreen()) {
    artifactWindow.setFullScreen(false);
  } else {
    artifactWindow.setFullScreen(true);
  }
  return artifactWindow.isFullScreen();
});

ipcMain.handle('get-window-type', (event) => {
  if (event.sender === companionWindow?.webContents) return 'companion';
  if (event.sender === artifactWindow?.webContents) return 'artifact';
  return 'unknown';
});

ipcMain.handle('set-title', (_event, title) => {
  if (companionWindow) companionWindow.setTitle(title);
  return true;
});

ipcMain.handle('window-control', (_event, cmd) => {
  const targets = cmd.target === 'both'
    ? [companionWindow, artifactWindow]
    : [getWindow(cmd.target)].filter(Boolean);

  for (const win of targets) {
    if (!win) continue;
    switch (cmd.action) {
      case 'move':
        if (cmd.x != null && cmd.y != null) win.setPosition(Math.round(cmd.x), Math.round(cmd.y));
        break;
      case 'resize':
        if (cmd.width != null && cmd.height != null) win.setSize(Math.round(cmd.width), Math.round(cmd.height));
        break;
      case 'always_on_top':
        win.setAlwaysOnTop(cmd.alwaysOnTop !== false);
        break;
      case 'focus':
        win.show();
        win.focus();
        break;
      case 'show':
        win.show();
        break;
      case 'hide':
        win.hide();
        break;
      default:
        break;
    }
  }
  return { ok: true, cmd };
});

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});
