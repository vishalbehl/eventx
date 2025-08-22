// src/main/main.js
require('dotenv').config();
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
// CORRECTED IMPORT SYNTAX FOR ELECTRON-STORE
const Store = require('electron-store').default;
const os = require('os');
const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const scannerService = require('./scannerService');

// DB modules
const localDb = require('./local-db');
const serverDb = require('./server-db');

// --- Constants & Global State ---
const JWT_SECRET = process.env.JWT_SECRET || 'default-fallback-secret-key';
// CORRECTED INSTANTIATION
const store = new Store();
let mainWindow;

// =================================================================
// MAIN LIFECYCLE
// =================================================================

async function initializeDatabaseConnection() {
  const config = store.get('dbConfig');
  if (!config || !config.mode) {
    console.log('No database configured yet. Skipping auto-connect.');
    return;
  }

  console.log(`Found saved config for mode: '${config.mode}'. Attempting to connect and validate...`);
  try {
    if (config.mode === 'local') {
      if (!config.folderPath || !config.dbName) {
        throw new Error("Local DB config is incomplete. Missing folderPath or dbName.");
      }
      // Step 1: Connect (or create an empty DB if missing)
      await localDb.createLocalDatabase({
        folderPath: config.folderPath,
        dbName: config.dbName,
      });

      // Step 2: Validate that the database has been seeded with data
      const isSeeded = await localDb.isDatabaseSeeded();
      if (!isSeeded) {
        // This is our trigger. The DB file exists but is empty.
        throw new Error("Local database file is present but unseeded. Resetting configuration.");
      }
    } else {
      console.log('Server mode configured. Connections will be established on demand.');
      // You could add a similar check here for server DBs if needed
    }
    console.log('✅ Database connection re-established and validated successfully on startup.');
  } catch (error) {
    console.error('🔴 FAILED to connect or validate the database on startup:', error.message);
    // Step 3: Self-heal by clearing the invalid configuration
    store.delete('dbConfig');
    store.delete('activeEventId'); // Also clear any related stale data
    console.log('Cleared invalid database configuration. App will now start at setup screen.');
  }
}

function startHeartbeat() {
    setInterval(async () => {
        try {
            const config = store.get('dbConfig');
            // Only run heartbeats in server mode
            if (config && config.mode === 'server') {
                const hostname = os.hostname();
                // A new function in server-db.js to update the heartbeat
                await serverDb.updateKioskHeartbeat(config, hostname);
            }
        } catch (err) {
            console.error('Heartbeat failed:', err.message);
        }
    }, 60000); // Run every 60 seconds
}
// This handler gets network interface details from the operating system.
ipcMain.handle('get-network-info', () => {
    const interfaces = os.networkInterfaces();
    const results = [];

    for (const name in interfaces) {
        // Find the first valid, non-internal IPv4 address for each interface
        const iface = interfaces[name].find(details => details.family === 'IPv4' && !details.internal);
        if (iface) {
            results.push({
                name: name,
                ip: iface.address,
                mac: iface.mac.toUpperCase()
            });
        }
    }
    return results;
});

