const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const url = require('url');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('chronos', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('chronos');
}

// Handle the deep link on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  // Extract the auth token from URL
  const mainWindow = BrowserWindow.getAllWindows()[0];
  mainWindow.webContents.send('auth-callback', url);
});

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    titleBarStyle: 'hiddenInset', // Changed to hiddenInset for better dragging on macOS
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow loading local resources
    },
    show: false // Don't show until content is loaded
  });

  // Clear any session cache to avoid stale content
  session.defaultSession.clearCache();

  const startUrl = 'http://localhost:5174';
  console.log('Loading URL:', startUrl);
  
  // Load the Vite dev server
  mainWindow.loadURL(startUrl)
    .catch(error => {
      console.error('Failed to load URL:', error);
      // Try fallback URL if main one fails
      mainWindow.loadURL('http://127.0.0.1:5174')
        .catch(err => console.error('Failed to load fallback URL:', err));
    });
  
  // Show window when ready to show
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools
  mainWindow.webContents.openDevTools();
  
  // Log when page is finished loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });
  
  // Log any errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    // Retry loading after a short delay
    setTimeout(() => {
      console.log('Retrying to load URL...');
      mainWindow.loadURL(startUrl);
    }, 1000);
  });
  
  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });

  // Handle opening OAuth links in external browser instead of in the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // If the URL includes the OAuth provider domain or auth-related paths
    if (url.includes('accounts.google.com') || url.includes('oauth') || url.includes('login')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Also handle window.open from the renderer which is used by some auth libraries
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If the URL includes the OAuth provider domain or auth-related paths 
    if (url.includes('accounts.google.com') || url.includes('oauth') || url.includes('login')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // We'll use CSS for window dragging instead of IPC
}

app.whenReady().then(() => {
  createWindow();
  
  // Handle IPC message to open URLs in external browser
  ipcMain.on('open-external-url', (_, url) => {
    console.log('Opening external URL:', url);
    shell.openExternal(url);
  });
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
