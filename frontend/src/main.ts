import './style.css'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Use CDN for default markers since Vite builds can break them sometimes without manual imports
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Import typescript interfaces
import type { BackendPayload, Vehicle, HazardCluster } from './types'

// ============================================================
// DOM INJECTION
// ============================================================
// Injecting the entire application HTML layout into the #app div.
// This includes the Login Page, the Main HUD, side panels, overlays, and the new crosshair tool.
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<!-- LOGIN SCREEN -->
<div id="loginPage">
  <div class="loginBox">
    <img src="/logo.png" alt="Node Drive Logo" class="app-logo-large" />
    <h1 class="heading1">NODE DRIVE</h1>
    <p>Drive Safely</p>
    
    <input type="text" id="username" class="input-field" placeholder="Driver ID" autocomplete="off" />
    
    <button id="loginBtn" class="btn-primary">
      <span>INITIALIZE LINK</span>
      <i class="ri-arrow-right-line"></i>
    </button>
  </div>
</div>

<!-- MAIN HUD -->
<div id="appContainer" style="display:none;">
  <!-- Map Layer (Bottom) -->
  <div id="map"></div>
  
  <!-- Crosshair Tool Overlay (Bottom Left Button) -->
  <button id="locateBtn" class="locate-btn" title="Toggle Coordinate Crosshair">
    <i class="ri-focus-3-line"></i>
  </button>

  <!-- Crosshair lines spanning the map -->
  <div id="crosshairContainer" class="crosshair-container">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
  </div>
  
  <!-- display coordinates at the bottom -->
  <div id="coordsDisplay" class="coords-display">LAT: --.----- | LNG: --.-----</div>
  
  <!-- Top Nav Overlay -->
  <div id="topNav">
    <div class="brand" style="display:flex; align-items:center; gap:10px;">
      <img src="/logo.png" alt="Node Drive Logo" class="app-logo-small" />
      <span class="brand-text">Node Drive</span>
    </div>
    
    <div class="nav-center" id="navStatus">
      LINK: <span style="color:var(--success)">OFFLINE</span>
    </div>
    
    <div class="nav-right">
      <div class="user-badge">
        <div class="user-dot"></div>
        <span id="usernameDisplay">COMMANDER</span>
      </div>
      <button id="radarBtn" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:24px;margin-left:8px;transition:0.3s;" title="Toggle Radar View">
        <i class="ri-focus-line"></i>
      </button>
      <button id="settingsBtn" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:24px;margin-left:8px;" title="Settings">
        <i class="ri-settings-3-line"></i>
      </button>
    </div>
  </div>
  
  <!-- Side Panel Overlay -->
  <div id="sidePanel">
    <div class="panel-section">
      <div class="section-title">Telemetry</div>
      <div class="metrics-grid">
        <div class="metric-tile">
          <div class="metric-val text-accent" id="activeUnits">0</div>
          <div class="metric-label">ACTIVE UNITS</div>
        </div>
        <div class="metric-tile">
          <div class="metric-val text-warning" id="activeHazards">0</div>
          <div class="metric-label">HAZARDS</div>
        </div>
      </div>
    </div>
    
    <div class="panel-section" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
      <div class="section-title">
        <span>Live Feed</span>
        <button id="clearAlertsBtn" style="background:none;border:none;color:var(--secondary);font-size:10px;cursor:pointer;">CLEAR</button>
      </div>
      <div id="alertList">
        <div class="empty-state">System nominal. No active threats.</div>
      </div>
      
      <!-- Report Hazard Action Button -->
      <div style="margin-top:auto; padding-top:10px; border-top:1px solid var(--glass-border);">
        <button id="reportBtn" class="btn-primary" style="width:100%;">
          <i class="ri-map-pin-add-fill"></i> REPORT HAZARD
        </button>
      </div>
    </div>
  </div>

  <!-- OVERLAYS (Settings & Reports) -->
  <div id="settingsOverlay" class="overlay">
    <div class="overlay-content">
      <div class="modal-header">
        <span>System Settings</span>
        <button id="closeSettingsBtn"><i class="ri-close-line"></i></button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-family:var(--brand-font); font-size:16px;">Interface Theme</span>
        <button id="themeToggleBtn" class="btn-primary" style="padding:10px 16px; width:auto;">MODE: DARK</button>
      </div>
    </div>
  </div>

  <div id="reportOverlay" class="overlay">
    <div class="overlay-content">
      <div class="modal-header">
        <span>Report Hazard</span>
        <button id="closeReportBtn"><i class="ri-close-line"></i></button>
      </div>
      <input type="number" id="reportLat" class="input-field" placeholder="Latitude" step="any" style="margin-bottom:10px;" />
      <input type="number" id="reportLng" class="input-field" placeholder="Longitude" step="any" style="margin-bottom:20px;" />
      <button id="submitReportBtn" class="btn-primary" style="width:100%;">TRANSMIT</button>
    </div>
  </div>

  <!-- Non-intrusive notification popup -->
  <div id="toast" class="toast">Action Complete</div>
