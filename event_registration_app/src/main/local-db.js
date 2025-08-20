// local-db.js
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

let db = null;

function createLocalDatabase({ folderPath, dbName }) {
  if (!folderPath || !dbName) {
    throw new Error('Folder path and database name must be provided for local database.');
  }

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const dbPath = path.join(folderPath, dbName);

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('SQLite connection error:', err);
        return reject(err);
      }
      console.log('✅ Connected to SQLite at', dbPath);
      try {
        await createTables();
        resolve({ success: true, path: dbPath });
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function createTables() {
  const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    assigned_event_id INTEGER,
    assigned_kiosk_name TEXT

  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT,
    organiser_name TEXT,
    organiser_email TEXT,
    organiser_phone TEXT,
    badge_template_id INTEGER,
    certificate_template_id INTEGER,
    roles TEXT,
    print_settings TEXT,
    local_admin_ids TEXT,
    last_kiosk_sync_at TEXT
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    regno TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    source TEXT,
    role TEXT,
    company TEXT,
    designation TEXT,
    country TEXT,
    paid_status TEXT,
    registered_at TEXT,
    FOREIGN KEY(event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    session_date TEXT,
    name TEXT,
    max_checkins INTEGER,
    FOREIGN KEY(event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    participant_id INTEGER,
    session_id INTEGER,
    check_in_time TEXT,
    FOREIGN KEY(participant_id) REFERENCES participants(id),
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
  
  CREATE TABLE IF NOT EXISTS print_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT,
    template_data TEXT
  );
  `;

  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not initialized"));
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// --- CRUD UTILS ---
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not initialized"));
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not initialized"));
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not initialized"));
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// --- USERS ---
async function authenticateLocalUser(username, password) {
  const user = await getQuery('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return null;
  const isValid = await bcrypt.compare(password, user.password_hash);
  return isValid ? user : null;
}

async function getLocalUsers() {
  return await allQuery('SELECT id, username, role, assigned_event_id, assigned_kiosk_name FROM users');
}

async function addLocalUser(user) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const result = await runQuery(
    'INSERT INTO users (username, password_hash, role, assigned_event_id) VALUES (?, ?, ?, ?)',
    [user.username, passwordHash, user.role, user.assigned_event_id]
  );
  return { id: result.lastID, ...user };
}

async function updateLocalUser(id, fields) {
  if (fields.password === '') {
    delete fields.password;
  } else if (fields.password) {
    fields.password_hash = await bcrypt.hash(fields.password, 10);
    delete fields.password;
  }
  const updates = Object.keys(fields).map(key => `${key}=?`).join(',');
  const values = [...Object.values(fields), id];
  const result = await runQuery(`UPDATE users SET ${updates} WHERE id=?`, values);
  return result.changes;
}

async function deleteLocalUser(id) {
  return await runQuery('DELETE FROM users WHERE id=?', [id]);
}

async function updateUserEventId(userId, eventId) {
    return await runQuery('UPDATE users SET assigned_event_id = ? WHERE id = ?', [eventId, userId]);
}

async function recordUserLogin(userId, hostname) {
    try {
        await runQuery('UPDATE users SET assigned_kiosk_name = ? WHERE id = ?', [hostname, userId]);
    } catch (err) {
        console.error("Failed to record local user login:", err);
    }
}


// --- DATA ACCESS ---
async function getLatestEventId() {
  const row = await getQuery('SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT 1');
  return row ? row.id : null;
}

async function getNextRegNo(eventId, roleCode) {
    const prefix = `${roleCode}-`;
    const result = await getQuery(
        `SELECT regno FROM participants
         WHERE event_id = ? AND regno LIKE ?
         ORDER BY id DESC LIMIT 1`,
        [eventId, `${prefix}%`]
    );
    let nextNum = 1;
    if (result && result.regno) {
        const lastNum = parseInt(result.regno.split('-')[1], 10);
        if (!isNaN(lastNum)) {
            nextNum = lastNum + 1;
        }
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

async function getLocalDashboardStats(eventId) {
    let targetEventId = eventId;
    if (!targetEventId) {
        const event = await getQuery('SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT 1');
        if (event) targetEventId = event.id;
    }

    if (!targetEventId) {
        return { stats: {}, roles: [], daywise: [], recent: [] };
    }

    const statsQuery = `SELECT 
        COUNT(*) as total_participants,
        SUM(CASE WHEN paid_status = 'Paid' THEN 1 ELSE 0 END) as total_paid,
        SUM(CASE WHEN paid_status = 'Unpaid' THEN 1 ELSE 0 END) as total_unpaid,
        SUM(CASE WHEN source = 'online' THEN 1 ELSE 0 END) as total_online,
        SUM(CASE WHEN source = 'offline' THEN 1 ELSE 0 END) as total_offline,
        (SELECT COUNT(DISTINCT participant_id) FROM check_ins WHERE event_id = p.event_id) as total_arrived
      FROM participants p WHERE p.event_id = ?`;
      
    const rolesQuery = `SELECT role, COUNT(*) as count FROM participants WHERE event_id = ? GROUP BY role`;
    const daywiseQuery = `SELECT DATE(registered_at) as date, COUNT(*) as count FROM participants WHERE event_id = ? GROUP BY DATE(registered_at) ORDER BY date`;
    const recentQuery = `SELECT * FROM participants WHERE event_id = ? ORDER BY registered_at DESC LIMIT 5`;

    const stats = await getQuery(statsQuery, [targetEventId]);
    const roles = await allQuery(rolesQuery, [targetEventId]);
    const daywise = await allQuery(daywiseQuery, [targetEventId]);
    const recent = await allQuery(recentQuery, [targetEventId]);
    
    return { stats, roles, daywise, recent };
}

async function getLocalSessions(eventId) {
    let targetEventId = eventId;
    if (!targetEventId) {
      const event = await getQuery('SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT 1');
      if (event) targetEventId = event.id;
    }
    if (!targetEventId) return [];
    return await allQuery('SELECT * FROM sessions WHERE event_id=?', [targetEventId]);
}

async function getLocalParticipants(eventId, filters = {}) {
    if (!eventId) return { success: false, participants: [], message: "Event ID missing" };

    try {
        let query = `SELECT id, regno, name, email, phone, role FROM participants WHERE event_id = ?`;
        const params = [eventId];

        // ... filter logic remains the same ...
        if (filters.regno) {
            query += ` AND regno LIKE ?`;
            params.push(`%${filters.regno}%`);
        }
        if (filters.name) {
            query += ` AND name LIKE ?`;
            params.push(`%${filters.name}%`);
        }
        if (filters.role) {
            query += ` AND role = ?`;
            params.push(filters.role);
        }

        // Use allQuery to get all rows, not just the first one
        const rows = await allQuery(query, params); 
        return { success: true, participants: rows };
    } catch (err) {
        console.error("Error fetching participants (SQLite):", err);
        return { success: false, participants: [], message: err.message };
    }
}


async function addLocalParticipant(data) {
  const { event_id, regno, name, email, phone, role, company, designation, country, paidStatus, source, registered_at } = data;
  const result = await runQuery(
    `INSERT INTO participants (event_id, regno, name, email, phone, role, company, designation, country, paid_status, source, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event_id, regno, name, email, phone, role, company, designation, country, paidStatus, source, registered_at]
  );
  return { id: result.lastID, ...data };
}

// ADD this new function for bulk uploads
async function addBulkParticipants(eventId, participants) {
    const results = { inserted: 0, skipped: 0, errors: 0 };
    const eventRoles = await getEventRoles(eventId); // Fetch roles for validation

    for (const p of participants) {
        try {
            // Validate the role from the spreadsheet against the event's allowed roles
            const roleObj = eventRoles.find(r => r.name === p.role && r.enabled);
            if (!p.name || !roleObj) {
                results.errors++;
                continue;
            }
            const regno = await getNextRegNo(eventId, roleObj.code);
            const payload = {
                event_id: eventId,
                regno,
                name: p.name,
                email: p.email || null,
                phone: p.phone || null,
                role: p.role,
                company: p.company || null,
                designation: p.designation || null,
                country: p.country || null,
                paidStatus: p.paidStatus || 'Unpaid',
                source: 'Online',
                registered_at: new Date().toISOString()
            };
            await addLocalParticipant(payload);
            results.inserted++;
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                results.skipped++;
            } else {
                results.errors++;
            }
        }
    }
    return results;
}

