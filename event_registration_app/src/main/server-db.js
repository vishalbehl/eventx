// server-db.js
require('dotenv').config();
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

// Helper to create a new connection pool for a given request
const getPool = (config) => {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.dbName,
  });
};

async function hashPassword(password) {
  if (!password) return null;
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

// --- Schema & Initial Setup ---
async function createServerDatabase(config) {
  const { dbType, host, port, user, password, dbName } = config;
  const adminPassword = await hashPassword('admin123');

  try {
    if (dbType === 'mysql') {
      // ---------- MYSQL ----------
      const conn = await mysql.createConnection({ host, port, user, password });
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
      await conn.end();

      const db = await mysql.createConnection({ host, port, user, password, database: dbName });
      const tableQueries = [
        `CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(50),
          assigned_event_id INT,
          assigned_kiosk_name VARCHAR(255),
          needs_sync BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255),
          description TEXT,
          start_date DATE,
          end_date DATE,
          organiser_name VARCHAR(255),
          organiser_email VARCHAR(255),
          organiser_phone VARCHAR(50),
          badge_template_id INT,
          certificate_template_id INT,
          roles JSON,
          print_settings JSON,
          local_admin_ids JSON,
          last_kiosk_sync_at TIMESTAMP,
          needs_sync BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS participants (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_id INT,
          regno VARCHAR(255),
          name VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          source VARCHAR(255),
          role VARCHAR(50),
          company VARCHAR(255),
          designation VARCHAR(255),
          country VARCHAR(50),
          paid_status VARCHAR(50),
          registered_at TIMESTAMP,
          needs_sync BOOLEAN DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_id INT,
          session_date DATE,
          name VARCHAR(255),
          max_checkins INT,
          needs_sync BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS check_ins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_id INT,
          participant_id INT,
          session_id INT,
          check_in_time TIMESTAMP,
          needs_sync BOOLEAN DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS print_templates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          template_name VARCHAR(255),
          template_data JSON,
          needs_sync BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`
      ];
      for (const q of tableQueries) await db.query(q);
      await db.query(
        `INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
        ['admin', adminPassword, 'admin']
      );
      await db.end();

    } else if (dbType === 'postgres') {
      // ---------- POSTGRES ----------
      let client = new Client({ host, port, user, password, database: 'postgres' });
      await client.connect();
      const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
      if (res.rowCount === 0) {
        await client.query(`CREATE DATABASE "${dbName}"`);
        console.log(`Postgres database '${dbName}' created.`);
      } else {
        console.log('Postgres database already exists.');
      }
      await client.end();

      const dbClient = new Client({ host, port, user, password, database: dbName });
      await dbClient.connect();

      const pgTables = [
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT,
          assigned_event_id INT,
          assigned_kiosk_name TEXT,
          needs_sync BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          name TEXT,
          description TEXT,
          start_date DATE,
          end_date DATE,
          organiser_name VARCHAR(255),
          organiser_email VARCHAR(255),
          organiser_phone VARCHAR(50),
          badge_template_id INT,
          certificate_template_id INT,
          roles JSONB,
          print_settings JSONB,
          local_admin_ids TEXT[],
          last_kiosk_sync_at TIMESTAMP,
          needs_sync BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS participants (
          id SERIAL PRIMARY KEY,
          event_id INT,
          regno TEXT,
          name TEXT,
          email TEXT,
          phone TEXT,
          source TEXT,
          role VARCHAR(50),
          company VARCHAR(255),
          designation VARCHAR(255),
          country VARCHAR(50),
          paid_status VARCHAR(50),
          registered_at TIMESTAMP,
          needs_sync BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          event_id INT,
          session_date DATE,
          name TEXT,
          max_checkins INT,
          needs_sync BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS check_ins (
          id SERIAL PRIMARY KEY,
          event_id INT,
          participant_id INT,
          session_id INT,
          check_in_time TIMESTAMP,
          needs_sync BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS print_templates (
          id SERIAL PRIMARY KEY,
          template_name VARCHAR(255),
          template_data JSONB,
          needs_sync BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`
      ];

      for (const q of pgTables) {
        await dbClient.query(q);
      }

      await dbClient.query(
        `INSERT INTO users (username, password_hash, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING`,
        ['admin', adminPassword, 'admin']
      );

      console.log('Postgres tables created successfully.');
      await dbClient.end();
    }

    return { success: true };
  } catch (err) {
    console.error('Error creating server DB:', err);
    throw err;
  }
}

async function query(sql, params = []) {
const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : '',
  database: process.env.DB_NAME,
});

