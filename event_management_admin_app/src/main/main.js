const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
// const localDb = require('./local-db'); // Handles local PostgreSQL connection
// const qrService = require('./qrService');
// const scannerService = require('./scannerService');
const jwt = require('jsonwebtoken'); // THIS LINE WAS MISSING

// Path for the new configuration file in the app's user data directory
const configPath = path.join(app.getPath('userData'), 'config.json');

let mainWindow;

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// =================================================================
// MAIN APPLICATION LIFECYCLE
// =================================================================

app.whenReady().then(async () => { // Make the function async
  // Automatically grant camera permission
  // session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  //   if (permission === 'media') {
  //     callback(true);
  //   } else {
  //     callback(false);
  //   }
  // });

  // --- Read config and connect to the local database on startup ---
  try {
    if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath));
        if (configData.dbHost) {
          console.log('Found config, attempting to connect to local database...');
          await localDb.connect(configData);
        } else {
          console.log('No database configured yet. Please set it up in the app settings.');
        }
    }
  } catch (error) {
    console.error('Could not read config or connect to database on startup:', error.message);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// =================================================================
// IPC HANDLERS - THIS IS THE NEW LOCAL BACKEND
// =================================================================

// --- Configuration Management ---
ipcMain.handle('get-config', async () => {
  try {
    if (fs.existsSync(configPath)) {
      const rawData = fs.readFileSync(configPath);
      return JSON.parse(rawData);
    }
    return {};
  } catch (err) {
    console.error('Error reading config:', err);
    return { error: err.message };
  }
});

ipcMain.handle('save-config', async (event, configData) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    await localDb.connect(configData);
    return { success: true };
  } catch (err) {
    console.error('Error saving config or connecting to DB:', err);
    return { success: false, error: err.message };
  }
});

// --- Connection Test ---
ipcMain.handle('test-db-connection', async () => {
    return await localDb.ping();
});

// --- User Management ---
ipcMain.handle('get-local-users', async () => {
  return await localDb.getLocalUsers();
});

ipcMain.handle('add-local-user', async (event, userData) => {
  return await localDb.addLocalUser(userData);
});

ipcMain.handle('update-local-user', async (event, userId, userData) => {
  return await localDb.updateLocalUser(userId, userData);
});

ipcMain.handle('delete-local-user', async (event, userId) => {
  return await localDb.deleteLocalUser(userId);
});

ipcMain.handle('authenticate-local-user', async (event, username, password) => {
    const result = await localDb.authenticateLocalUser(username, password);
    if (result.success) {
        const payload = {
            userId: result.user.id,
            username: result.user.username,
            role: result.user.role,
            assignedEventId: result.user.assigned_event_id
        };
        const secret = process.env.AUTH_SECRET || 'your-default-jwt-secret-key';
        const token = jwt.sign(payload, secret, { expiresIn: '8h' });
        return { success: true, token };
    }
    return result;
});

// --- Participant Management ---
ipcMain.handle('get-local-participants', async (event, eventId, filters) => {
  return await localDb.getParticipants(eventId, filters);
});

ipcMain.handle('add-local-participant', async (event, participantData) => {
  return await localDb.addParticipant(participantData);
});

// ... (other participant handlers) ...

// --- Check-in and Session Management ---
ipcMain.handle('get-local-sessions', async (event, eventId) => {
  return await localDb.getSessionsByEvent(eventId);
});

ipcMain.handle('add-local-checkin', async (event, checkInData) => {
  return await localDb.addCheckIn(checkInData.eventId, checkInData.participantId, checkInData.sessionId);
});

ipcMain.handle('get-local-checkins', async (event, eventId, sessionId) => {
    return await localDb.getCheckInsBySession(eventId, sessionId);
});

// ... (other session handlers) ...

// --- Print Template Management ---
ipcMain.handle('get-local-templates', async (event, eventId) => {
    return await localDb.getPrintTemplatesByEvent(eventId);
});

ipcMain.handle('save-local-template', async (event, templateData) => {
    return await localDb.updatePrintTemplate(templateData.id, templateData.name, templateData.data);
});

// ... (other template handlers) ...

// --- Dashboard ---
ipcMain.handle('get-local-dashboard-stats', async (event, eventId) => {
    return await localDb.getDashboardStats(eventId);
});

// --- Existing QR and Font Services ---
ipcMain.handle('generate-qr-code', async (event, participant) => {
  try {
    const token = qrService.generateSignedToken(participant);
    return { success: true, token };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('verify-qr-token', async (event, token) => {
  try {
    return scannerService.verifyToken(token);
  } catch (err) {
    console.error('Error verifying QR token:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-font-data', async (event, fontName) => {
    const fontMap = {
      'Roboto-Normal': 'roboto/files/roboto-latin-400-normal.woff',
      'Roboto-Bold': 'roboto/files/roboto-latin-700-normal.woff',
    };
    try {
      const fontPath = path.join(app.getAppPath(), 'node_modules', '@fontsource', fontMap[fontName]);
      const fontBuffer = fs.readFileSync(fontPath);
      return { success: true, data: fontBuffer };
    } catch (err) {
      console.error(`Error loading font: ${fontName}`, err);
      return { success: false, message: `Could not load font: ${fontName}` };
    }
});

// =================================================================
// SYNCHRONIZATION STUBS
// =================================================================

ipcMain.handle('seed-database-from-cloud', async (event, authToken, eventId) => {
    try {
        const response = await fetch(`http://localhost:3001/api/events/${eventId}/seed`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        return await localDb.clearAndSeedData(result.data);
    } catch (err) {
        console.error('Seeding error:', err);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('sync-changes', async (event, eventId) => {
    console.log(`Placeholder: Syncing changes for event ${eventId}`);
    return { success: false, message: 'Sync process not implemented yet.' };
});
