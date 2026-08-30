/**
 * Pulse Transit Engine - Interactive Timetable Controller
 */

let activeBay = "all";
let activeDestination = "all";
let activeTimeFilter = "all";
let searchTerm = "";
let sortBy = "time-asc";
let favourites = JSON.parse(localStorage.getItem("pulse_fav_routes") || "[]");
let soundEnabled = localStorage.getItem("pulse_sound") === "true";

// Sound synthesizer using Web Audio API
function playDepartureChime() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.error("Audio error", e);
  }
}

// Levenshtein & normalizers
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function clean(txt) {
  return (txt || "").toLowerCase().replace(/[^\w\s\u0C80-\u0CFF]/gi, '').replace(/\s+/g, ' ').trim();
}

function fuzzyCheck(query, text) {
  if (!query || !text) return false;
  const q = clean(query);
  const t = clean(text);
  if (t.includes(q)) return true;
  return q.split(' ').every(qw => 
    t.split(' ').some(tw => tw.includes(qw) || (qw.length > 3 && levenshtein(qw, tw) <= (qw.length > 5 ? 2 : 1)))
  );
}

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function format12(t) {
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${p}`;
}

function getAllBuses() {
  const all = [];
  TIMETABLE_DATA.routes.forEach(route => {
    route.departures.forEach(dep => {
      all.push({
        id: `${route.id}-${dep.time}`,
        routeId: route.id,
        destination_en: route.destination_en,
        destination_kn: route.destination_kn,
        platform: route.platform,
        service: dep.type || route.bus_type,
        time: dep.time.replace(".", ":")
      });
    });
  });
  return all;
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initSoundButton();
  populateDestDropdown();
  bindEvents();
  updateLiveFeed();
  setInterval(updateLiveFeed, 1000);
});

function initSoundButton() {
  const btn = document.getElementById("soundToggle");
  btn.textContent = soundEnabled ? "🔔" : "🔕";
  btn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem("pulse_sound", soundEnabled);
    btn.textContent = soundEnabled ? "🔔" : "🔕";
    if (soundEnabled) playDepartureChime();
  });
}

function populateDestDropdown() {
  const sel = document.getElementById("destinationSelect");
  sel.innerHTML = `<option value="all">📍 All Destinations (ಎಲ್ಲಾ ಊರುಗಳು)</option>`;
  TIMETABLE_DATA.routes.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.destination_en} (${r.destination_kn}) — Bay ${r.platform}`;
    sel.appendChild(opt);
  });
}

function bindEvents() {
  // Search
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  
  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    clearBtn.classList.toggle("hidden", !searchTerm);
    applyFilters();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchTerm = "";
    clearBtn.classList.add("hidden");
    applyFilters();
  });

  // Bay selector dock
  document.getElementById("platformDock").addEventListener("click", (e) => {
    const btn = e.target.closest(".bay-btn");
    if (btn) {
      document.querySelectorAll(".bay-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeBay = btn.dataset.bay;
      applyFilters();
    }
  });

  // Destination select
  document.getElementById("destinationSelect").addEventListener("change", (e) => {
    activeDestination = e.target.value;
    applyFilters();
  });

  // Time chips
  document.querySelectorAll(".time-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".time-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeTimeFilter = chip.dataset.time;
      applyFilters();
    });
  });

  // Sort
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    sortBy = e.target.value;
    applyFilters();
  });

  // Theme
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Modal Close
  document.getElementById("closeModalBtn").addEventListener("click", () => {
    document.getElementById("routeModal").close();
  });

  // Reset Empty State
  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    activeBay = "all";
    activeDestination = "all";
    activeTimeFilter = "all";
    searchTerm = "";
    searchInput.value = "";
    document.querySelectorAll(".bay-btn").forEach(b => b.classList.toggle("active", b.dataset.bay === "all"));
    document.querySelectorAll(".time-chip").forEach(c => c.classList.toggle("active", c.dataset.time === "all"));
    document.getElementById("destinationSelect").value = "all";
    applyFilters();
  });
}

// Core Filter Engine
function applyFilters() {
  const all = getAllBuses();
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  let filtered = all.filter(item => {
    if (activeBay !== "all" && !item.platform.includes(activeBay)) return false;
    if (activeDestination !== "all" && item.routeId !== activeDestination) return false;

    const mins = timeToMin(item.time);
    if (activeTimeFilter === "morning" && (mins < 240 || mins >= 720)) return false;
    if (activeTimeFilter === "afternoon" && (mins < 720 || mins >= 1020)) return false;
    if (activeTimeFilter === "evening" && mins < 1020) return false;
    if (activeTimeFilter === "fav" && !favourites.includes(item.routeId)) return false;

    if (searchTerm) {
      const matchDest = fuzzyCheck(searchTerm, item.destination_en) || fuzzyCheck(searchTerm, item.destination_kn);
      const matchSvc = fuzzyCheck(searchTerm, item.service);
      const matchTime = item.time.replace(":", "").includes(searchTerm.replace(/[:.\s]/g, ""));
      const matchBay = item.platform.includes(searchTerm);
      if (!matchDest && !matchSvc && !matchTime && !matchBay) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === "time-asc") return timeToMin(a.time) - timeToMin(b.time);
    if (sortBy === "time-desc") return timeToMin(b.time) - timeToMin(a.time);
    if (sortBy === "dest-asc") return a.destination_en.localeCompare(b.destination_en);
    return 0;
  });

  renderCards(filtered, nowMins);
}