// --- SEEDING ---
async function clearAndSeedDataFromServer(data) {
  try {
    await runQuery('DELETE FROM check_ins');
    await runQuery('DELETE FROM participants');
    await runQuery('DELETE FROM sessions');
    await runQuery('DELETE FROM events');

    const { event, participants, sessions } = data;

    if (event) {
        const eventKeys = Object.keys(event).join(', ');
        const eventValues = Object.values(event);
        const placeholders = eventValues.map(() => '?').join(', ');
        await runQuery(`INSERT INTO events (${eventKeys}) VALUES (${placeholders})`, eventValues);
    }

    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        const sKeys = Object.keys(s).join(', ');
        const sValues = Object.values(s);
        const placeholders = sValues.map(() => '?').join(', ');
        await runQuery(`INSERT INTO sessions (${sKeys}) VALUES (${placeholders})`, sValues);
      }
    }

    if (participants && participants.length > 0) {
      for (const p of participants) {
        const pKeys = Object.keys(p).join(', ');
        const pValues = Object.values(p);
        const placeholders = pValues.map(() => '?').join(', ');
        await runQuery(`INSERT INTO participants (${pKeys}) VALUES (${placeholders})`, pValues);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Local DB Seeding failed:', err);
    return { success: false, message: err.message };
  }
}