app.whenReady().then(() => {
  // Run the database connection logic BEFORE creating the window
  initializeDatabaseConnection().then(() => {
    createWindow();
    startHeartbeat();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
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
// IPC HANDLERS - (The rest of the file remains the same)
// =================================================================

// --- App Configuration & Setup ---
ipcMain.handle('get-config', () => store.get('dbConfig'));
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

// ******** THIS IS THE CORRECTED FUNCTION ********
ipcMain.handle('create-local-db', async (_, settings) => {
  try {
    const result = await localDb.createLocalDatabase(settings);
    if (result.success) {
        // The bug was here. We must now save the complete configuration.
        store.set('dbConfig', {
            mode: 'local',
            folderPath: settings.folderPath,
            dbName: settings.dbName,
        });
    }
    return result;
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
    const config = store.get('dbConfig');
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
    const config = store.get('dbConfig');
    if (!config) {
      return { success: false, message: 'Database not configured.' };
    }

    let authResult;

    if (config.mode === 'server') {
      // ***** FIX: Find ALL valid MAC addresses, not just the first one *****
      const interfaces = os.networkInterfaces();
      const clientMacAddresses = []; // Changed to an array
      for (const key in interfaces) {
          const iface = interfaces[key].find(details => !details.internal && details.mac && details.mac !== '00:00:00:00:00:00');
          if (iface) {
              clientMacAddresses.push(iface.mac.toUpperCase()); // Add each valid MAC to the array
          }
      }
      
      // Pass the entire array of MAC addresses to the authentication function
      authResult = await serverDb.authenticateServerUser(config, username, password, clientMacAddresses);

    // --- LOCAL MODE LOGIC ---
    } else {
      const user = await localDb.authenticateLocalUser(username, password);
      authResult = { success: !!user, user };
    }

    // --- COMMON LOGIC (POST-AUTHENTICATION) ---

    if (!authResult.success) {
      return { success: false, message: authResult.message || 'Invalid credentials' };
    }

    const authenticatedUser = authResult.user;
    const hostname = os.hostname();

    // Record the login for auditing purposes
    if (config.mode === 'server') {
      await serverDb.recordUserLogin(config, authenticatedUser.id, hostname);
    } else {
      await localDb.recordUserLogin(authenticatedUser.id, hostname);
    }

    // Get the currently active event for this kiosk from storage
    const activeEventId = store.get('activeEventId', null);

    if (activeEventId) {
      // Update the user's record in the database for reference
      if (config.mode === 'server') {
        await serverDb.updateUserEventId(config, authenticatedUser.id, activeEventId);
      } else {
        await localDb.updateUserEventId(authenticatedUser.id, activeEventId);
      }
    }

    // Create the JWT token payload
    const userPayload = {
      id: authenticatedUser.id,
      username: authenticatedUser.username,
      role: authenticatedUser.role,
      assignedEventId: activeEventId, // Use the reliable active event ID from the store
    };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '8h' });

    return { success: true, token };

  } catch (err) {
    console.error("Login Error in main.js:", err);
    return { success: false, message: `Login failed: ${err.message}` };
  }
});

// --- Central Server Communication ---
ipcMain.handle('test-central-server', async (_, centralUrl) => {
    try {
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
    const config = store.get('dbConfig');
    if (!config) return { success: false, users: [], message: 'Database not configured' };

    const users =
      config.mode === 'server'
        ? await serverDb.getUsers(config)
        : await localDb.getLocalUsers();

    return { success: true, users };
  } catch (error) {
    return { success: false, users: [], message: `Failed to fetch users: ${error.message}` };
  }
});

ipcMain.handle('add-user', async (_, userData) => {
  try {
    const config = store.get('dbConfig');
    if (!config) throw new Error('Database not configured.');

    const newUser = config.mode === 'server'
      ? await serverDb.addUser(config, userData)
      : await localDb.addLocalUser(userData);
    
    return { success: true, user: newUser };

  } catch (error) {
    console.error('Failed to add user:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('update-user', async (_, { id, fields }) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error('Database not configured.');

        const result = config.mode === 'server'
            ? await serverDb.updateUser(config, id, fields)
            : await localDb.updateLocalUser(id, fields);

        // Ensure a standard success object is returned
        return { success: true, changes: result };

    } catch (error) {
        console.error('Failed to update user:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-user', async (_, id) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error('Database not configured.');
        
        const result = config.mode === 'server'
            ? await serverDb.deleteUser(config, id)
            : await localDb.deleteLocalUser(id);

        // Ensure a standard success object is returned
        return { success: true, changes: result.changes || result };

    } catch (error) {
        console.error('Failed to delete user:', error);
        return { success: false, message: error.message };
    }
});

// --- Data Synchronization ---
ipcMain.handle('seed-database-from-cloud', async (_, { authToken, eventId }) => {
  try {
    const config = store.get('dbConfig');
    if (!config) throw new Error('Database not configured.');
    const centralUrl = store.get('centralServerUrl');
    if (!centralUrl) throw new Error('Central server URL is not configured.');

    const response = await fetch(`${centralUrl}/api/events/${eventId}/seed`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) throw new Error(`Central server returned ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Failed to fetch seed data.');

    const cloudData = result.data;
    if (!cloudData || !cloudData.event) throw new Error('Invalid data structure from server.');

    const seedResult = config.mode === 'server'
        ? await serverDb.clearAndSeedDataFromServer(config, cloudData)
        : await localDb.clearAndSeedDataFromServer(cloudData);

    if (!seedResult.success) throw new Error(seedResult.message || 'Seeding failed.');

    store.set('activeEventId', cloudData.event.id);
    return { success: true, message: 'Database seeded successfully', eventName: cloudData.event.name };
  } catch (err) {
    console.error('Seeding failed:', err);
    return { success: false, message: `Seeding failed: ${err.message}` };
  }
});

// --- Dashboard & Data ---
ipcMain.handle('get-dashboard-stats', async (_, eventId) => {
    try {
      const config = store.get('dbConfig');
      if (!config) throw new Error('Database not configured.');
      const data = config.mode === 'server'
        ? await serverDb.getDashboardStats(config, eventId)
        : await localDb.getLocalDashboardStats(eventId);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, message: err.message };
    }
});

ipcMain.handle('get-participants', async (event, data) => {
    try {
        // Explicitly destructure the eventId and filters from the incoming 'data' object.
        const { eventId, filters } = data;

        const config = store.get('dbConfig');
        if (!config) {
            throw new Error("Database not configured.");
        }

        if (config.mode === 'server') {
            // Pass eventId and filters as separate arguments.
            return await serverDb.getParticipants(config, eventId, filters);
        } else {
            // Pass eventId and filters as separate arguments.
            return await localDb.getLocalParticipants(eventId, filters);
        }
    } catch (err)
    {
        console.error("Error in get-participants handler:", err);
        return { success: false, message: err.message, participants: [] };
    }
});

// ******** ADDED HANDLERS FOR DYNAMIC PRINTING ********

ipcMain.handle('get-event-by-id', async (_, eventId) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");
        const event = config.mode === 'server'
            ? await serverDb.getEventById(config, eventId)
            : await localDb.getEventById(eventId);
        return { success: true, event };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('get-template-by-id', async (_, templateId) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");
        const template = config.mode === 'server'
            ? await serverDb.getTemplateById(config, templateId)
            : await localDb.getTemplateById(templateId);
        return { success: true, template };
    } catch (err) {
        return { success: false, message: err.message };
    }
});


ipcMain.handle('get-next-regno', async (_, { eventId, roleCode }) => {
  const config = store.get('dbConfig');
  if (!config) return { success: false, regno: 'Error' };
  const regno = config.mode === 'server'
      ? await serverDb.getNextRegNo(config, eventId, roleCode)
      : await localDb.getNextRegNo(eventId, roleCode);
  return { success: true, regno };
});

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
        if (!config) {
            console.error("Database not configured.");
            return { success: false, message: "Database not configured.", roles: [] };
        }

        let roles;
        if (config.mode === 'server') {
            roles = await serverDb.getEventRoles(config, eventId);
        } else {
            roles = await localDb.getEventRoles(eventId);
        }
        
        // console.log(`Returning ${roles.length} roles for event ${eventId}`);
        return { success: true, roles };
    } catch (err) {
        console.error("Error in get-event-roles handler:", err);
        return { success: false, message: err.message, roles: [] };
    }
});

// ******** ADDED HANDLERS FOR CHECK-IN SCANNER ********

ipcMain.handle('get-sessions', async (_, eventId) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");
        const sessions = config.mode === 'server'
            ? await serverDb.getSessions(config, eventId)
            : await localDb.getLocalSessions(eventId);
        return { success: true, sessions };
    } catch (err) {
        return { success: false, message: err.message, sessions: [] };
    }
});

ipcMain.handle('get-check-ins', async (_, sessionId) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");
        // NOTE: Your DB files need to have these functions implemented
        const checkIns = config.mode === 'server'
            ? await serverDb.getCheckInsBySession(config, sessionId)
            : await localDb.getCheckInsBySession(sessionId);
        return { success: true, checkIns };
    } catch (err) {
        return { success: false, message: err.message, checkIns: [] };
    }
});

ipcMain.handle('process-check-in', async (_, { qrData, sessionId, eventId }) => {
    try {
        const config = store.get('dbConfig');
        if (!config) throw new Error("Database not configured.");

        // 1. Verify the QR code to get the registration number
        const verificationResult = scannerService.verifyToken(qrData);
        // If token is invalid, assume the raw data is the registration number
        let regno = verificationResult.success ? verificationResult.payload.regno : qrData.trim();

        // 2. Find the participant in the database
        const participant = config.mode === 'server'
            ? await serverDb.getParticipantByRegno(config, eventId, regno)
            : await localDb.getParticipantByRegno(eventId, regno);
        
        if (!participant) {
            throw new Error(`Participant with Registration No. '${regno}' not found for this event.`);
        }

        // 3. Attempt to add the check-in
        const checkInResult = config.mode === 'server'
            ? await serverDb.addCheckIn(config, eventId, participant.id, sessionId)
            : await localDb.addCheckIn(eventId, participant.id, sessionId);
        
        // 4. Return the combined result to the frontend
        return { 
            ...checkInResult, // This will include { success, limit_reached?, already_checked_in? }
            participant        // Include the participant details for the success message
        };

    } catch (err) {
        return { success: false, message: err.message };
    }
});

// ***** REPORT HANDLER *****
ipcMain.handle('get-report-data', async (_, eventId) => {
  try {
    const config = store.get('dbConfig');
    if (!config) throw new Error('Database not configured.');

    const fetchData = async (dbModule, ...args) => {
      const event = await dbModule.getEventById(...args);
      const stats = await dbModule.getDashboardStats(...args);
      // Pass an empty filter object to get ALL participants
      const participantsResult = await dbModule.getParticipants(...args, {}); 
      
      return {
        event,
        stats,
        participants: participantsResult.participants || [],
      };
    };

    const data = config.mode === 'server'
      ? await fetchData(serverDb, config, eventId)
      : await fetchData(localDb, eventId);
      
    return { success: true, data };

  } catch (err) {
    console.error("Error fetching report data:", err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-all-checkins-for-event', async (_, eventId) => {
  try {
    const config = store.get('dbConfig');
    if (!config) throw new Error('Database not configured.');

    const checkIns = config.mode === 'server'
      ? await serverDb.getAllCheckInsForEvent(config, eventId)
      : await localDb.getAllCheckInsForEvent(eventId);
      
    return { success: true, checkIns };

  } catch (err) {
    console.error("Error fetching all check-ins for event:", err);
    return { success: false, message: err.message };
  }
});