await client.connect();
try {
  return await client.query(sql, params);
} finally {
  await client.end();
}
}

// --- User Management ---
async function getUsers(config) {
  const pool = getPool(config);
  const res = await pool.query('SELECT id, username, role, assigned_event_id, assigned_kiosk_name FROM users ORDER BY id');
  await pool.end();
  return res.rows;
}

async function addUser(config, userData) {
  const pool = getPool(config);
  const passwordHash = await hashPassword(userData.password);
  const res = await pool.query(
    'INSERT INTO users (username, password_hash, role, assigned_event_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [userData.username, passwordHash, userData.role, userData.assigned_event_id]
  );
  await pool.end();
  return { id: res.rows[0].id, ...userData };
}

async function updateUser(config, id, fields) {
    const pool = getPool(config);
    if (fields.password && fields.password.trim() !== '') {
        fields.password_hash = await hashPassword(fields.password);
    }
    delete fields.password; // Always remove plain password

    const pgUpdates = Object.keys(fields).map((key, i) => `${key} = $${i + 1}`).join(', ');
    const pgValues = [...Object.values(fields), id];
    
    const res = await pool.query(`UPDATE users SET ${pgUpdates} WHERE id = $${pgValues.length}`, pgValues);
    await pool.end();
    return res.rowCount;
}

async function deleteUser(config, id) {
    const pool = getPool(config);
    const res = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await pool.end();
    return res.rowCount;
}

async function recordUserLogin(config, userId, hostname) {
    const pool = getPool(config);
    await pool.query('UPDATE users SET assigned_kiosk_name = $1 WHERE id = $2', [hostname, userId]);
    await pool.end();
}

// --- Authenticate user against server DB ---
async function authenticateServerUser(config, username, password) {
  const { dbType, host, port, user, dbName } = config;
  let connection;
  try {
    if (dbType === 'mysql') {
      connection = await mysql.createConnection({ host, port, user, password: config.password, database: dbName });
      const [rows] = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);
      if (rows.length === 0) return { success: false, message: 'User not found' };
      
      const dbUser = rows[0];
      const isValid = await bcrypt.compare(password, dbUser.password_hash);
      if (!isValid) return { success: false, message: 'Invalid credentials' };

      return { success: true, user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, assignedEventId: dbUser.assigned_event_id } };

    } else if (dbType === 'postgres') {
      connection = new Client({ host, port, user, password: config.password, database: dbName });
      await connection.connect();
      const res = await connection.query('SELECT * FROM users WHERE username = $1', [username]);
      if (res.rows.length === 0) return { success: false, message: 'User not found' };

      const dbUser = res.rows[0];
      const isValid = await bcrypt.compare(password, dbUser.password_hash);
      if (!isValid) return { success: false, message: 'Invalid credentials' };

      return { success: true, user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, assignedEventId: dbUser.assigned_event_id } };
    } else {
      throw new Error('Unsupported DB type');
    }
  } catch (err) {
    console.error(`Server auth error:`, err);
    return { success: false, message: err.message };
  } finally {
    if (connection) {
        if (dbType === 'mysql') await connection.end();
        if (dbType === 'postgres') await connection.end();
    }
  }
}

