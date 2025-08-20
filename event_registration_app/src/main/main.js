// main.js
require('dotenv').config();
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const os = require('os');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // fixed: removed duplicate express import
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// DB modules
const localDb = require('./local-db');
const serverDb = require('./server-db');
const qrService = require('./qrService'); 
const scannerService = require('./scannerService'); 

// --- Constants & Global State ---
const JWT_SECRET = process.env.JWT_SECRET || 'default-fallback-secret-key';
const store = new (Store.default || Store)();
let mainWindow;

// Local API ports (if you expose an API from Electron)
const LOCAL_API_PORT = 4000;
const KIOSK_LISTENER_PORT = 4001;

// Default DB config from .env (used when no config is stored yet)
const defaultDbConfig = {
  mode: 'server', // default to server if using Postgres
  dbType: process.env.DB_TYPE || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : '',
  database: process.env.DB_NAME || 'eventdb',
};

// =================================================================
// MAIN LIFECYCLE
// =================================================================

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl =
    process.env.ELECTRON_START_URL ||
    `file://${path.join(__dirname, '../../renderer/index.html')}`;
  mainWindow.loadURL(startUrl);
}

// =================================================================
// IPC HANDLERS
// =================================================================

// --- App Configuration & Setup ---
ipcMain.handle('get-config', () => store.get('dbConfig') || defaultDbConfig);
ipcMain.handle('save-config', (_, configData) => {
  store.set('dbConfig', configData);
  return { success: true };
});

ipcMain.handle('get-active-event-id', () => store.get('activeEventId', null));

ipcMain.handle('select-local-db-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths || filePaths.length === 0)
    return { success: false };
  return { success: true, path: filePaths[0] };
});

