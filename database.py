import sqlite3
from datetime import datetime

DB_NAME = "rides.db"


def get_connection():
    """Opens a connection to the database file (creates it if it doesn't exist)."""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # lets us access columns by name, e.g. row["distance_km"]
    return conn


def create_table():
    """Creates the rides table and settings table if they don't already exist."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            distance_km REAL NOT NULL,
            duration_min REAL NOT NULL,
            avg_speed_kmh REAL,
            skill_tag TEXT,
            notes TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    # Default reminder interval: every 3 days
    cursor.execute("""
        INSERT OR IGNORE INTO settings (key, value) VALUES ('reminder_days', '3')
    """)
    conn.commit()
    conn.close()


def add_ride(distance_km, duration_min, skill_tag="", notes=""):
    """Adds a new ride to the database. Speed is calculated automatically."""
    if duration_min <= 0:
        raise ValueError("duration_min must be greater than 0")

    avg_speed_kmh = round(distance_km / (duration_min / 60), 2)
    date = datetime.now().strftime("%Y-%m-%d %H:%M")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO rides (date, distance_km, duration_min, avg_speed_kmh, skill_tag, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (date, distance_km, duration_min, avg_speed_kmh, skill_tag, notes))
    conn.commit()
    conn.close()


def get_all_rides():
    """Returns every ride stored, most recent first, as a list of dict-like Row objects."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rides ORDER BY id DESC")
    rides = cursor.fetchall()
    conn.close()
    return rides


def get_stats():
    """Returns summary stats: totals, this week/month distance, longest ride, personal bests."""
    conn = get_connection()
    cursor = conn.cursor()

    # Total rides and total distance
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(distance_km), 0) FROM rides")
    total_rides, total_distance = cursor.fetchone()

    # Distance in the last 7 days
    cursor.execute("""
        SELECT COALESCE(SUM(distance_km), 0) FROM rides
        WHERE date >= datetime('now', '-7 days')
    """)
    weekly_distance = cursor.fetchone()[0]

    # Distance in the last 30 days
    cursor.execute("""
        SELECT COALESCE(SUM(distance_km), 0) FROM rides
        WHERE date >= datetime('now', '-30 days')
    """)
    monthly_distance = cursor.fetchone()[0]

    # Longest ride (by distance)
    cursor.execute("SELECT * FROM rides ORDER BY distance_km DESC LIMIT 1")
    longest_ride = cursor.fetchone()

    # Personal best: fastest average speed
    cursor.execute("SELECT * FROM rides ORDER BY avg_speed_kmh DESC LIMIT 1")
    fastest_ride = cursor.fetchone()

    conn.close()

    return {
        "total_rides": total_rides,
        "total_distance": round(total_distance, 2),
        "weekly_distance": round(weekly_distance, 2),
        "monthly_distance": round(monthly_distance, 2),
        "longest_ride": longest_ride,
        "fastest_ride": fastest_ride,
    }


def get_reminder_days():
    """Returns the current reminder interval in days."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'reminder_days'")
    row = cursor.fetchone()
    conn.close()
    return int(row["value"]) if row else 3


def set_reminder_days(days):
    """Updates the reminder interval in days."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO settings (key, value) VALUES ('reminder_days', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, (str(days),))
    conn.commit()
    conn.close()


def get_reminder_status():
    """Checks if a ride reminder is due, based on days since the last ride."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT date FROM rides ORDER BY date DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    reminder_days = get_reminder_days()

    if not row:
        return {"due": False, "days_since_last_ride": None, "reminder_days": reminder_days}

    last_ride_date = datetime.strptime(row["date"], "%Y-%m-%d %H:%M")
    days_since = (datetime.now() - last_ride_date).days

    return {
        "due": days_since >= reminder_days,
        "days_since_last_ride": days_since,
        "reminder_days": reminder_days,
    }