</div>
`

// ============================================================
// APPLICATION STATE
// ============================================================
// Global variables to track map state and physical entities on the map
let map: L.Map
const vehicleMarkers: Record<string, L.Marker> = {}          // tracks live vehicle markers
const hazardMarkers: Record<string, L.CircleMarker> = {}     // tracks hazard clusters
const emergencyZones: Record<string, L.Circle> = {}          // tracks emergency pulse radii

// Icons setup (using explicit URLs to guarantee loading correctly)
const normalIcon = new L.Icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] })
const redIcon = icon("red-dot.png")
const yellowIcon = icon("yellow-dot.png")
const emergencyIcon = icon("blue-pushpin.png")
const userIcon = icon("green-dot.png")

let currentUser = "USER_DRIVER" // Default, will update on login

// Helper function to pull specific color dots from Google's legacy marker set
function icon(file: string) {
  return new L.Icon({
    iconUrl: `https://maps.google.com/mapfiles/ms/icons/${file}`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  })
}

// ============================================================
// INITIALIZATION
// ============================================================
// Grab basic DOM elements for toggling view states
const loginBtn = document.getElementById("loginBtn")!
const usernameInput = document.getElementById("username") as HTMLInputElement
const usernameDisplay = document.getElementById("usernameDisplay")!
const loginPage = document.getElementById("loginPage")!
const appContainer = document.getElementById("appContainer")!

// Event listener to handle the user log-in process
loginBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim() || 'DRIVER'
  // Format the username to match simulator's strict naming schema (USER_[NAME])
  currentUser = `USER_${username.toUpperCase()}`
  usernameDisplay.innerText = username.toUpperCase()

  // Hide the login screen, show the HUD
  loginPage.style.display = "none"
  appContainer.style.display = "block"

  // Initialize Map after the container has been displayed so it gets correct dimensions
  // setTimeout provides the DOM enough ticks to register bounds
  setTimeout(() => {
    initMap()
    initWebSocket()
  }, 100)
})

// Allow pressing enter key to login
usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") loginBtn.click()
})