function renderCards(items, nowMins) {
  const grid = document.getElementById("cardsStream");
  const empty = document.getElementById("noResults");
  const summary = document.getElementById("feedSummary");

  grid.innerHTML = "";
  summary.textContent = `Departures (${items.length})`;

  if (items.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  items.forEach(bus => {
    const mins = timeToMin(bus.time);
    const isPast = mins < nowMins;
    const diff = mins - nowMins;
    const isFav = favourites.includes(bus.routeId);

    let diffTag = "";
    if (!isPast) {
      diffTag = diff <= 60 ? `in ${diff}m` : `in ${Math.floor(diff / 60)}h ${diff % 60}m`;
    }

    const card = document.createElement("div");
    card.className = `transit-card ${isPast ? 'past' : ''}`;
    card.innerHTML = `
      <div class="card-upper">
        <div>
          <div class="time-badge">${format12(bus.time)}</div>
          ${diffTag ? `<span class="time-diff">● ${diffTag}</span>` : ''}
        </div>
        <button class="star-action ${isFav ? 'starred' : ''}" data-route="${bus.routeId}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>

      <div>
        <div class="dest-en">${bus.destination_en}</div>
        <div class="dest-kn">${bus.destination_kn}</div>
      </div>

      <div class="card-lower">
        <span class="bay-tag">Bay ${bus.platform}</span>
        <span class="service-tag">${bus.service}</span>
      </div>
    `;

    // Star Click
    card.querySelector(".star-action").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavourite(bus.routeId);
    });

    // Card Details Click
    card.addEventListener("click", () => openDrawer(bus));

    grid.appendChild(card);
  });
}

function updateLiveFeed() {
  const now = new Date();
  document.getElementById("liveClock").textContent = now.toTimeString().split(" ")[0];

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const all = getAllBuses().sort((a, b) => timeToMin(a.time) - timeToMin(b.time));

  let next = all.find(b => timeToMin(b.time) >= nowMins);
  let isTomorrow = false;

  if (!next && all.length > 0) {
    next = all[0];
    isTomorrow = true;
  }

  if (next) {
    document.getElementById("radarDest").textContent = next.destination_en;
    document.getElementById("radarDestKn").textContent = next.destination_kn;
    document.getElementById("radarTime").textContent = format12(next.time);
    document.getElementById("radarBay").textContent = next.platform;
    document.getElementById("radarType").textContent = next.service.toUpperCase();

    let diff = timeToMin(next.time) - nowMins;
    if (isTomorrow) diff += 1440;

    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    const diffStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} mins`;

    document.getElementById("radarCountdown").textContent = isTomorrow ? `Tomorrow in ${diffStr}` : `Boarding in ${diffStr}`;
  }
}

function openDrawer(bus) {
  document.getElementById("modalBadge").textContent = bus.service.toUpperCase();
  document.getElementById("modalBayNum").textContent = bus.platform;
  document.getElementById("modalDestCity").textContent = bus.destination_en;
  document.getElementById("modalDestKn").textContent = bus.destination_kn;
  document.getElementById("modalTime").textContent = format12(bus.time);
  document.getElementById("modalServiceClass").textContent = bus.service;

  // Timeline Generator
  const timeline = document.getElementById("transitTimeline");
  timeline.innerHTML = `
    <div class="timeline-node">
      <h4>Subrahmanya Bus Stand (Bay ${bus.platform})</h4>
      <p>Origin Terminal • Scheduled departure ${format12(bus.time)}</p>
    </div>
    <div class="timeline-node">
      <h4>State Highway Transit Route</h4>
      <p>Express corridor transit via KSRTC schedule</p>
    </div>
    <div class="timeline-node end">
      <h4>${bus.destination_en} (${bus.destination_kn})</h4>
      <p>Scheduled arrival terminal</p>
    </div>
  `;

  // Share action
  document.getElementById("shareBusBtn").onclick = () => {
    const text = `🚌 Subrahmanya ➔ ${bus.destination_en} at ${format12(bus.time)} (Bay ${bus.platform}, ${bus.service}). Timetable via KSRTC Pulse.`;
    if (navigator.share) {
      navigator.share({ title: "Bus Schedule", text });
    } else {
      navigator.clipboard.writeText(text);
      alert("Schedule details copied to clipboard!");
    }
  };

  document.getElementById("routeModal").showModal();
}

function toggleFavourite(routeId) {
  if (favourites.includes(routeId)) {
    favourites = favourites.filter(id => id !== routeId);
  } else {
    favourites.push(routeId);
  }
  localStorage.setItem("pulse_fav_routes", JSON.stringify(favourites));
  applyFilters();
}

function initTheme() {
  const th = localStorage.getItem("pulse_theme") || "dark";
  document.body.setAttribute("data-theme", th);
  document.getElementById("themeToggle").textContent = th === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const cur = document.body.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("pulse_theme", next);
  document.getElementById("themeToggle").textContent = next === "dark" ? "☀️" : "🌙";
}