ipcMain.handle('create-local-db', async (_, settings) => {
  try {
    return await localDb.createLocalDatabase(settings);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('create-server-db', async (_, dbConfig) => {
  try {
    const result = await serverDb.createServerDatabase(dbConfig);
    if (result.success) {
      store.set('dbConfig', { ...dbConfig, mode: 'server' });
    }
    return result;
  } catch (err) {
    return {
      success: false,
      error: err.message,
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
});

// --- Startup & Authentication ---

ipcMain.handle('is-database-seeded', async () => {
  try {
    const config = store.get('dbConfig') || defaultDbConfig;
    if (!config || !config.mode) return false;
    return config.mode === 'server'
      ? await serverDb.isServerDatabaseSeeded(config)
      : await localDb.isDatabaseSeeded();
  } catch (err) {
    return false;
  }
});

ipcMain.handle('login-user', async (event, { username, password }) => {
  try {
    const config = store.get('dbConfig') || defaultDbConfig;
    if (!config) return { success: false, message: 'Database not configured.' };

    const authResult = config.mode === 'server'
        ? await serverDb.authenticateServerUser(config, username, password)
        : { success: !!(user = await localDb.authenticateLocalUser(username, password)), user };

    if (!authResult.success) {
      return { success: false, message: authResult.message || 'Invalid credentials' };
    }

    const user = authResult.user;
    const hostname = os.hostname();

    if (config.mode === 'server') {
      await serverDb.recordUserLogin(config, user.id, hostname);
    } else {
      await localDb.recordUserLogin(user.id, hostname);
    }

    let activeEventId = store.get('activeEventId', null);
    if (!activeEventId) {
      activeEventId = config.mode === 'server'
        ? await serverDb.getLatestEventId(config)
        : await localDb.getLatestEventId();
      if (activeEventId) store.set('activeEventId', activeEventId);
    }

    if (activeEventId) {
      if (config.mode === 'server') {
        await serverDb.updateUserEventId(config, user.id, activeEventId);
      } else {
        await localDb.updateUserEventId(user.id, activeEventId);
      }
      user.assignedEventId = activeEventId;
    }

    const userPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      assignedEventId: user.assigned_event_id || user.assignedEventId || activeEventId,
    };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '8h' });

    return { success: true, token };
  } catch (err) {
    return { success: false, message: `Login failed: ${err.message}` };
  }
});
// --- Central Server Communication ---
ipcMain.handle('test-central-server', async (_, centralUrl) => {
    try {
        // This will try to connect to the /api/status endpoint of your server
        const response = await fetch(`${centralUrl}/api/status`);
        return { 
            success: response.ok, 
            status: response.status, 
            message: response.ok ? 'Connection successful' : `Server returned ${response.status}` 
        };
    } catch (error) {
        return { success: false, message: `Connection failed: ${error.message}` };
    }
});

ipcMain.handle('authenticate-central-server', async (_, { centralUrl, username, password }) => {
    try {
        const response = await fetch(`${centralUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || `Authentication failed with status ${response.status}`);
        }
        store.set('centralServerUrl', centralUrl);
        return { success: true, token: result.token, user: result.user };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('fetch-central-events', async (_, { centralUrl, authToken }) => {
    try {
        const response = await fetch(`${centralUrl}/api/events`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || `Server responded with ${response.status}`);
        }
        return { success: true, events: result.events || [] };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// --- User Management (Mode-Aware) ---
ipcMain.handle('get-users', async () => {
  try {
    const config = store.get('dbConfig') || defaultDbConfig;
    if (!config) return { success: false, users: [], message: 'Database not configured' };

    const users =
      config.mode === 'server'
        ? await serverDb.getUsers(config)
        : await localDb.getLocalUsers();

    return { success: true, users };
  } catch (error) {
    return {
      success: false,
      users: [],
      message: `Failed to fetch users: ${error.message}`,
    };
  }
});

ipcMain.handle('add-user', async (_, userData) => {
  const config = store.get('dbConfig') || defaultDbConfig;
  if (!config) return { success: false, message: 'DB not configured' };
  return config.mode === 'server'
    ? await serverDb.addUser(config, userData)
    : await localDb.addLocalUser(userData);
});

ipcMain.handle('update-user', async (_, { id, fields }) => {
    const config = store.get('dbConfig') || defaultDbConfig;
    return config.mode === 'server'
        ? await serverDb.updateUser(config, id, fields)
        : await localDb.updateLocalUser(id, fields);
});

ipcMain.handle('delete-user', async (_, id) => {
    const config = store.get('dbConfig') || defaultDbConfig;
    return config.mode === 'server'
        ? await serverDb.deleteUser(config, id)
        : await localDb.deleteLocalUser(id);
});
// --- Data Synchronization ---
ipcMain.handle('seed-database-from-cloud', async (_, { authToken, eventId }) => {
  try {
    const config = store.get('dbConfig') || defaultDbConfig;
    if (!config) throw new Error('Database not configured.');

    const centralUrl = store.get('centralServerUrl');
    if (!centralUrl) {
        throw new Error('Central server URL is not configured. Please log in again on the Settings page.');
    }

    // FIX: Changed the endpoint from '/full' to '/seed' to match your server.js
    const response = await fetch(`${centralUrl}/api/events/${eventId}/seed`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) {
      throw new Error(`Central server returned ${response.status}`);
    }

    const result = await response.json();
    // The central server nests the data in a "data" property
    const cloudData = result.data; 

    if (!cloudData || !cloudData.event) {
      throw new Error('Invalid data structure received from central server.');
    }

    const seedResult =
      config.mode === 'server'
        ? await serverDb.clearAndSeedDataFromServer(config, cloudData)
        : await localDb.clearAndSeedDataFromServer(cloudData);

    if (!seedResult.success) {
      throw new Error(seedResult.message || 'Seeding failed.');
    }

    store.set('activeEventId', cloudData.event.id);

    return { success: true, message: 'Database seeded successfully', eventName: cloudData.event.name };
  } catch (err) {
    console.error('Seeding failed:', err);
    return { success: false, message: `Seeding failed: ${err.message}` };
  }
});;

// --- Dashboard & Data ---
ipcMain.handle('get-dashboard-stats', async (_, eventId) => {
    try {
      const config = store.get('dbConfig') || defaultDbConfig;
      if (!config) throw new Error('Database not configured.');
      
      const data = config.mode === 'server'
        ? await serverDb.getDashboardStats(config, eventId) // Correctly passes both config and eventId
        : await localDb.getLocalDashboardStats(eventId);
        
      return { success: true, ...data };
    } catch (err) {
      console.error('Error in get-dashboard-stats:', err);
      return { success: false, message: err.message };
    }
});

ipcMain.handle('get-participants', async (_, { eventId, filters }) => {
    const config = store.get('dbConfig') || defaultDbConfig;
    return config.mode === 'server'
        ? await serverDb.getParticipants(config, eventId, filters)
        : await localDb.getLocalParticipants(eventId, filters);
});

// --- Fixed get-next-regno (works for Postgres & SQLite)
ipcMain.handle('get-next-regno', async (_, { eventId, roleCode }) => {
  const config = store.get('dbConfig') || defaultDbConfig;
  const regno = config.mode === 'server'
      ? await serverDb.getNextRegNo(config, eventId, roleCode)
      : await localDb.getNextRegNo(eventId, roleCode);
  return { success: true, regno };
});


// main.js

// ... (other handlers)

// --- Participant Management (Mode-Aware) ---
ipcMain.handle('add-participant', async (_, participantData) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");

        const result = config.mode === 'server'
            ? await serverDb.addParticipant(config, participantData)
            : await localDb.addLocalParticipant(participantData);
        
        return { success: true, participant: result };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('update-participant', async (_, { id, fields }) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");

        const result = config.mode === 'server'
            ? await serverDb.updateParticipant(config, id, fields)
            : await localDb.updateLocalParticipant(id, fields);
        
        return { success: true, participant: result };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('delete-participant', async (_, id) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");

        const result = config.mode === 'server'
            ? await serverDb.deleteParticipant(config, id)
            : await localDb.deleteLocalParticipant(id);
        
        return { success: true, result };
    } catch (err) {
        return { success: false, message: err.message };
    }
});


ipcMain.handle('add-bulk-participants', async (_, eventId, participants) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");

        const result = config.mode === 'server'
            ? await serverDb.addBulkParticipants(config, eventId, participants)
            : await localDb.addBulkParticipants(eventId, participants);
        
        return { success: true, result };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('get-event-roles', async (_, eventId) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");

        const roles = config.mode === 'server'
            ? await serverDb.getEventRoles(config, eventId)
            : await localDb.getEventRoles(eventId);
        
        return { success: true, roles };
    } catch (err) {
        return { success: false, message: err.message, roles: [] };
    }
});