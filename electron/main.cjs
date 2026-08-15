const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const path = require('path');
const { placeJarvisWindows } = require('./windowBounds.cjs');

app.setName('Jarvis');
app.setAppUserModelId('com.jarvis.mark1');
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

const isDev = !app.isPackaged;
const VITE_URL = 'http://127.0.0.1:5173';

let companionWindow;
let artifactWindow;

function isGone(win) {
  return !win || win.isDestroyed();
}

let quitting = false;
function quitJarvis() {
  if (quitting) return;
  quitting = true;
  if (!isGone(artifactWindow)) artifactWindow.close();
  if (!isGone(companionWindow)) companionWindow.close();
  app.quit();
}

function loadWithRetry(win, url) {
  let loaded = false;
  const tryLoad = () => {
    if (loaded || isGone(win)) return;
    win.loadURL(url).then(() => {
      loaded = true;
      if (!isGone(win)) win.show();
    }).catch(() => {
      setTimeout(tryLoad, 400);
    });
  };
  win.webContents.on('did-finish-load', () => {
    loaded = true;
    if (!isGone(win)) win.show();
  });
  win.webContents.on('did-fail-load', () => {
    if (!loaded) setTimeout(tryLoad, 400);
  });
  tryLoad();
}

function showExistingOrCreate() {
  if (isGone(companionWindow) || isGone(artifactWindow)) {
    createWindows();
    return;
  }
  applyBottomRightLayout();
  companionWindow.focus();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showExistingOrCreate();
  });
}

function getWindow(target) {
  if (target === 'companion') return companionWindow;
  if (target === 'artifact') return artifactWindow;
  return null;
}

function currentWorkArea() {
  const point = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(point).workArea;
}

function applyBottomRightLayout() {
  const { companion, artifact } = placeJarvisWindows(currentWorkArea());
  if (!isGone(companionWindow)) {
    companionWindow.setBounds(companion);
    companionWindow.setAlwaysOnTop(true, 'pop-up-menu');
    companionWindow.show();
    companionWindow.moveTop();
  }
  if (!isGone(artifactWindow)) {
    artifactWindow.setBounds(artifact);
    artifactWindow.show();
  }
}

function createWindows() {
  if (!isGone(companionWindow) && !isGone(artifactWindow)) {
    applyBottomRightLayout();
    companionWindow.focus();
    return;
  }

  const { companion, artifact } = placeJarvisWindows(currentWorkArea());

  companionWindow = new BrowserWindow({
    ...companion,
    title: 'Jarvis',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  artifactWindow = new BrowserWindow({
    ...artifact,
    title: 'Jarvis Artifacts',
    show: true,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  companionWindow.on('closed', () => {
    companionWindow = null;
    if (!quitting) quitJarvis();
  });
  artifactWindow.on('closed', () => { artifactWindow = null; });
  companionWindow.setTitle('Jarvis');
  artifactWindow.setTitle('Jarvis Artifacts');

  companionWindow.once('ready-to-show', () => {
    applyBottomRightLayout();
    companionWindow.focus();
  });

  if (isDev) {
    loadWithRetry(companionWindow, `${VITE_URL}?window=companion&autovoice=1`);
    loadWithRetry(artifactWindow, `${VITE_URL}?window=artifact`);
  } else {
    companionWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?window=companion&autovoice=1' });
    artifactWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?window=artifact' });
  }

  applyBottomRightLayout();
}

ipcMain.handle('toggle-artifact-fullscreen', () => {
  if (isGone(artifactWindow)) return false;
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
  if (!isGone(companionWindow)) companionWindow.setTitle(title);
  return true;
});

ipcMain.handle('window-control', (_event, cmd) => {
  const targets = cmd.target === 'both'
    ? [companionWindow, artifactWindow]
    : [getWindow(cmd.target)].filter(Boolean);

  for (const win of targets) {
    if (isGone(win)) continue;
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

ipcMain.handle('quit-app', () => {
  quitJarvis();
  return true;
});

if (gotLock) {
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media' || permission === 'microphone');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'media' || permission === 'microphone';
    });
    createWindows();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
}
