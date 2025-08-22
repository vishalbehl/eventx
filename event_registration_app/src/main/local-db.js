// local-db.js
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

let db = null;

async function hashPassword(password) {
  if (!password) return null;
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

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


// ******** THIS IS THE UPDATED AND COMPLETED SCHEMA ********
async function createTables() {
  const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT,
  assigned_event_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  allowed_ip TEXT,      -- ADD THIS LINE
  allowed_mac TEXT,     -- ADD THIS LINE
  needs_sync INTEGER DEFAULT 0
);

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, -- Not autoincrement, ID comes from central server
    name TEXT,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT,
    updated_at TEXT,
    organiser_name TEXT,
    organiser_email TEXT,
    organiser_phone TEXT,
    badge_template_id INTEGER,
    certificate_template_id INTEGER,
    roles TEXT, -- Storing JSON as TEXT
    print_settings TEXT, -- Storing JSON as TEXT
    local_admin_ids TEXT, -- Storing Array as TEXT
    last_kiosk_sync_at TEXT,
    needs_sync INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY, -- Not autoincrement, ID comes from central server
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
    updated_at TEXT,
    needs_sync INTEGER DEFAULT 0,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE(event_id, email),
    UNIQUE(event_id, phone)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY, -- Not autoincrement, ID comes from central server
    event_id INTEGER,
    session_date TEXT,
    name TEXT,
    created_at TEXT,
    updated_at TEXT,
    max_checkins INTEGER,
    needs_sync INTEGER DEFAULT 0,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    participant_id INTEGER,
    session_id INTEGER,
    check_in_time TEXT,
    updated_at TEXT,
    needs_sync INTEGER DEFAULT 0,
    FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS print_templates (
    id INTEGER PRIMARY KEY, -- Not autoincrement, ID comes from central server
    template_name TEXT,
    template_data TEXT, -- Storing JSON as TEXT
    created_at TEXT,
    updated_at TEXT,
    needs_sync INTEGER DEFAULT 0
  );
  `;

  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not initialized"));
    db.exec(schema, async (err) => {
      if (err) {
        return reject(err);
      }
      // Add default admin user after tables are created
      try {
        const adminPassword = await hashPassword('admin123');
        const sql = `INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)`;
        db.run(sql, ['admin', adminPassword, 'admin'], (runErr) => {
          if (runErr) return reject(runErr);
          resolve(true);
        });
      } catch (hashErr) {
        reject(hashErr);
      }
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
  return await allQuery('SELECT id, username, role, assigned_event_id, assigned_kiosk_name, allowed_ip, allowed_mac FROM users');
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
    
    // 1. Get all registration numbers for this role, ordered numerically
    const allRegNos = await allQuery(
      `SELECT regno FROM participants
       WHERE event_id = ? AND regno LIKE ?
       ORDER BY CAST(SUBSTR(regno, LENGTH(?) + 2) AS INTEGER) ASC`,
      [eventId, `${prefix}%`, prefix]
    );

    // 2. Extract just the numeric part of each regno
    const existingNums = allRegNos.map(p => parseInt(p.regno.split('-')[1], 10));

    // 3. Find the first gap in the sequence
    let nextNum = 1;
    for (const num of existingNums) {
      // If the current number from the DB is greater than our counter,
      // it means we've found the first available number.
      if (num > nextNum) {
        break;
      }
      // Otherwise, increment our counter and check the next number.
      nextNum++;
    }

    // 4. Format the final registration number string and return it
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

    // This query is now corrected to count DISTINCT participants and not join with check_ins
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM participants WHERE event_id = ?) as total_participants,
        (SELECT COUNT(DISTINCT participant_id) FROM check_ins WHERE event_id = ?) as total_arrived,
        SUM(CASE WHEN paid_status = 'Paid' THEN 1 ELSE 0 END) as total_paid,
        SUM(CASE WHEN paid_status = 'Unpaid' THEN 1 ELSE 0 END) as total_unpaid,
        SUM(CASE WHEN source LIKE 'online%' THEN 1 ELSE 0 END) as total_online,
        SUM(CASE WHEN source = 'offline' THEN 1 ELSE 0 END) as total_offline
      FROM participants WHERE event_id = ?`;

    const rolesQuery = `SELECT role, COUNT(*) as count FROM participants WHERE event_id = ? GROUP BY role`;
    const daywiseQuery = `SELECT DATE(registered_at) as date, COUNT(*) as count FROM participants WHERE event_id = ? GROUP BY DATE(registered_at) ORDER BY date`;
    const recentQuery = `SELECT * FROM participants WHERE event_id = ? ORDER BY registered_at DESC LIMIT 5`;

    // The query now takes the eventId three times
    const stats = await getQuery(statsQuery, [targetEventId, targetEventId, targetEventId]);
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
    try {
        let queryStr = `SELECT * FROM participants WHERE event_id = ?`;
        const params = [eventId];
        for (const key in filters) {
            if (filters[key]) {
                // For SQLite, use the LIKE operator and add wildcards
                queryStr += ` AND ${key} LIKE ?`;
                params.push(`%${filters[key]}%`);
            }
        }
        queryStr += ` ORDER BY id DESC`;
        const rows = await allQuery(queryStr, params);
        // Return the data in the format the frontend expects
        return { success: true, participants: rows };
    } catch (error) {
        console.error("Error fetching participants from local DB:", error);
        return { success: false, message: error.message, participants: [] };
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

async function updateLocalParticipant(id, data) {
  // 1. Get the participant's current state from the database
  const currentUser = await getQuery('SELECT role, regno FROM participants WHERE id = ?', [id]);

  if (!currentUser) {
    throw new Error(`Participant with ID ${id} not found.`);
  }

  // 2. Start with the existing registration number as the default
  let finalRegno = currentUser.regno;

  // 3. If the role has changed, generate a new registration number
  if (currentUser.role !== data.role) {
    const eventRoles = await getEventRoles(data.event_id);
    const roleObj = eventRoles.find(r => r.name === data.role);
    if (roleObj) {
      // Overwrite the default with the new number
      finalRegno = await getNextRegNo(data.event_id, roleObj.code);
    }
    // If a valid new role isn't found, we safely keep the old regno
  }

  // 4. Perform the update using the finalRegno
  const { name, email, phone, role, company, designation, country, paidStatus } = data;
  await runQuery(
    `UPDATE participants 
     SET name=?, email=?, phone=?, role=?, company=?, designation=?, country=?, paid_status=?, regno=?
     WHERE id = ?`,
    // Use the correctly determined 'finalRegno' here
    [name, email, phone, role, company, designation, country, paidStatus, finalRegno, id]
  );
  
  // 5. Return the fully updated participant record
  return await getQuery('SELECT * FROM participants WHERE id = ?', [id]);
}

async function addBulkParticipants(eventId, participants) {
    const results = { inserted: 0, skipped: 0, errors: 0 };
    const eventRoles = await getEventRoles(eventId);

    for (const p of participants) {
        try {
            // 1. Basic validation
            const roleObj = eventRoles.find(r => r.name === p.role && r.enabled);
            if (!p.name || !roleObj) {
                results.errors++;
                continue;
            }

            // 2. Proactive duplicate check
            if (p.email || p.phone) {
                const checkQuery = `SELECT id FROM participants WHERE event_id = ? AND (email = ? OR phone = ?)`;
                const existing = await getQuery(checkQuery, [eventId, p.email || null, p.phone || null]);
                if (existing) {
                    results.skipped++;
                    continue; // Skip this participant
                }
            }

            // 3. If no duplicate, proceed with insertion
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
                source: 'online-bulk',
                registered_at: new Date().toISOString()
            };
            await addLocalParticipant(payload);
            results.inserted++;
        } catch (err) {
            // This catch block will now correctly handle any database-level unique constraint errors as a fallback
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
    // 1. Clear all existing event-related data
    await runQuery('DELETE FROM check_ins');
    await runQuery('DELETE FROM participants');
    await runQuery('DELETE FROM sessions');
    await runQuery('DELETE FROM events');
    await runQuery('DELETE FROM print_templates');

    const { event, participants, sessions, templates } = data;

    // 2. Insert the main event details
    if (event) {
      const eventToInsert = { ...event };
      delete eventToInsert.needs_sync; // Column doesn't exist in local DB

      // Ensure JSON fields are stringified for SQLite
      if (typeof eventToInsert.roles !== 'string') {
        eventToInsert.roles = JSON.stringify(eventToInsert.roles || []);
      }
      if (typeof eventToInsert.print_settings !== 'string') {
        eventToInsert.print_settings = JSON.stringify(eventToInsert.print_settings || {});
      }

      const eventKeys = Object.keys(eventToInsert).join(', ');
      const eventValues = Object.values(eventToInsert);
      const placeholders = eventValues.map(() => '?').join(', ');
      await runQuery(`INSERT INTO events (${eventKeys}) VALUES (${placeholders})`, eventValues);
    }

    // 3. Insert all sessions for the event
    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        const sKeys = Object.keys(s).join(', ');
        const sValues = Object.values(s);
        const placeholders = sValues.map(() => '?').join(', ');
        await runQuery(`INSERT INTO sessions (${sKeys}) VALUES (${placeholders})`, sValues);
      }
    }

    // 4. Insert all participants for the event
    if (participants && participants.length > 0) {
      for (const p of participants) {
        const pKeys = Object.keys(p).join(', ');
        const pValues = Object.values(p);
        const placeholders = pValues.map(() => '?').join(', ');
        await runQuery(`INSERT INTO participants (${pKeys}) VALUES (${placeholders})`, pValues);
      }
    }

    // 5. ******** THIS IS THE MISSING PART ********
    // Insert all print templates
    if (templates && templates.length > 0) {
        for (const t of templates) {
            // SQLite stores JSON as a string, so ensure it's stringified
            const templateDataString = typeof t.template_data === 'string'
                ? t.template_data
                : JSON.stringify(t.template_data);

            await runQuery(
                'INSERT INTO print_templates (id, template_name, template_data) VALUES (?, ?, ?)',
                [t.id, t.template_name, templateDataString]
            );
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

// ******** ADDED FUNCTIONS FOR DYNAMIC PRINTING ********

async function getEventById(eventId) {
    if (!eventId) return null;
    return await getQuery('SELECT * FROM events WHERE id = ?', [eventId]);
}

async function getTemplateById(templateId) {
    if (!templateId) return null;
    const template = await getQuery('SELECT * FROM print_templates WHERE id = ?', [templateId]);
    // SQLite stores JSON as text, so we need to parse it
    if (template && typeof template.template_data === 'string') {
        try {
            template.template_data = JSON.parse(template.template_data);
        } catch (e) {
            console.error("Failed to parse template data from local DB:", e);
            template.template_data = null; // Set to null if invalid
        }
    }
    return template;
}

async function addCheckIn(eventId, participantId, sessionId) {
    try {
        // 1. Get the session's check-in limit (defaults to 1 if not set)
        const session = await getQuery('SELECT max_checkins FROM sessions WHERE id = ?', [sessionId]);
        const maxCheckins = session?.max_checkins || 1;

        // 2. Count how many times this participant has already checked into this session
        const countResult = await getQuery(
            'SELECT COUNT(*) as count FROM check_ins WHERE participant_id = ? AND session_id = ?',
            [participantId, sessionId]
        );
        const existingCheckinCount = countResult?.count || 0;

        // 3. If the limit is reached, return the specific status
        if (existingCheckinCount >= maxCheckins) {
            return { success: true, limit_reached: true };
        }

        // 4. Otherwise, insert the new check-in record
        await runQuery(
            'INSERT INTO check_ins (event_id, participant_id, session_id, check_in_time) VALUES (?, ?, ?, ?)',
            [eventId, participantId, sessionId, new Date().toISOString()]
        );

        return { success: true };
    } catch (error) {
        console.error("Error in localDb.addCheckIn:", error);
        return { success: false, message: error.message };
    }
}
async function getCheckInsBySession(sessionId) {
    if (!sessionId) {
        return [];
    }
    try {
        // This query joins check_ins with participants to get participant details for the list.
        const rows = await allQuery(`
            SELECT p.id, p.regno, p.name, c.check_in_time
            FROM check_ins c
            JOIN participants p ON c.participant_id = p.id
            WHERE c.session_id = ?
            ORDER BY c.check_in_time DESC
        `, [sessionId]);
        return rows;
    } catch (error) {
        console.error("Error in localDb.getCheckInsBySession:", error);
        return []; // Return empty array on error
    }
}
async function getAllCheckInsForEvent(eventId) {
  if (!eventId) return [];
  const query = `
    SELECT
      c.check_in_time,
      p.regno,
      p.name AS participant_name,
      p.role AS participant_role,
      s.id AS session_id,
      s.name AS session_name,
      s.session_date  -- <-- ADD THIS LINE
    FROM check_ins c
    JOIN participants p ON c.participant_id = p.id
    JOIN sessions s ON c.session_id = s.id
    WHERE c.event_id = ?
    ORDER BY s.session_date, s.id, p.role, p.regno ASC -- <-- ADD s.session_date
  `;
  return await allQuery(query, [eventId]);
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
  updateLocalParticipant,
  addBulkParticipants,
  getEventRoles,
  getEventById,
  getTemplateById,
  addCheckIn,
  getCheckInsBySession,
  getAllCheckInsForEvent
};