// ============================================================
// MAP
// ============================================================
// Builds the Leaflet.js Object and attaches it to the DOM
function initMap() {
  // Center is the same block center from simulator.py (Statue Circle Jaipur)
  map = L.map('map', { zoomControl: false }).setView([26.9124, 75.7873], 17)

  // Zoom control relocated to bottom left
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // Map Layer references - utilizing CartoDB optimized sleek tiles
  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  });

  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  });

  // Start with dark mode Map Tile Layer
  cartoDark.addTo(map);

  // Save layers to window object so Theme settings can toggle them
  (window as any).cartoLayers = { dark: cartoDark, light: cartoLight };

  // Wait half a second, enforce map redraw to fix gray tile bugs
  setTimeout(() => map.invalidateSize(), 500)

  // Disable default left-click dragging when crosshair tool is active
  // Enable custom right-click map dragging
  let isRightDragging = false;
  let lastMousePoint: L.Point | null = null;
  (window as any).isMapDragging = false; // Global flag for auto-center logic

  map.on("dragstart", () => (window as any).isMapDragging = true);
  map.on("dragend", () => (window as any).isMapDragging = false);

  map.on("mousedown", (e: L.LeafletMouseEvent) => {
    if (crosshairActive && e.originalEvent.button === 2) {
      isRightDragging = true;
      (window as any).isMapDragging = true; // Also counts as dragging
      lastMousePoint = map.mouseEventToContainerPoint(e.originalEvent);
      map.getContainer().style.cursor = 'grabbing';
      // Prevent default context menu
      e.originalEvent.preventDefault();
    }
  });

  map.on("mouseup", (e: L.LeafletMouseEvent) => {
    if (isRightDragging && e.originalEvent.button === 2) {
      isRightDragging = false;
      (window as any).isMapDragging = false;
      lastMousePoint = null;
      map.getContainer().style.cursor = '';
    }
  });

  map.on("mousemove", (e: L.LeafletMouseEvent) => {
    if (isRightDragging && lastMousePoint && crosshairActive) {
      const currentPoint = map.mouseEventToContainerPoint(e.originalEvent);
      // Calculate delta
      const deltaX = lastMousePoint.x - currentPoint.x;
      const deltaY = lastMousePoint.y - currentPoint.y;

      // Pan map by delta
      map.panBy([deltaX, deltaY], { animate: false });

      lastMousePoint = currentPoint;
    } else if (crosshairActive && !crosshairLocked) {
      updateCoordsDisplay(e);
    }
  });

  // Block native context menu on the map container
  map.getContainer().addEventListener('contextmenu', (e) => {
    if (crosshairActive) {
      e.preventDefault();
    }
  });

  // Click to lock/unlock crosshair (Left click only)
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (crosshairActive && e.originalEvent.button === 0) {
      crosshairLocked = !crosshairLocked;
      if (crosshairLocked) {
        document.querySelector('.crosshair-h')?.classList.add('locked');
        document.querySelector('.crosshair-v')?.classList.add('locked');
      } else {
        document.querySelector('.crosshair-h')?.classList.remove('locked');
        document.querySelector('.crosshair-v')?.classList.remove('locked');
        updateCoordsDisplay(e); // update immediately to current mouse pos
      }
    }
  });
}

// ============================================================
// CROSSHAIR TOOL LOGIC
// ============================================================
// Grabbing DOM Elements for the Coordinate Crosshair & Radar
const locateBtn = document.getElementById("locateBtn")!
const radarBtn = document.getElementById("radarBtn")!
const crosshairContainer = document.getElementById("crosshairContainer")!
const coordsDisplay = document.getElementById("coordsDisplay")!

let crosshairActive = false
let crosshairLocked = false // Tracks if the crosshair is pinned to a location
let radarModeActive = false

radarBtn.addEventListener("click", () => {
  radarModeActive = !radarModeActive
  if (radarModeActive) {
    radarBtn.style.color = "var(--danger)"
    radarBtn.style.textShadow = "0 0 10px rgba(239, 68, 68, 0.6)" // Red glow
    showToast("Radar View Active: Local proximity only")
    map.setZoom(19) // Tight zoom
  } else {
    radarBtn.style.color = "var(--primary)"
    radarBtn.style.textShadow = "none"
    showToast("Radar View Standby: Full telemetry restored")
    map.setZoom(16) // Default wide zoom
  }
})

