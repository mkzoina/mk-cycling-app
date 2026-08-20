// db.js — IndexedDB storage layer for the Cycling Tracker.
// Mirrors what database.py did with SQLite, but runs entirely offline in the browser.

const DB_NAME = "cycling_tracker";
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("rides")) {
        const store = db.createObjectStore("rides", { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date");
        store.createIndex("skill_tag", "skill_tag");
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

// --- Rides ---

async function addRide({ distance_km, duration_min, skill_tag = "general", notes = "" }) {
  if (!(duration_min > 0)) {
    throw new Error("duration_min must be greater than 0");
  }

  const avg_speed_kmh = Math.round((distance_km / (duration_min / 60)) * 100) / 100;
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("rides", "readwrite");
    tx.objectStore("rides").add({ date, distance_km, duration_min, avg_speed_kmh, skill_tag, notes });
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

async function getAllRides() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("rides", "readonly");
    const request = tx.objectStore("rides").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.id - a.id));
    request.onerror = (event) => reject(event.target.error);
  });
}

// --- Stats ---

async function getStats() {
  const rides = await getAllRides();

  const total_rides = rides.length;
  const total_distance = round2(rides.reduce((sum, r) => sum + r.distance_km, 0));

  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const weekly_distance = round2(
    rides.filter((r) => new Date(r.date) >= weekAgo).reduce((sum, r) => sum + r.distance_km, 0)
  );
  const monthly_distance = round2(
    rides.filter((r) => new Date(r.date) >= monthAgo).reduce((sum, r) => sum + r.distance_km, 0)
  );

  const longest_ride = rides.reduce((best, r) => (!best || r.distance_km > best.distance_km ? r : best), null);
  const fastest_ride = rides.reduce((best, r) => (!best || r.avg_speed_kmh > best.avg_speed_kmh ? r : best), null);

  // Personal bests scoped per skill tag
  const bestBySkill = {};
  for (const r of rides) {
    const tag = r.skill_tag || "general";
    if (!bestBySkill[tag] || r.avg_speed_kmh > bestBySkill[tag].avg_speed_kmh) {
      bestBySkill[tag] = r;
    }
  }

  return {
    total_rides,
    total_distance,
    weekly_distance,
    monthly_distance,
    longest_ride,
    fastest_ride,
    bestBySkill,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// --- Settings / Reminders ---

async function getReminderDays() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readonly");
    const request = tx.objectStore("settings").get("reminder_days");
    request.onsuccess = () => resolve(request.result ? Number(request.result.value) : 3);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function setReminderDays(days) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key: "reminder_days", value: String(days) });
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

async function getReminderStatus() {
  const rides = await getAllRides();
  const reminder_days = await getReminderDays();

  if (rides.length === 0) {
    return { due: false, days_since_last_ride: null, reminder_days };
  }

  const lastRideDate = new Date(rides[0].date);
  const days_since_last_ride = Math.floor((new Date() - lastRideDate) / (1000 * 60 * 60 * 24));

  return { due: days_since_last_ride >= reminder_days, days_since_last_ride, reminder_days };
}