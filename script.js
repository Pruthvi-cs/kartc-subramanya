// State variables
let activeDestination = "all";
let activeTimeFilter = "all";
let searchTerm = "";
let sortBy = "time-asc";
let favourites = JSON.parse(localStorage.getItem("favourite_routes") || "[]");

// -------------------------------------------------------------
// Fuzzy Search & Normalization Utilities
// -------------------------------------------------------------

// Calculate Levenshtein Distance between two strings
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Clean and normalize strings (removes excess spaces, symbols, lowercase)
function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s\u0C80-\u0CFF]/gi, '') // Keep alphanumeric, spaces, and Kannada unicode block
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize time formats (supports "7:30", "07.30", "7 30", "730", "0730")
function normalizeTime(timeStr) {
  return (timeStr || "").replace(/[:.\s]/g, "").trim();
}

// Check if query fuzzy matches target (handles partial substrings + typos)
function fuzzyMatch(query, target) {
  if (!query || !target) return false;

  const q = normalizeText(query);
  const t = normalizeText(target);

  // Exact or direct substring match
  if (t.includes(q)) return true;

  // Split query and target into words
  const qWords = q.split(' ');
  const tWords = t.split(' ');

  return qWords.every(qWord => {
    return tWords.some(tWord => {
      if (tWord.includes(qWord)) return true;
      
      // Allow 1 typo for words of length 4-5, 2 typos for words > 5
      const maxDistance = qWord.length > 5 ? 2 : (qWord.length >= 4 ? 1 : 0);
      if (maxDistance > 0) {
        return levenshteinDistance(qWord, tWord) <= maxDistance;
      }
      return false;
    });
  });
}

// -------------------------------------------------------------
// Core Application Logic
// -------------------------------------------------------------

// Flatten departures into unified items
function getAllDepartures() {
  const departures = [];
  TIMETABLE_DATA.routes.forEach(route => {
    route.departures.forEach(dep => {
      const formattedTime = dep.time.replace(".", ":");
      departures.push({
        routeId: route.id,
        destination_en: route.destination_en,
        destination_kn: route.destination_kn,
        platform: route.platform,
        serviceType: dep.type || route.bus_type,
        time: formattedTime
      });
    });
  });
  return departures;
}

// Convert "HH:MM" string to minutes from midnight
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// Format 24-hr time to 12-hr display
function formatTo12Hour(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderDestinationChips();
  setupEventListeners();
  updateLiveClockAndNextBus();
  setInterval(updateLiveClockAndNextBus, 1000);
  applyFiltersAndRender();
});

// Populate the destination dropdown
function renderDestinationDropdown() {
  const select = document.getElementById("destinationSelect");
  
  // Clear any existing options except the default 'All'
  select.innerHTML = `<option value="all">📍 All Destinations (ಎಲ್ಲಾ ಸ್ಥಳಗಳು)</option>`;
  
  TIMETABLE_DATA.routes.forEach(route => {
    const option = document.createElement("option");
    option.value = route.id;
    option.textContent = `${route.destination_en} (${route.destination_kn}) — Platform ${route.platform}`;
    select.appendChild(option);
  });
}

// Update setupEventListeners to watch the dropdown change
function setupEventListeners() {
  // Real-time fuzzy search
  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    applyFiltersAndRender();
  });

  // Time of day filters
  document.querySelectorAll("[data-time-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-time-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTimeFilter = btn.dataset.timeFilter;
      applyFiltersAndRender();
    });
  });

  // Destination Dropdown Listener
  document.getElementById("destinationSelect").addEventListener("change", (e) => {
    activeDestination = e.target.value;
    applyFiltersAndRender();
  });

  // Sort dropdown
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    sortBy = e.target.value;
    applyFiltersAndRender();
  });

  // Theme switch
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Modal close
  document.getElementById("closeModalBtn").addEventListener("click", () => {
    document.getElementById("routeModal").close();
  });
}

// In DOMContentLoaded, call renderDestinationDropdown instead:
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderDestinationDropdown();
  setupEventListeners();
  updateLiveClockAndNextBus();
  setInterval(updateLiveClockAndNextBus, 1000);
  applyFiltersAndRender();
});

function setupEventListeners() {
  // Real-time fuzzy search
  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    applyFiltersAndRender();
  });

  // Time of day filters
  document.querySelectorAll("[data-time-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-time-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTimeFilter = btn.dataset.timeFilter;
      applyFiltersAndRender();
    });
  });

  // Destination filter chips
  document.getElementById("destinationChips").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      document.querySelectorAll("#destinationChips .filter-chip").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      activeDestination = e.target.dataset.dest;
      applyFiltersAndRender();
    }
  });

  // Sort
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    sortBy = e.target.value;
    applyFiltersAndRender();
  });

  // Theme switch
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Modal close
  document.getElementById("closeModalBtn").addEventListener("click", () => {
    document.getElementById("routeModal").close();
  });
}

