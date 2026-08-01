const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const VITE_URL = 'http://localhost:5173';

let companionWindow;
let artifactWindow;

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
    companionWindow.loadURL(`${VITE_URL}?window=companion`);
    artifactWindow.loadURL(`${VITE_URL}?window=artifact`);
    companionWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    companionWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?window=companion' });
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

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});
