const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (configData) => ipcRenderer.invoke('save-config', configData),
  testDbConnection: () => ipcRenderer.invoke('test-db-connection'),

  // Local Participant Management
  getLocalParticipants: (eventId, filters) => ipcRenderer.invoke('get-local-participants', eventId, filters),
  addLocalParticipant: (data) => ipcRenderer.invoke('add-local-participant', data),
  
  // Local Check-in & Session Management
  getLocalSessions: (eventId) => ipcRenderer.invoke('get-local-sessions', eventId),
  addLocalCheckIn: (data) => ipcRenderer.invoke('add-local-checkin', data),
  getLocalCheckins: (eventId, sessionId) => ipcRenderer.invoke('get-local-checkins', eventId, sessionId),

  // Local Print Template Management
  getLocalTemplates: (eventId) => ipcRenderer.invoke('get-local-templates', eventId),
  saveLocalTemplate: (data) => ipcRenderer.invoke('save-local-template', data),

  // Local Dashboard
  getLocalDashboardStats: (eventId) => ipcRenderer.invoke('get-local-dashboard-stats'),

  // Existing QR and Font Services (no change)
  generateQRCode: (participant) => ipcRenderer.invoke('generate-qr-code', participant),
  verifyQRToken: (token) => ipcRenderer.invoke('verify-qr-token', token),
  getFontData: (fontName) => ipcRenderer.invoke('get-font-data', fontName),
  
  // Synchronization Triggers (for later)
  seedDatabaseFromCloud: (eventId) => ipcRenderer.invoke('seed-database-from-cloud', eventId),
  syncChanges: (eventId) => ipcRenderer.invoke('sync-changes', eventId),

  // User Management
  getLocalUsers: () => ipcRenderer.invoke('get-local-users'),
  addLocalUser: (data) => ipcRenderer.invoke('add-local-user', data),
  updateLocalUser: (userId, data) => ipcRenderer.invoke('update-local-user', userId, data),
  deleteLocalUser: (userId) => ipcRenderer.invoke('delete-local-user', userId),
  authenticateLocalUser: (username, password) => ipcRenderer.invoke('authenticate-local-user', username, password),


});