function applyFiltersAndRender() {
  const allDeps = getAllDepartures();
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let filtered = allDeps.filter(item => {
    // Destination filter
    if (activeDestination !== "all" && item.routeId !== activeDestination) return false;

    // Time filter
    const mins = timeToMinutes(item.time);
    if (activeTimeFilter === "morning" && (mins < 240 || mins >= 720)) return false;
    if (activeTimeFilter === "afternoon" && (mins < 720 || mins >= 1020)) return false;
    if (activeTimeFilter === "evening" && mins < 1020) return false;
    if (activeTimeFilter === "fav" && !favourites.includes(item.routeId)) return false;

    // Smart Search Query Evaluation
    if (searchTerm) {
      const matchDestEn = fuzzyMatch(searchTerm, item.destination_en);
      const matchDestKn = fuzzyMatch(searchTerm, item.destination_kn);
      const matchService = fuzzyMatch(searchTerm, item.serviceType);
      
      // Flexible time search (supports "08:15", "8.15", "815", "8 15")
      const rawQueryTime = normalizeTime(searchTerm);
      const rawItemTime = normalizeTime(item.time);
      const matchTime = rawItemTime.includes(rawQueryTime) || item.time.includes(searchTerm);
      
      // Platform matching (e.g. "Platform 8", "pf 8", "8")
      const matchPlatform = normalizeText(item.platform).includes(normalizeText(searchTerm));

      if (!matchDestEn && !matchDestKn && !matchService && !matchTime && !matchPlatform) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sortBy === "time-asc") return timeToMinutes(a.time) - timeToMinutes(b.time);
    if (sortBy === "time-desc") return timeToMinutes(b.time) - timeToMinutes(a.time);
    if (sortBy === "dest-asc") return a.destination_en.localeCompare(b.destination_en);
    return 0;
  });

  renderCards(filtered, currentMinutes);
}

function renderCards(items, currentMinutes) {
  const grid = document.getElementById("busCardsGrid");
  const countLabel = document.getElementById("resultsCount");
  const noResults = document.getElementById("noResults");

  grid.innerHTML = "";
  countLabel.textContent = `Showing ${items.length} departure${items.length === 1 ? '' : 's'}`;

  if (items.length === 0) {
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  items.forEach(bus => {
    const isPast = timeToMinutes(bus.time) < currentMinutes;
    const isFav = favourites.includes(bus.routeId);

    const card = document.createElement("div");
    card.className = `bus-card ${isPast ? 'past-departure' : ''}`;
    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="card-time">${formatTo12Hour(bus.time)}</span>
          <button class="star-btn ${isFav ? 'starred' : ''}" data-route-id="${bus.routeId}" aria-label="Favourite Route">
            ${isFav ? '★' : '☆'}
          </button>
        </div>
        <div class="card-dest">${bus.destination_en}</div>
        <div class="card-dest-kn">${bus.destination_kn}</div>
      </div>
      <div>
        <div class="card-details-row">
          <span>Platform: <strong>${bus.platform}</strong></span>
          <span>${bus.serviceType}</span>
        </div>
        <button class="details-btn" onclick="openRouteDetails('${bus.routeId}', '${bus.time}')">View Route Details</button>
      </div>
    `;

    card.querySelector(".star-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavourite(bus.routeId);
    });

    grid.appendChild(card);
  });
}

function updateLiveClockAndNextBus() {
  const now = new Date();
  document.getElementById("liveClock").textContent = now.toLocaleTimeString();

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const allDeps = getAllDepartures();

  let upcoming = allDeps
    .filter(d => timeToMinutes(d.time) >= currentMinutes)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  let nextBus = upcoming[0];
  let isTomorrow = false;

  if (!nextBus && allDeps.length > 0) {
    nextBus = allDeps.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0];
    isTomorrow = true;
  }

  if (nextBus) {
    document.getElementById("nextBusDest").textContent = `${nextBus.destination_en} (${nextBus.destination_kn})`;
    document.getElementById("nextBusTime").textContent = formatTo12Hour(nextBus.time);
    document.getElementById("nextBusPlatform").textContent = nextBus.platform;
    document.getElementById("nextBusType").textContent = nextBus.serviceType;

    let diffMinutes = timeToMinutes(nextBus.time) - currentMinutes;
    if (isTomorrow) diffMinutes += 1440;

    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    const diffString = hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins} mins`;
    
    document.getElementById("nextBusCountdown").textContent = isTomorrow ? `Tomorrow (${diffString})` : `Departs ${diffString}`;
  }
}

function openRouteDetails(routeId, time) {
  const route = TIMETABLE_DATA.routes.find(r => r.id === routeId);
  if (!route) return;

  const modalBody = document.getElementById("modalBody");
  modalBody.innerHTML = `
    <h3>Subrahmanya ➔ ${route.destination_en}</h3>
    <p style="color: var(--text-secondary); margin-bottom: 1rem;">${route.destination_kn}</p>
    
    <div class="timeline">
      <div class="timeline-step">
        <strong>Subrahmanya Bus Stand</strong>
        <p>Departure: ${formatTo12Hour(time)} (Platform ${route.platform})</p>
      </div>
      <div class="timeline-step">
        <strong>Direct / Express Highway Route</strong>
        <p>Service: ${route.bus_type}</p>
      </div>
      <div class="timeline-step">
        <strong>${route.destination_en}</strong>
        <p>Destination Terminal</p>
      </div>
    </div>
    <div style="font-size: 0.85rem; color: var(--text-secondary);">
      * Timings reflect official station board schedule.
    </div>
  `;
  document.getElementById("routeModal").showModal();
}

function toggleFavourite(routeId) {
  if (favourites.includes(routeId)) {
    favourites = favourites.filter(id => id !== routeId);
  } else {
    favourites.push(routeId);
  }
  localStorage.setItem("favourite_routes", JSON.stringify(favourites));
  applyFiltersAndRender();
}

function initTheme() {
  const savedTheme = localStorage.getItem("app_theme") || 
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const target = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", target);
  localStorage.setItem("app_theme", target);
  updateThemeIcon(target);
}

function updateThemeIcon(theme) {
  document.getElementById("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(err => console.log("SW registration failed", err));
}
