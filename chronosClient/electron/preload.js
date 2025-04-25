// Preload script runs in Electron's renderer process but has access to Node.js APIs

// Use contextBridge to expose specific APIs to the renderer process
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // We don't need the startDrag function anymore as we'll use CSS for dragging
  // Example: expose a method to send messages to main process
  send: (channel, data) => {
    // whitelist channels
    let validChannels = ['toMain', 'start-drag'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // Example: expose a method to receive messages from main process
  receive: (channel, func) => {
    let validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender` 
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});