// --- Clear and seed data from central server ---
async function clearAndSeedDataFromServer(config, data) {
    const { dbType, host, port, user, password, dbName } = config;
    const { event, participants, sessions } = data;
    let client;

    try {
        client = new Client({ host, port, user, password, database: dbName });
        await client.connect();
        await client.query('BEGIN');

        // Clear existing data for the event
        await client.query('DELETE FROM check_ins WHERE event_id = $1', [event.id]);
        await client.query('DELETE FROM participants WHERE event_id = $1', [event.id]);
        await client.query('DELETE FROM sessions WHERE event_id = $1', [event.id]);
        await client.query('DELETE FROM events WHERE id = $1', [event.id]);

        // Fix JSON fields
        if (event.roles && typeof event.roles !== 'string') {
            event.roles = JSON.stringify(event.roles);
        }
        if (event.print_settings && typeof event.print_settings !== 'string') {
            event.print_settings = JSON.stringify(event.print_settings);
        }
        if (event.local_admin_ids && !Array.isArray(event.local_admin_ids)) {
            try {
                event.local_admin_ids = JSON.parse(event.local_admin_ids);
            } catch {
                event.local_admin_ids = [];
            }
        }

        // Insert event
        const eventKeys = Object.keys(event).join(', ');
        const eventValues = Object.values(event);
        const eventPlaceholders = eventValues.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO events (${eventKeys}) VALUES (${eventPlaceholders})`, eventValues);

        // Insert sessions
        if (sessions && sessions.length > 0) {
            for (const session of sessions) {
                const sKeys = Object.keys(session).join(', ');
                const sValues = Object.values(session);
                const sPlaceholders = sValues.map((_, i) => `$${i + 1}`).join(', ');
                await client.query(`INSERT INTO sessions (${sKeys}) VALUES (${sPlaceholders})`, sValues);
            }
        }

        // Insert participants
        if (participants && participants.length > 0) {
            for (const p of participants) {
                const pKeys = Object.keys(p).join(', ');
                const pValues = Object.values(p);
                const pPlaceholders = pValues.map((_, i) => `$${i + 1}`).join(', ');
                await client.query(`INSERT INTO participants (${pKeys}) VALUES (${pPlaceholders})`, pValues);
            }
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Server DB Seeding failed:', err);
        return { success: false, message: err.message };
    } finally {
        if (client) await client.end();
    }
}

// --- Get dashboard statistics ---
async function getDashboardStats(config, eventId) {
  const statsQuery = `
    SELECT
      e.id,
      COUNT(p.id) AS total_participants,
      COUNT(DISTINCT c.participant_id) AS total_arrived,
      COUNT(CASE WHEN p.source = 'online' THEN 1 END) AS total_online,
      COUNT(CASE WHEN p.source = 'offline' THEN 1 END) AS total_offline,
      COUNT(CASE WHEN p.paid_status = 'Paid' THEN 1 END) AS total_paid,
      COUNT(CASE WHEN p.paid_status = 'Unpaid' THEN 1 END) AS total_unpaid
    FROM events e
    LEFT JOIN participants p ON e.id = p.event_id
    LEFT JOIN check_ins c ON e.id = c.event_id
    WHERE e.id = $1
    GROUP BY e.id
  `;

  const rolesQuery = `
    SELECT role, COUNT(*) AS count
    FROM participants
    WHERE event_id = $1 AND role IS NOT NULL
    GROUP BY role
  `;

  const daywiseQuery = `
    SELECT DATE(registered_at) AS date, COUNT(*) AS count
    FROM participants
    WHERE event_id = $1
    GROUP BY DATE(registered_at)
    ORDER BY date ASC
  `;

  const recentQuery = `
    SELECT * FROM participants
    WHERE event_id = $1
    ORDER BY id DESC
    LIMIT 5
  `;

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.dbName,
  });
  await client.connect();

  try {
    const [statsResult, rolesResult, daywiseResult, recentResult] = await Promise.all([
      client.query(statsQuery, [eventId]),
      client.query(rolesQuery, [eventId]),
      client.query(daywiseQuery, [eventId]),
      client.query(recentQuery, [eventId]),
    ]);

    return {
      stats: statsResult.rows[0] || {},
      roles: rolesResult.rows,
      daywise: daywiseResult.rows,
      recent: recentResult.rows,
    };
  } finally {
    await client.end();
  }
}

// --- Get sessions for an event ---
async function getSessions(config, eventId) {
    const { dbType, host, port, user, password, dbName } = config;
    let client;
    let targetEventId = eventId;
  
    try {
      if (dbType === 'mysql') {
        client = await mysql.createConnection({ host, port, user, password, database: dbName });
        if (!targetEventId) {
          const [eventRows] = await client.execute('SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT 1');
          if (eventRows.length > 0) targetEventId = eventRows[0].id;
        }
        if (!targetEventId) return [];
        const [rows] = await client.execute('SELECT * FROM sessions WHERE event_id = ?', [targetEventId]);
        return rows;
  
      } else if (dbType === 'postgres') {
        client = new Client({ host, port, user, password, database: dbName });
        await client.connect();
        if (!targetEventId) {
          const res = await client.query('SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT 1');
          if (res.rows.length > 0) targetEventId = res.rows[0].id;
        }
        if (!targetEventId) return [];
        const res = await client.query('SELECT * FROM sessions WHERE event_id = $1', [targetEventId]);
        return res.rows;
      }
    } catch (err) {
      console.error('Server getSessions failed:', err);
      return [];
    } finally {
        if (client) {
            if (dbType === 'mysql') await client.end();
            if (dbType === 'postgres') await client.end();
        }
    }
}

// --- Check if server DB is seeded ---
async function isServerDatabaseSeeded(config) {
    const { dbType, host, port, user, password, dbName } = config;
    let client;
    try {
      let rowCount = 0;
      if (dbType === 'mysql') {
        client = await mysql.createConnection({ host, port, user, password, database: dbName });
        const [rows] = await client.execute('SELECT COUNT(*) as count FROM events');
        rowCount = rows.length > 0 ? rows[0].count : 0;
      } else if (dbType === 'postgres') {
        client = new Client({ host, port, user, password, database: dbName });
        await client.connect();
        const res = await client.query('SELECT COUNT(*) as count FROM events');
        rowCount = res.rows.length > 0 ? parseInt(res.rows[0].count, 10) : 0;
      }
      return rowCount > 0;
    } catch (err) {
      console.error('isServerDatabaseSeeded check failed:', err.message);
      return false;
    } finally {
        if (client) {
            if (dbType === 'mysql') await client.end();
            if (dbType === 'postgres') await client.end();
        }
    }
}

// --- Update a user's assigned event ID ---
async function updateUserEventId(config, userId, eventId) {
    const { dbType, host, port, user, password, dbName } = config;
    let client;
    try {
        if (dbType === 'mysql') {
            client = await mysql.createConnection({ host, port, user, password, database: dbName });
            await client.execute(
                'UPDATE users SET assigned_event_id = ?, needs_sync = 1 WHERE id = ?',
                [eventId, userId]
            );
        } else if (dbType === 'postgres') {
            client = new Client({ host, port, user, password, database: dbName });
            await client.connect();
            await client.query(
                'UPDATE users SET assigned_event_id = $1, needs_sync = TRUE WHERE id = $2',
                [eventId, userId]
            );
        }
        return { success: true };
    } catch (err) {
        console.error(`Failed to update event assignment for user ${userId}:`, err);
        return { success: false, message: err.message };
    } finally {
        if (client) await client.end();
    }
}

/* ==============================
  PARTICIPANT MANAGEMENT
============================== */
async function addParticipant(config, data) {
    const pool = getPool(config);
    const { event_id, regno, name, email, phone, role, company, designation, country, paidStatus, source, registered_at } = data;
    const result = await pool.query(
        `INSERT INTO participants (event_id, regno, name, email, phone, role, company, designation, country, paid_status, source, registered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [event_id, regno, name, email, phone, role, company, designation, country, paidStatus, source, registered_at]
    );
    await pool.end();
    return result.rows[0];
}

// *** FIXED getEventRoles function ***
async function getEventRoles(config, eventId) {
  if (!eventId) {
    console.error("getEventRoles called without an eventId.");
    return [];
  }

  const pool = getPool(config);
  
  try {
    const result = await pool.query('SELECT roles FROM events WHERE id = $1', [eventId]);
    
    if (!result.rows || result.rows.length === 0) {
      console.warn(`No event found with eventId: ${eventId} in server DB.`);
      return [];
    }

    const event = result.rows[0];
    if (!event.roles) {
      console.warn(`No roles found for eventId: ${eventId} in server DB.`);
      return [];
    }

    let rolesData = event.roles;
    
    // Parse JSON if it's stored as string
    if (typeof rolesData === 'string') {
      try {
        rolesData = JSON.parse(rolesData);
      } catch (err) {
        console.error('Failed to parse roles JSON from server DB:', err);
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
    console.error(`Error fetching server roles for eventId ${eventId}:`, error);
    return [];
  } finally {
    await pool.end();
  }
}

async function addBulkParticipants(config, eventId, participants) {
    const results = { inserted: 0, skipped: 0, errors: 0 };
    const eventRoles = await getEventRoles(config, eventId); // Fetch roles for validation

    for (const p of participants) {
        try {
            // Validate the role from the spreadsheet against the event's allowed roles
            const roleObj = eventRoles.find(r => r.name === p.role && r.enabled);
            if (!p.name || !roleObj) {
                results.errors++;
                continue;
            }
            const regno = await getNextRegNo(config, eventId, roleObj.code);
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
            await addParticipant(config, payload);
            results.inserted++;
        } catch (err) {
            if (err.code === '23505') { // PostgreSQL unique violation
                results.skipped++;
            } else {
                results.errors++;
            }
        }
    }
    return results;
}

async function updateParticipant(config, id, data) {
    const pool = getPool(config);
    const { name, email, phone, role, company, designation, country, paidStatus } = data;
    const result = await pool.query(
        `UPDATE participants SET name=$1, email=$2, phone=$3, role=$4, company=$5, designation=$6, country=$7, paid_status=$8
        WHERE id = $9 RETURNING *`,
        [name, email, phone, role, company, designation, country, paidStatus, id]
    );
    await pool.end();
    return result.rows[0];
}

async function getParticipants(config, eventId, filters = {}) {
    if (!eventId) return { success: false, participants: [], message: "Event ID missing" };

    const pool = getPool(config);
    try {
        let query = 'SELECT id, regno, name, email, phone, role FROM participants WHERE event_id = $1';
        const values = [eventId]; // eventId is already a valid number from IPC
        let idx = 2;

        // Add filters dynamically
        if (filters.regno) {
            query += ` AND regno ILIKE $${idx++}`;
            values.push(`%${filters.regno}%`);
        }
        if (filters.name) {
            query += ` AND name ILIKE $${idx++}`;
            values.push(`%${filters.name}%`);
        }
        if (filters.email) {
            query += ` AND email ILIKE $${idx++}`;
            values.push(`%${filters.email}%`);
        }
        if (filters.phone) {
            query += ` AND phone ILIKE $${idx++}`;
            values.push(`%${filters.phone}%`);
        }
        if (filters.role) {
            query += ` AND role = $${idx++}`;
            values.push(filters.role);
        }

        const res = await pool.query(query, values);
        return { success: true, participants: res.rows };
    } catch (err) {
        console.error("Error fetching participants (Postgres):", err);
        return { success: false, participants: [], message: err.message };
    } finally {
        await pool.end();
    }
}

async function getNextRegNo(config, eventId, roleCode) {
    const pool = getPool(config);
    const prefix = `${roleCode}-`;
    const result = await pool.query(
        `SELECT regno FROM participants
         WHERE event_id = $1 AND regno LIKE $2
         ORDER BY id DESC LIMIT 1`,
        [eventId, `${prefix}%`]
    );
    await pool.end();
    let nextNum = 1;
    if (result.rows.length > 0) {
        const lastNum = parseInt(result.rows[0].regno.split('-')[1], 10);
        nextNum = lastNum + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

async function getParticipantByRegno(config, eventId, regno) {
    const pool = getPool(config);
    const result = await pool.query(
        `SELECT * FROM participants WHERE event_id = $1 AND regno = $2`,
        [eventId, regno]
    );
    await pool.end();
    return result.rows[0];
}

async function deleteParticipant(config, id) {
    const pool = getPool(config);
    const result = await pool.query(`DELETE FROM participants WHERE id = $1`, [id]);
    await pool.end();
    return { changes: result.rowCount };
}

async function getParticipantsByIds(config, eventId, ids) {
    if (!ids || ids.length === 0) return [];
    const pool = getPool(config);
    const result = await pool.query(
        `SELECT * FROM participants WHERE event_id = $1 AND id = ANY($2::int[])`,
        [eventId, ids]
    );
    await pool.end();
    return result.rows;
}

module.exports = { 
    createServerDatabase, 
    authenticateServerUser, 
    clearAndSeedDataFromServer,
    getDashboardStats, 
    getSessions, 
    isServerDatabaseSeeded, 
    updateUserEventId,
    getUsers,
    addUser,
    updateUser,
    deleteUser,
    recordUserLogin,
    addParticipant,
    updateParticipant,
    getParticipants,
    getParticipantByRegno,
    deleteParticipant,
    getNextRegNo,
    getParticipantsByIds,
    addBulkParticipants,
    getEventRoles, // *** ADDED TO EXPORTS ***
};