// app.js — wires up the UI to db.js (IndexedDB). No server involved.

async function refresh() {
  const [rides, stats, reminder] = await Promise.all([getAllRides(), getStats(), getReminderStatus()]);
  renderStats(stats);
  renderBanner(reminder);
  renderRides(rides);
  renderBests(stats.bestBySkill);
  document.getElementById("reminder_days").value = reminder.reminder_days;
}

function renderStats(stats) {
  document.getElementById("stat-total").innerHTML = `${stats.total_distance}<small>km</small>`;
  document.getElementById("stat-week").innerHTML = `${stats.weekly_distance}<small>km</small>`;
  document.getElementById("stat-month").innerHTML = `${stats.monthly_distance}<small>km</small>`;
  document.getElementById("stat-rides").textContent = stats.total_rides;
  document.getElementById("stat-fastest").innerHTML = stats.fastest_ride
    ? `${stats.fastest_ride.avg_speed_kmh}<small>km/h</small>`
    : "–";
}

function renderBanner(reminder) {
  const el = document.getElementById("banner");
  if (reminder.due) {
    el.textContent = `⏰ ${reminder.days_since_last_ride} days since your last ride — time to get back out there.`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function renderRides(rides) {
  const list = document.getElementById("ride-list");
  if (rides.length === 0) {
    list.innerHTML = `<li class="empty">No rides logged yet.</li>`;
    return;
  }
  list.innerHTML = rides
    .map(
      (r) => `
      <li>
        <div class="ride-top"><span>${r.distance_km} km</span><span>${r.avg_speed_kmh} km/h</span></div>
        <div class="ride-meta">${r.date} · ${r.duration_min} min${r.notes ? " · " + escapeHtml(r.notes) : ""}</div>
        <span class="tag-chip">${escapeHtml(r.skill_tag || "general")}</span>
      </li>`
    )
    .join("");
}

function renderBests(bestBySkill) {
  const card = document.getElementById("bests-card");
  const list = document.getElementById("bests-list");
  const tags = Object.keys(bestBySkill);
  if (tags.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  list.innerHTML = tags
    .map((tag) => {
      const r = bestBySkill[tag];
      return `<li><strong>${escapeHtml(tag)}:</strong> ${r.avg_speed_kmh} km/h avg (${r.distance_km} km on ${r.date})</li>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("ride-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const distance_km = parseFloat(document.getElementById("distance_km").value);
  const duration_min = parseFloat(document.getElementById("duration_min").value);
  const skill_tag = document.getElementById("skill_tag").value;
  const notes = document.getElementById("notes").value;

  try {
    await addRide({ distance_km, duration_min, skill_tag, notes });
    e.target.reset();
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("reminder-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const days = parseInt(document.getElementById("reminder_days").value, 10);
  await setReminderDays(days);
  await refresh();
});

// Register the service worker so the app works fully offline once installed.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      document.getElementById("offline-pill").textContent = "offline unavailable";
    });
  });
}

refresh();