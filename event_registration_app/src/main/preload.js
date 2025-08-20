// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- App Configuration & Setup ---
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (settings) => ipcRenderer.invoke('save-config', settings),
  getActiveEventId: () => ipcRenderer.invoke('get-active-event-id'),
  selectLocalDbFolder: () => ipcRenderer.invoke('select-local-db-folder'),
  createLocalDb: (settings) => ipcRenderer.invoke('create-local-db', settings),
  createServerDb: (dbConfig) => ipcRenderer.invoke('create-server-db', dbConfig),

  // --- Startup & Authentication ---
  isDatabaseSeeded: () => ipcRenderer.invoke('is-database-seeded'),
  loginUser: (username, password) => ipcRenderer.invoke('login-user', { username, password }),

  // --- User Management (Mode-Aware) ---
  getUsers: () => ipcRenderer.invoke('get-users'),
  addUser: (user) => ipcRenderer.invoke('add-user', user),
  updateUser: (id, fields) => ipcRenderer.invoke('update-user', { id, fields }),
  deleteUser: (id) => ipcRenderer.invoke('delete-user', id),

  // --- Data Synchronization ---
  seedDatabaseFromCloud: (args) => ipcRenderer.invoke('seed-database-from-cloud', args),
  
  // --- Central Server Communication ---
  testCentralServer: (centralUrl) => ipcRenderer.invoke('test-central-server', centralUrl),
  fetchCentralEvents: (args) => ipcRenderer.invoke('fetch-central-events', args),
  authenticateCentralServer: (args) => ipcRenderer.invoke('authenticate-central-server', args),

  // --- Generic Data Access (Mode-Aware) ---
  getDashboardStats: (eventId) => ipcRenderer.invoke('get-dashboard-stats', eventId),
  getSessions: (eventId) => ipcRenderer.invoke('get-sessions', eventId),
  getParticipants: (eventId, filters) => ipcRenderer.invoke('get-participants', { eventId, filters }),
  getNextRegNo: (eventId, roleCode) => ipcRenderer.invoke('get-next-regno', { eventId, roleCode }),

  addParticipant: (data) => ipcRenderer.invoke('add-participant', data),
  updateParticipant: (id, fields) => ipcRenderer.invoke('update-participant', { id, fields }),
  deleteParticipant: (id) => ipcRenderer.invoke('delete-participant', id),
  addBulkParticipants: (eventId, participants) => ipcRenderer.invoke('add-bulk-participants', eventId, participants),
  getEventRoles: (eventId) => ipcRenderer.invoke('get-event-roles', eventId),

  // --- QR Services ---
  generateQRToken: (participant) => ipcRenderer.invoke('generate-qr-token', participant),
  verifyQRToken: (token) => ipcRenderer.invoke('verify-qr-token', token),
});