// Toggle the full screen crossing lines and the coordinate numbers. 
locateBtn.addEventListener("click", () => {
  crosshairActive = !crosshairActive;
  locateBtn.classList.toggle("active", crosshairActive);
  crosshairContainer.classList.toggle("active", crosshairActive);
  coordsDisplay.classList.toggle("active", crosshairActive);

  if (crosshairActive) {
    crosshairLocked = false; // Reset lock state when turning on
    document.querySelector('.crosshair-h')?.classList.remove('locked');
    document.querySelector('.crosshair-v')?.classList.remove('locked');
    map.dragging.disable(); // Disable left-click drag
    updateCoordsDisplay() // Show immediately
  } else {
    map.dragging.enable(); // Re-enable left-click drag
  }
})

// Fetch the absolute center of the map and print it to the UI
function updateCoordsDisplay(e?: L.LeafletMouseEvent) {
  if (!map) return;
  const latlng = e ? e.latlng : map.getCenter()
  coordsDisplay.innerText = `LAT: ${latlng.lat.toFixed(5)} | LNG: ${latlng.lng.toFixed(5)}`

    // Autofill the hazard reporting overlay so user can easily trace coordinates
    ; (document.getElementById("reportLat") as HTMLInputElement).value = latlng.lat.toFixed(5)
    ; (document.getElementById("reportLng") as HTMLInputElement).value = latlng.lng.toFixed(5)

  const crosshairH = document.querySelector('.crosshair-h') as HTMLElement;
  const crosshairV = document.querySelector('.crosshair-v') as HTMLElement;

  // Only update crosshair position if we are moving the mouse over it
  if (e && crosshairH && crosshairV && !crosshairLocked) {
    crosshairH.style.top = `${e.containerPoint.y}px`;
    crosshairV.style.left = `${e.containerPoint.x}px`;
  } else if (!e && crosshairH && crosshairV && !crosshairLocked) {
    // If no event and not locked, reset to center
    crosshairH.style.top = '50%';
    crosshairV.style.left = '50%';
  }
}

// ============================================================
// OVERLAY & THEME LOGIC
// ============================================================
// Grabbing elements for settings and reporting Modals
const settingsOverlay = document.getElementById("settingsOverlay")!
const reportOverlay = document.getElementById("reportOverlay")!

// Event Listeners for opening and closing Overlays
document.getElementById("settingsBtn")!.addEventListener("click", () => settingsOverlay.classList.add("active"))
document.getElementById("closeSettingsBtn")!.addEventListener("click", () => settingsOverlay.classList.remove("active"))

document.getElementById("reportBtn")!.addEventListener("click", () => reportOverlay.classList.add("active"))
document.getElementById("closeReportBtn")!.addEventListener("click", () => reportOverlay.classList.remove("active"))


// Standard Dark Mode / Light Mode application Theme Toggle
const themeToggleBtn = document.getElementById("themeToggleBtn")!
let isLightMode = false

themeToggleBtn.addEventListener("click", () => {
  isLightMode = !isLightMode
  document.body.classList.toggle("light-mode")

  if (isLightMode) {
    themeToggleBtn.innerText = "MODE: LIGHT"
    map.removeLayer((window as any).cartoLayers.dark)
    map.addLayer((window as any).cartoLayers.light)
  } else {
    themeToggleBtn.innerText = "MODE: DARK"
    map.removeLayer((window as any).cartoLayers.light)
    map.addLayer((window as any).cartoLayers.dark)
  }
})

// Toast System to provide silent feedback without interrupting workflow
function showToast(msg: string) {
  const toast = document.getElementById("toast")!
  toast.innerText = msg
  toast.classList.add("show")
  setTimeout(() => toast.classList.remove("show"), 3000)
}

