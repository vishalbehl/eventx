-- =================================================================
-- COMPLETE DATABASE RECREATION SCRIPT
-- This script will DROP all existing tables and recreate them.
-- ALL DATA WILL BE LOST.
-- =================================================================

-- Step 0: Drop existing tables in reverse order of dependency to avoid foreign key errors.
-- The 'CASCADE' option automatically removes dependent objects like triggers and constraints.
DROP TABLE IF EXISTS check_ins CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS print_templates CASCADE;
DROP TABLE IF EXISTS events CASCADE;


-- Step 1: Create the reusable function to automatically update the 'updated_at' column.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';


-- Step 2: Create the 'events' table (the primary "parent" table).
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    organiser_name TEXT,
    organiser_email TEXT,
    organiser_phone TEXT,
    badge_template_id INTEGER, -- Foreign key will be added later
    certificate_template_id INTEGER, -- Foreign key will be added later
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    needs_sync BOOLEAN DEFAULT FALSE
);
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_events_needs_sync ON events (needs_sync);


-- Step 3: Create the 'print_templates' table.
CREATE TABLE print_templates (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    template_name TEXT NOT NULL,
    template_data JSONB, -- JSONB is more efficient for querying than JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    needs_sync BOOLEAN DEFAULT FALSE
);
CREATE TRIGGER update_print_templates_updated_at BEFORE UPDATE ON print_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_print_templates_needs_sync ON print_templates (needs_sync);

-- Now, add the foreign key constraints from 'events' to 'print_templates'
ALTER TABLE events ADD CONSTRAINT fk_badge_template FOREIGN KEY (badge_template_id) REFERENCES print_templates(id) ON DELETE SET NULL;
ALTER TABLE events ADD CONSTRAINT fk_certificate_template FOREIGN KEY (certificate_template_id) REFERENCES print_templates(id) ON DELETE SET NULL;


-- Step 4: Create the 'users' table.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    assigned_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL, -- SET NULL so deleting an event doesn't delete the user
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    needs_sync BOOLEAN DEFAULT FALSE
);
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_users_needs_sync ON users (needs_sync);


-- Step 5: Create the 'participants' table.
CREATE TABLE participants (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    regno TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    company TEXT,
    designation TEXT,
    country TEXT,
    paid_status TEXT,
    source TEXT, -- 'online' or 'offline'
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    needs_sync BOOLEAN DEFAULT FALSE,
    -- Ensure a participant's registration number, email, and phone are unique within a single event
    UNIQUE (event_id, regno),
    UNIQUE (event_id, email),
    UNIQUE (event_id, phone)
);
CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_participants_needs_sync ON participants (needs_sync);


-- Step 6: Create the 'sessions' table.
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    name TEXT NOT NULL,
    max_checkins INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    needs_sync BOOLEAN DEFAULT FALSE
);
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_sessions_needs_sync ON sessions (needs_sync);


-- Step 7: Create the 'check_ins' table (the final "child" table).
CREATE TABLE check_ins (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    check_in_time TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    needs_sync BOOLEAN DEFAULT FALSE
);
CREATE TRIGGER update_check_ins_updated_at BEFORE UPDATE ON check_ins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_check_ins_needs_sync ON check_ins (needs_sync);