// --- DATABASE UTILS ---
async function isDatabaseSeeded() {
  if (!db) {
    return false;
  }
  try {
    const row = await getQuery('SELECT COUNT(*) as count FROM events');
    return row && row.count > 0;
  } catch (err) {
    console.error('isDatabaseSeeded check failed:', err);
    return false;
  }
}

async function getEventRoles(eventId) {
  if (!eventId) {
    console.error("getEventRoles called without an eventId.");
    return [];
  }
  
  try {
    const event = await getQuery('SELECT roles FROM events WHERE id = ?', [eventId]);
    
    if (!event || !event.roles) {
      console.warn(`No roles found for eventId: ${eventId} in local DB.`);
      return [];
    }
    
    let rolesData = event.roles;
    
    // SQLite stores JSON as TEXT, so it must be parsed
    if (typeof rolesData === 'string') {
      try {
        rolesData = JSON.parse(rolesData);
      } catch (err) {
        console.error('Failed to parse roles JSON from local DB:', err);
        return [];
      }
    }

    // Filter only enabled roles
    const enabledRoles = Array.isArray(rolesData) 
      ? rolesData.filter(role => role.enabled === true) 
      : [];
    
    console.log(`Found ${enabledRoles.length} enabled roles for event ${eventId}:`, enabledRoles);
    return enabledRoles;

  } catch (error) {
    console.error(`Error fetching local roles for eventId ${eventId}:`, error);
    return [];
  }
}


module.exports = {
  createLocalDatabase,
  isDatabaseSeeded,
  authenticateLocalUser,
  getLocalUsers,
  addLocalUser,
  updateLocalUser,
  deleteLocalUser,
  updateUserEventId,
  recordUserLogin,
  clearAndSeedDataFromServer,
  getLocalDashboardStats,
  getLocalSessions,
  getLatestEventId,
  getNextRegNo,
  getLocalParticipants,
  addLocalParticipant,
  addBulkParticipants,
  getEventRoles
};