// Hazard Reporting API Call
// Pushes the form's LAT and LNG direct to the FastAPI
document.getElementById("submitReportBtn")!.addEventListener("click", async () => {
  const lat = parseFloat((document.getElementById("reportLat") as HTMLInputElement).value)
  const lng = parseFloat((document.getElementById("reportLng") as HTMLInputElement).value)

  if (isNaN(lat) || isNaN(lng)) {
    showToast("Invalid coordinates")
    return
  }

  try {
    // Dynamic Cloud API URL injected by Vite/Vercel ENV vars
    // Fallback to localhost if developing locally
    const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

    await fetch(`${API_BASE}/api/hazard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng })
    })

    reportOverlay.classList.remove("active")
    showToast("Hazard Reported Successfully")

      // Clear the input fields for the next report
      ; (document.getElementById("reportLat") as HTMLInputElement).value = ""
      ; (document.getElementById("reportLng") as HTMLInputElement).value = ""

    // Turn off crosshair mode so map automatically resumes user centering 
    // and normal interaction if it was on
    if (crosshairActive) {
      locateBtn.click()
    }

  } catch (e) {
    showToast("Transmission Failed")
  }
})

// ============================================================
// WEBSOCKET LOGIC
// ============================================================
// Sets up continuous two-way link to the Python Server
// We define a fallback localhost string for local testing,
// but read from process environment variables if hosted on Vercel/Render
let WS_BASE = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000"
if (WS_BASE.startsWith("https")) {
  WS_BASE = WS_BASE.replace("https", "wss")
} else if (WS_BASE.startsWith("http")) {
  WS_BASE = WS_BASE.replace("http", "ws")
}

function initWebSocket() {
  const navStatus = document.getElementById("navStatus")!
  const socket = new WebSocket(`${WS_BASE}/ws/view`)

  socket.onopen = () => {
    navStatus.innerHTML = 'LINK: <span style="color:var(--success)">ONLINE</span>'
  }
  socket.onclose = () => {
    navStatus.innerHTML = 'LINK: <span style="color:var(--danger)">OFFLINE</span>'
    setTimeout(initWebSocket, 3000) // reconnect
  }

  // Parse incoming telemetry payload every tick (every 1 second)
  socket.onmessage = (event) => {
    if (!map) return
    const data: BackendPayload = JSON.parse(event.data)
    renderHUD(data)
  }
}

// ============================================================
// RENDERING
// ============================================================
// Master execution block that distributes backend data to appropriate UI
function renderHUD(data: BackendPayload) {
  const vCount = Object.keys(data.vehicles).length
  const hCount = data.hazards ? data.hazards.length : 0

  document.getElementById("activeUnits")!.innerText = vCount.toString()
  document.getElementById("activeHazards")!.innerText = hCount.toString()

  // Execute rendering procedures sequentially
  // Pass only relevant sub-sections of the payload JSON

  renderHazards(data.hazards || [])

  renderVehicles(data.vehicles)
  updateAlerts(data.vehicles)
}

// Draw static Hazard circles based on clustering size
function renderHazards(hazards: HazardCluster[]) {
  // Clear old markers if they no longer exist in data
  for (const id in hazardMarkers) {
    if (!hazards.find(h => h.id === id)) {
      map.removeLayer(hazardMarkers[id])
      delete hazardMarkers[id]
    }
  }

  // Draw current hazards
  hazards.forEach(h => {
    // Dynamic sizing and color based on severity (number of reports)
    const size = h.count >= 4 ? 18 : h.count >= 2 ? 14 : 10
    const color = h.count >= 4 ? "var(--danger)" : "var(--warning)"

    // create new or update existing
    if (!hazardMarkers[h.id]) {
      hazardMarkers[h.id] = L.circleMarker([h.lat, h.lng], {
        radius: size,
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.6
      }).bindPopup(`
    <div style="font-weight:bold;color:${color}"> Hazard ${h.id} </div>
    <div> Reports: ${h.count} </div>
    <div style="font-size:11px; margin-top:5px; color:var(--secondary)">LAT: ${h.lat.toFixed(5)} | LNG: ${h.lng.toFixed(5)}</div>
      `).addTo(map)
    } else {
      hazardMarkers[h.id]
        .setLatLng([h.lat, h.lng])
        .setRadius(size)
        .setStyle({ color, fillColor: color })
    }
  })
}

// Plot vehicle markers and their specific event behaviors (e.g. emergency aura)
function renderVehicles(vehicles: Record<string, Vehicle>) {

  // Radar Mode Pre-Processing: 
  if (radarModeActive) {
    let userLat: number | null = null
    let userLng: number | null = null

    // Find User Coordinates First
    for (let id in vehicles) {
      let mappedId = id === "USER_RUDRAKSH" ? currentUser : id
      if (mappedId === currentUser) {
        userLat = vehicles[id].lat
        userLng = vehicles[id].lng
        break
      }
    }

    // Filter Out Distant Vehicles
    if (userLat !== null && userLng !== null) {
      const userPos = L.latLng(userLat, userLng)
      for (let id in vehicles) {
        let mappedId = id === "USER_RUDRAKSH" ? currentUser : id
        if (mappedId !== currentUser) { // Keep the user
          const dist = map.distance(userPos, L.latLng(vehicles[id].lat, vehicles[id].lng))
          if (dist > 50) { // 50 meters
            delete vehicles[id] // Erase from payload so it vanishes from map
          }
        }
      }
    }
  }

  // Cleanup old layers where the vehicle ID doesn't exist anymore
  for (const existingId in vehicleMarkers) {
    if (!vehicles[existingId]) {
      map.removeLayer(vehicleMarkers[existingId])
      delete vehicleMarkers[existingId]
      if (emergencyZones[existingId]) {
        map.removeLayer(emergencyZones[existingId])
        delete emergencyZones[existingId]
      }
    }
  }

  // Draw or transition current active vehicles
  for (let id in vehicles) {
    const v = vehicles[id]

    // The Python simulator hardcodes "USER_RUDRAKSH". 
    // We dynamically swap this ID to whatever the user logged in as.
    if (id === "USER_RUDRAKSH") {
      id = currentUser;
    }

    const pos: L.LatLngExpression = [v.lat, v.lng]

    // Create the tooltip 
    const popupHTML = `
  <div style="font-size:12px; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.1)">
  <strong style="color:var(--accent)"> UNIT: </strong> ${id}
  </div>
  <div style="font-size:11px; margin-bottom:3px;"> <strong>TYPE: </strong> ${v.type.toUpperCase()}</div>
  <div style="font-size:11px;"> <strong>SPEED: </strong> ${v.speed.toFixed(1)} km/h </div>
  <div style="font-size:11px; margin-top:3px; color:var(--secondary)">LAT: ${v.lat.toFixed(5)} | LNG: ${v.lng.toFixed(5)}</div>
    `

    // Generate vehicle if newly spawned
    if (!vehicleMarkers[id]) {
      vehicleMarkers[id] = L.marker(pos, { icon: normalIcon })
        .bindPopup(popupHTML)
        .addTo(map)
    }

    // Set position and info
    vehicleMarkers[id].setLatLng(pos)
    vehicleMarkers[id].setPopupContent(popupHTML)

    // Icons Override based on Priority Level and Vehicle Identification
    // Dynamically match the user who logged in (which we just swapped to `currentUser`)
    if (id === currentUser) {
      vehicleMarkers[id].setIcon(userIcon)
      vehicleMarkers[id].setZIndexOffset(1000)

      // Only auto-center if the user isn't actively taking control
      // and if the crosshair tool (+ mode) is NOT active
      if (!(window as any).isMapDragging && !crosshairActive) {
        map.panTo(pos, { animate: true, duration: 0.5 }) // Auto center on user
      }
    } else if (v.risk) {
      vehicleMarkers[id].setIcon(redIcon) // Risk of Colliding
    } else if (v.hazard_alert) {
      vehicleMarkers[id].setIcon(yellowIcon) // Nearing Hazard
    } else if (v.yield_alert) {
      vehicleMarkers[id].setIcon(yellowIcon) // Nearing Emergency unit
    } else if (v.type === "emergency") {
      vehicleMarkers[id].setIcon(emergencyIcon)
    } else {
      vehicleMarkers[id].setIcon(normalIcon)
    }

    // Emergency zones (Radius) logic
    // Give emergency vehicles a pulsing circle
    if (v.type === "emergency") {
      if (!emergencyZones[id]) {
        emergencyZones[id] = L.circle(pos, {
          radius: 50, color: "var(--emergency)", weight: 1, fillColor: "var(--emergency)", fillOpacity: 0.15
        }).addTo(map)
      } else {
        emergencyZones[id].setLatLng(pos)
      }
    }
  }
}
// ============================================================
// ALERT ENGINE (Historical Log)
// ============================================================
interface AlertEntry {
  type: 'danger' | 'warning' | 'emergency'
  title: string
  message: string
  timestamp: number
  icon: string
}

let alertHistory: AlertEntry[] = []
const lastAlertTimes: Record<string, number> = {} // debounce tracking

// Format a Date.now() timestamp into HH:MM:SS
function formatTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour12: false })
}

// Keep track of alerts as a scrolling log limited to 10 items
function updateAlerts(vehicles: Record<string, Vehicle>) {
  const alertList = document.getElementById("alertList")!
  const now = Date.now()
  let addedNew = false

  // Iterate to find specific state tags generated by the Python collision/hazard engines
  for (const id in vehicles) {
    const v = vehicles[id]

    // Convert hardcoded simulation ID to dynamic user ID
    const mappedId = id === "USER_RUDRAKSH" ? currentUser : id

    // FILTER: Only show alerts that actually involve the current user's car
    if (mappedId !== currentUser) continue;

    // Helper to debounce and add an alert entry
    const triggerAlert = (key: string, entry: Omit<AlertEntry, "timestamp">) => {
      if (now - (lastAlertTimes[key] || 0) > 5000) {
        lastAlertTimes[key] = now
        alertHistory.unshift({ ...entry, timestamp: now })

        // Cap history at 10 items
        if (alertHistory.length > 10) {
          alertHistory.pop()
        }
        addedNew = true
      }
    }

    // Priority 1: High Risk Collisions
    if (v.risk) {
      triggerAlert(`risk_${id}`, {
        type: "danger",
        icon: "ri-error-warning-fill",
        title: "COLLISION RISK",
        message: `Unit ${mappedId} trajectory conflict`
      })
    }
    // Priority 2: Hazard Alerts
    else if (v.hazard_alert) {
      triggerAlert(`hazard_${id}`, {
        type: "warning",
        icon: "ri-alert-fill",
        title: "HAZARD PROXIMITY",
        message: `Unit ${mappedId} approaching hazard`
      })
    }
  }

  // Only redraw DOM if new items accumulated
  if (!addedNew && alertHistory.length > 0) return;

  // Render the Historical State
  if (alertHistory.length === 0) {
    alertList.innerHTML = '<div class="empty-state">System nominal. No active threats.</div>'
  } else {
    alertList.innerHTML = alertHistory.map(alert => `
      <div class="alert-item ${alert.type}">
        <i class="${alert.icon}"></i>
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; width:100%;">
            <div style="font-family:var(--mono-font);font-size:10px;color:var(--secondary)">${alert.title}</div>
            <div style="font-family:var(--mono-font);font-size:10px;color:var(--secondary)">${formatTime(alert.timestamp)}</div>
          </div>
          <div>${alert.message}</div>
        </div>
      </div>
    `).join("")
  }
}

// Button to clear alerts - manually empties array
document.getElementById("clearAlertsBtn")!.addEventListener("click", () => {
  alertHistory = []
  document.getElementById("alertList")!.innerHTML = '<div class="empty-state">Feed cleared.</div>'
})
