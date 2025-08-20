import sqlite3

# Connect to your SQLite database
conn = sqlite3.connect(r'C:\Users\visha\AppData\Roaming\event_registration_app\kiosk_data.sqlite')
cursor = conn.cursor()

# Step 1: Get all table names
cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table';")
tables = cursor.fetchall()

# Step 2: For each table, get column names
for table in tables:
    table_name = table[0]
    print(f"Table: {table_name}")
    
    cursor.execute(f"PRAGMA table_info({table_name});")
    columns = cursor.fetchall()
    
    for column in columns:
        print(f"  Column: {column[1]} - Type: {column[2]}")
    
    print("\n")

# Close connection
conn.close()
