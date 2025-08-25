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
          allowed_ip VARCHAR(45),      
          allowed_mac VARCHAR(17),     
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
          allowed_ip VARCHAR(45),     
          allowed_mac VARCHAR(17),     
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
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(event_id, email),
          UNIQUE(event_id, phone)

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

async function updateKioskHeartbeat(config, hostname, ipAddress) {
    const pool = getPool(config);
    // This query performs an "upsert".
    // It tries to INSERT a new row. If that fails because the hostname
    // already exists (ON CONFLICT), it will UPDATE the existing row instead.
    const query = `
        INSERT INTO active_kiosks (hostname, ip_address, last_seen)
        VALUES ($1, $2, NOW())
        ON CONFLICT (hostname)
        DO UPDATE SET
            ip_address = EXCLUDED.ip_address,
            last_seen = NOW();
    `;
    try {
        await pool.query(query, [hostname, ipAddress]);
    } finally {
        await pool.end();
    }
}

// --- User Management ---
async function getUsers(config) {
  const pool = getPool(config);
  const res = await pool.query('SELECT id, username, role, assigned_event_id, assigned_kiosk_name, allowed_ip, allowed_mac FROM users ORDER BY id');
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
async function authenticateServerUser(config, username, password, clientMacAddresses) { 
  const { dbType, host, port, user, dbName } = config;
  let connection;
  try {
    connection = new Client({ host, port, user, password: config.password, database: dbName });
    await connection.connect();
    
    const res = await connection.query(
        'SELECT id, username, role, password_hash, allowed_ip, allowed_mac FROM users WHERE username = $1',
        [username]
    );
    if (res.rows.length === 0) return { success: false, message: 'User not found' };

    const dbUser = res.rows[0];

    // ***** UPDATED SECURITY CHECK LOGIC *****
    // This new block prioritizes the MAC address over the IP address.

    if (dbUser.allowed_mac) {
        // 1. A MAC address is set, so we check it first.
        const normalizedAllowedMac = dbUser.allowed_mac.replace(/[:-]/g, '').toUpperCase();
        const normalizedClientMacs = clientMacAddresses.map(mac => mac.replace(/[:-]/g, '').toUpperCase());

        if (!normalizedClientMacs.includes(normalizedAllowedMac)) {
            return { success: false, message: 'Login not permitted. This device\'s MAC address is not authorized.' };
        }
        // If the MAC matches, we skip the IP check and proceed.

    } else if (dbUser.allowed_ip) {
        // 2. Only if NO MAC is set, we fall back to the IP address check.
        const ipRes = await connection.query('SELECT inet_client_addr() AS client_ip');
        const clientIp = ipRes.rows[0].client_ip;
        
        if (clientIp !== dbUser.allowed_ip) {
            return { 
                success: false, 
                message: `IP Mismatch. Your IP is ${clientIp}, but the allowed IP is ${dbUser.allowed_ip}.` 
            };
        }
    }
    
    // --- Password Check (runs if all device checks pass or are not required) ---
    const isValid = await bcrypt.compare(password, dbUser.password_hash);
    if (!isValid) return { success: false, message: 'Invalid credentials' };

    return { success: true, user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, assignedEventId: dbUser.assigned_event_id } };

  } catch (err) {
    console.error(`Server auth error:`, err);
    return { success: false, message: err.message };
  } finally {
    if (connection) {
        await connection.end();
    }
  }
}
// --- Clear and seed data from central server ---
async function clearAndSeedDataFromServer(config, data) {
    const { event, participants, sessions, templates } = data;
    let client;

    try {
        client = new Client({
            host: config.host, port: config.port, user: config.user,
            password: config.password, database: config.dbName
        });
        await client.connect();
        await client.query('BEGIN');

        // Clear existing data
        await client.query('DELETE FROM check_ins WHERE event_id = $1', [event.id]);
        await client.query('DELETE FROM participants WHERE event_id = $1', [event.id]);
        await client.query('DELETE FROM sessions WHERE event_id = $1', [event.id]);
        await client.query('DELETE FROM events WHERE id = $1', [event.id]);
        await client.query('DELETE FROM print_templates');

        // ******** THIS IS THE CORRECTED SECTION ********
        // Create a copy of the event object to modify
        const eventToInsert = { ...event };

        // Manually stringify JSON fields before insertion
        if (eventToInsert.roles && typeof eventToInsert.roles !== 'string') {
            eventToInsert.roles = JSON.stringify(eventToInsert.roles);
        }
        if (eventToInsert.print_settings && typeof eventToInsert.print_settings !== 'string') {
            eventToInsert.print_settings = JSON.stringify(eventToInsert.print_settings);
        }
        
        const eventKeys = Object.keys(eventToInsert).join(', ');
        const eventValues = Object.values(eventToInsert);
        const eventPlaceholders = eventValues.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO events (${eventKeys}) VALUES (${eventPlaceholders}) ON CONFLICT (id) DO NOTHING`, eventValues);


        // Insert sessions (no change needed here)
        if (sessions && sessions.length > 0) {
            for (const session of sessions) {
                const sKeys = Object.keys(session).join(', ');
                const sValues = Object.values(session);
                const sPlaceholders = sValues.map((_, i) => `$${i + 1}`).join(', ');
                await client.query(`INSERT INTO sessions (${sKeys}) VALUES (${sPlaceholders}) ON CONFLICT (id) DO NOTHING`, sValues);
            }
        }

        // Insert participants (no change needed here)
        if (participants && participants.length > 0) {
            for (const p of participants) {
                const pKeys = Object.keys(p).join(', ');
                const pValues = Object.values(p);
                const pPlaceholders = pValues.map((_, i) => `$${i + 1}`).join(', ');
                await client.query(`INSERT INTO participants (${pKeys}) VALUES (${pPlaceholders}) ON CONFLICT (id) DO NOTHING`, pValues);
            }
        }

        // Insert print templates, ensuring template_data is a string
        if (templates && templates.length > 0) {
            for (const template of templates) {
                const templateToInsert = { ...template };
                if (templateToInsert.template_data && typeof templateToInsert.template_data !== 'string') {
                    templateToInsert.template_data = JSON.stringify(templateToInsert.template_data);
                }
                const tKeys = Object.keys(templateToInsert).join(', ');
                const tValues = Object.values(templateToInsert);
                const tPlaceholders = tValues.map((_, i) => `$${i + 1}`).join(', ');
                await client.query(`INSERT INTO print_templates (${tKeys}) VALUES (${tPlaceholders}) ON CONFLICT (id) DO UPDATE SET template_name = EXCLUDED.template_name, template_data = EXCLUDED.template_data`, tValues);
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
  // Corrected query to use subqueries for accurate counts
  const statsQuery = `
    SELECT
      (SELECT COUNT(*) FROM participants WHERE event_id = $1) AS total_participants,
      (SELECT COUNT(DISTINCT participant_id) FROM check_ins WHERE event_id = $1) AS total_arrived,
      (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND source ILIKE 'online%') AS total_online,
      (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND source = 'offline') AS total_offline,
      (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND paid_status = 'Paid') AS total_paid,
      (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND paid_status = 'Unpaid') AS total_unpaid
  `;

  const rolesQuery = `SELECT role, COUNT(*) AS count FROM participants WHERE event_id = $1 AND role IS NOT NULL GROUP BY role`;
  const daywiseQuery = `SELECT DATE(registered_at) AS date, COUNT(*) AS count FROM participants WHERE event_id = $1 GROUP BY DATE(registered_at) ORDER BY date ASC`;
  const recentQuery = `SELECT * FROM participants WHERE event_id = $1 ORDER BY id DESC LIMIT 5`;

  const client = new Client({
    host: config.host, port: config.port, user: config.user,
    password: config.password, database: config.dbName,
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
    
    // console.log(`Found ${enabledRoles.length} enabled roles for event ${eventId}:`, enabledRoles);
    return enabledRoles;

  } catch (error) {
    console.error(`Error fetching server roles for eventId ${eventId}:`, error);
    return [];
  } finally {
    await pool.end();
  }
}

async function addBulkParticipants(config, eventId, participants) {
    const pool = getPool(config);
    const results = { inserted: 0, skipped: 0, errors: 0 };
    const eventRoles = await getEventRoles(config, eventId);

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
                const checkQuery = `SELECT id FROM participants WHERE event_id = $1 AND (email = $2 OR phone = $3)`;
                const existing = await pool.query(checkQuery, [eventId, p.email || null, p.phone || null]);
                if (existing.rows.length > 0) {
                    results.skipped++;
                    continue; // Skip this participant
                }
            }
            
            // 3. If no duplicate, proceed with insertion
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
            // Fallback for database-level unique constraint errors
            if (err.code === '23505') { // PostgreSQL unique violation
                results.skipped++;
            } else {
                results.errors++;
            }
        }
    }
    // Release the pool connection if it was created
    if (pool) await pool.end();
    return results;
}

async function getParticipants(config, eventId, filters = {}) {
    const pool = getPool(config);
    try {
        let queryStr = `SELECT * FROM participants WHERE event_id = $1`;
        const params = [eventId];
        let paramIndex = 2;
        for (const key in filters) {
            if (filters[key]) {
                queryStr += ` AND ${key} ILIKE $${paramIndex++}`;
                params.push(`%${filters[key]}%`);
            }
        }
        queryStr += ` ORDER BY id DESC`;
        const result = await pool.query(queryStr, params);
        // Return the data in the format the frontend expects
        return { success: true, participants: result.rows };
    } catch (error) {
        console.error("Error fetching participants from server DB:", error);
        return { success: false, message: error.message, participants: [] };
    } finally {
        await pool.end();
    }
}

async function updateParticipant(config, id, data) {
    const pool = getPool(config);
    try {
        await pool.query('BEGIN');

        // 1. Get the participant's current state from the database
        const currentUserResult = await pool.query('SELECT role, regno FROM participants WHERE id = $1', [id]);
        const currentUser = currentUserResult.rows[0];

        if (!currentUser) {
            throw new Error(`Participant with ID ${id} not found.`);
        }

        // 2. Start with the existing registration number as the default
        let finalRegno = currentUser.regno;

        // 3. If the role has changed, generate a new registration number
        if (currentUser.role !== data.role) {
            const eventRoles = await getEventRoles(config, data.event_id);
            const roleObj = eventRoles.find(r => r.name === data.role);
            if (roleObj) {
                // Overwrite the default with the new number
                finalRegno = await getNextRegNo(config, data.event_id, roleObj.code);
            }
        }

        // 4. Perform the update using the finalRegno
        const { name, email, phone, role, company, designation, country, paidStatus } = data;
        const result = await pool.query(
            `UPDATE participants 
             SET name=$1, email=$2, phone=$3, role=$4, company=$5, designation=$6, country=$7, paid_status=$8, regno=$9
             WHERE id = $10 RETURNING *`,
            // Use the correctly determined 'finalRegno' here
            [name, email, phone, role, company, designation, country, paidStatus, finalRegno, id]
        );

        await pool.query('COMMIT');
        // 5. Return the fully updated participant record
        return result.rows[0];

    } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
    } finally {
        await pool.end();
    }
}

async function getNextRegNo(config, eventId, roleCode) {
    const pool = getPool(config);
    const prefix = `${roleCode}-`;

    // This advanced SQL query finds the first missing integer in the sequence.
    const query = `
      WITH numbers AS (
        -- Select all existing numbers for the given role, converting the text part to an integer
        SELECT CAST(SUBSTRING(regno FROM POSITION('-' IN regno) + 1) AS INTEGER) AS num
        FROM participants
        WHERE event_id = $1 AND regno LIKE $2
      )
      -- Find the smallest number 'i' from a generated series (from 1 to max+1)
      -- that is NOT IN our set of existing numbers.
      SELECT MIN(s.i) AS next_num
      FROM generate_series(1, (SELECT COALESCE(MAX(num), 0) + 1 FROM numbers)) AS s(i)
      WHERE s.i NOT IN (SELECT num FROM numbers);
    `;

    try {
        const result = await pool.query(query, [eventId, `${prefix}%`]);
        const nextNum = result.rows[0]?.next_num || 1;
        return `${prefix}${String(nextNum).padStart(4, '0')}`;
    } finally {
        await pool.end();
    }
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

// ******** ADDED FUNCTIONS FOR DYNAMIC PRINTING ********

async function getEventById(config, eventId) {
    if (!eventId) return null;
    const pool = getPool(config);
    try {
        const res = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
        // Postgres returns JSONB columns as objects, no parsing needed.
        return res.rows[0] || null;
    } catch (error) {
        console.error("Error fetching event by ID from server DB:", error);
        return null;
    } finally {
        await pool.end();
    }
}

async function getTemplateById(config, templateId) {
    if (!templateId) return null;
    const pool = getPool(config);
    try {
        const res = await pool.query('SELECT * FROM print_templates WHERE id = $1', [templateId]);
        // Postgres returns JSONB columns as objects, no parsing needed.
        return res.rows[0] || null;
    } catch (error) {
        console.error("Error fetching template by ID from server DB:", error);
        return null;
    } finally {
        await pool.end();
    }
}

/* ==============================
  CHECK-IN MANAGEMENT
============================== */
async function addCheckIn(config, eventId, participantId, sessionId) {
    const pool = getPool(config);
    try {
        await pool.query('BEGIN');

        // 1. Get the session's check-in limit (defaults to 1 if not set)
        const sessionRes = await pool.query('SELECT max_checkins FROM sessions WHERE id = $1', [sessionId]);
        const maxCheckins = sessionRes.rows[0]?.max_checkins || 1;

        // 2. Count existing check-ins for this participant and session
        const countRes = await pool.query(
            'SELECT COUNT(*) FROM check_ins WHERE participant_id = $1 AND session_id = $2',
            [participantId, sessionId]
        );
        const existingCheckinCount = parseInt(countRes.rows[0].count, 10);

        // 3. If the limit is reached, return the specific status
        if (existingCheckinCount >= maxCheckins) {
            await pool.query('COMMIT'); // Commit transaction before returning
            return { success: true, limit_reached: true };
        }

        // 4. Otherwise, insert the new check-in record
        await pool.query(
            'INSERT INTO check_ins (event_id, participant_id, session_id, check_in_time) VALUES ($1, $2, $3, NOW())',
            [eventId, participantId, sessionId]
        );

        await pool.query('COMMIT');
        return { success: true };

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Error in serverDb.addCheckIn:", error);
        return { success: false, message: error.message };
    } finally {
        await pool.end();
    }
}

async function getCheckInsBySession(config, sessionId) {
    if (!sessionId) {
        return [];
    }
    const pool = getPool(config);
    try {
        const result = await pool.query(
            `SELECT p.id, p.regno, p.name, c.check_in_time
             FROM check_ins c
             JOIN participants p ON c.participant_id = p.id
             WHERE c.session_id = $1
             ORDER BY c.check_in_time DESC`,
            [sessionId]
        );
        return result.rows;
    } catch (error) {
        console.error("Error in serverDb.getCheckInsBySession:", error);
        return []; // Return empty array on error
    } finally {
        await pool.end();
    }
}

async function getAllCheckInsForEvent(config, eventId) {
    if (!eventId) return [];
    const pool = getPool(config);
    const query = `
      SELECT
        c.check_in_time,
        p.regno,
        p.name AS participant_name,
        p.role AS participant_role,
        s.id AS session_id,
        s.name AS session_name,
        s.session_date
      FROM check_ins c
      JOIN participants p ON c.participant_id = p.id
      JOIN sessions s ON c.session_id = s.id
      WHERE c.event_id = $1
      ORDER BY s.id, p.role, p.regno ASC
    `;
    try {
        const result = await pool.query(query, [eventId]);
        return result.rows;
    } finally {
        await pool.end();
    }
}


module.exports = { 
    createServerDatabase,
    query, 
    updateKioskHeartbeat,
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
    getEventRoles,
    getEventById,
    getTemplateById,
    addCheckIn,
    getCheckInsBySession,
    getAllCheckInsForEvent
};