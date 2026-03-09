const SUPABASE_URL = "https://stvbzpdpwcbypzpomacb.supabase.co";
const SUPABASE_KEY = "sb_publishable_PRmge0zjP5ML9YxlEZeJRQ_2RZv-1bh";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_CENTER = [43.6532, -79.3832];
const DEFAULT_ZOOM = 10;
const MAP_SCOPE_BUFFER_METERS = 1000;

const CATEGORY_META = {
  grocery: { icon: "🛒", label: "Grocery" },
  restaurant: { icon: "🍽️", label: "Restaurant" },
  park: { icon: "🌳", label: "Park" },
  cafe: { icon: "☕", label: "Cafe" },
  facility: { icon: "🏢", label: "Facility" },
  store: { icon: "🛍️", label: "Store" },
  other: { icon: "📍", label: "Other" }
};

let map;
let neighbourhoodsLayer;
let waypointsLayer;
let userLocationMarker = null;
let draftMarker = null;
let mapScopeBounds = null;

const state = {
  mode: "create", // "create" | "edit"
  selectedLatLng: null,
  waypoints: []
};

const els = {
  locateBtn: document.getElementById("locate-btn"),
  sheet: document.getElementById("editor-sheet"),
  backdrop: document.getElementById("sheet-backdrop"),
  closeSheetBtn: document.getElementById("close-sheet-btn"),
  sheetTitle: document.getElementById("sheet-title"),
  form: document.getElementById("waypoint-form"),
  waypointId: document.getElementById("waypoint-id"),
  name: document.getElementById("name"),
  address: document.getElementById("address"),
  category: document.getElementById("category"),
  description: document.getElementById("description"),
  latDisplay: document.getElementById("lat-display"),
  lngDisplay: document.getElementById("lng-display"),
  deleteBtn: document.getElementById("delete-btn")
};

init();

async function init() {
  initMap();
  bindEvents();
  await loadNeighbourhoods();
  await loadWaypoints();
  requestDeviceLocation();
}

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    worldCopyJump: false,
    maxBoundsViscosity: 1.0
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  waypointsLayer = L.layerGroup().addTo(map);

  map.on("click", handleMapClick);

  map.on("zoomend", () => {
    renderWaypoints();
  });
}

function bindEvents() {
  els.form.addEventListener("submit", handleFormSubmit);
  els.deleteBtn.addEventListener("click", handleDeleteWaypoint);
  els.closeSheetBtn.addEventListener("click", closeSheet);
  els.backdrop.addEventListener("click", closeSheet);
  els.locateBtn.addEventListener("click", () => requestDeviceLocation(true));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSheet();
    }
  });
}

function handleMapClick(event) {
  map.closePopup();

  if (isSheetOpen() && state.mode === "create") {
    closeSheet();
    return;
  }

  openCreateSheet(event.latlng);
}

async function loadNeighbourhoods() {
  try {
    const response = await fetch("./data/neighbourhoods.geojson");
    if (!response.ok) {
      throw new Error(`Failed to load neighbourhoods.geojson (${response.status})`);
    }

    const geojson = await response.json();

    neighbourhoodsLayer = L.geoJSON(geojson, {
      interactive: false,
      style: {
        color: "#555555",
        weight: 1,
        fillColor: "#cccccc",
        fillOpacity: 0.12
      }
    }).addTo(map);

    const bounds = neighbourhoodsLayer.getBounds();
    if (bounds.isValid()) {
      mapScopeBounds = getBufferedBounds(bounds, MAP_SCOPE_BUFFER_METERS);

      map.fitBounds(mapScopeBounds, { padding: [12, 12] });
      map.setMaxBounds(mapScopeBounds);

      const fittedZoom = map.getZoom();
      map.setMinZoom(Math.max(fittedZoom, 9));
    }
  } catch (error) {
    console.error(error);
    alert("Could not load neighbourhoods.geojson. Check the file path.");
  }
}

async function loadWaypoints() {
  const { data, error } = await supabaseClient
    .from("waypoints")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading waypoints:", error);
    alert("Could not load waypoints from Supabase.");
    return;
  }

  state.waypoints = Array.isArray(data) ? data : [];
  renderWaypoints();
}

function renderWaypoints() {
  if (!waypointsLayer) return;

  waypointsLayer.clearLayers();

  state.waypoints.forEach((waypoint) => {
    const marker = L.marker([waypoint.lat, waypoint.lng], {
      icon: createWaypointIcon(waypoint.category)
    }).addTo(waypointsLayer);

    marker.bindPopup(buildPopupHtml(waypoint));

    marker.on("popupopen", () => {
      const button = document.querySelector(`[data-edit-waypoint="${waypoint.id}"]`);
      if (button) {
        button.addEventListener("click", () => {
          openEditSheet(waypoint);
        });
      }
    });

    marker.on("click", () => {
      if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
      }
    });
  });
}

function buildPopupHtml(waypoint) {
  const categoryInfo = getCategoryMeta(waypoint.category);

  const addressHtml = waypoint.address
    ? `<div>${escapeHtml(waypoint.address)}</div>`
    : "";

  const descHtml = waypoint.description
    ? `<div class="popup-desc">${escapeHtml(waypoint.description)}</div>`
    : "";

  return `
    <div>
      <div class="popup-title">${escapeHtml(waypoint.name)}</div>
      <div class="popup-meta">${escapeHtml(categoryInfo.icon)} ${escapeHtml(categoryInfo.label)}</div>
      ${addressHtml}
      ${descHtml}
      <button class="popup-edit-btn" type="button" data-edit-waypoint="${escapeHtml(waypoint.id)}">
        Edit
      </button>
    </div>
  `;
}

function openCreateSheet(latlng) {
  state.mode = "create";
  state.selectedLatLng = { lat: latlng.lat, lng: latlng.lng };

  els.sheetTitle.textContent = "Add waypoint";
  els.waypointId.value = "";
  els.name.value = "";
  els.address.value = "";
  els.category.value = "";
  els.description.value = "";
  els.deleteBtn.classList.add("hidden");

  updateCoordinateDisplays();
  placeDraftMarker(latlng);
  showSheet();
}

function openEditSheet(waypoint) {
  state.mode = "edit";
  state.selectedLatLng = { lat: waypoint.lat, lng: waypoint.lng };

  els.sheetTitle.textContent = "Edit waypoint";
  els.waypointId.value = waypoint.id;
  els.name.value = waypoint.name || "";
  els.address.value = waypoint.address || "";
  els.category.value = waypoint.category || "";
  els.description.value = waypoint.description || "";
  els.deleteBtn.classList.remove("hidden");

  updateCoordinateDisplays();
  placeDraftMarker({ lat: waypoint.lat, lng: waypoint.lng });
  showSheet();
}

function showSheet() {
  els.sheet.classList.remove("hidden");
  els.backdrop.classList.remove("hidden");
  els.sheet.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  els.sheet.classList.add("hidden");
  els.backdrop.classList.add("hidden");
  els.sheet.setAttribute("aria-hidden", "true");

  if (draftMarker) {
    map.removeLayer(draftMarker);
    draftMarker = null;
  }

  map.closePopup();
  resetFormState();
}

function resetFormState() {
  state.mode = "create";
  state.selectedLatLng = null;
  els.waypointId.value = "";
  els.form.reset();
  updateCoordinateDisplays();
  els.deleteBtn.classList.add("hidden");
}

function updateCoordinateDisplays() {
  if (!state.selectedLatLng) {
    els.latDisplay.textContent = "—";
    els.lngDisplay.textContent = "—";
    return;
  }

  els.latDisplay.textContent = state.selectedLatLng.lat.toFixed(6);
  els.lngDisplay.textContent = state.selectedLatLng.lng.toFixed(6);
}

function placeDraftMarker(latlng) {
  if (draftMarker) {
    map.removeLayer(draftMarker);
  }

  draftMarker = L.circleMarker([latlng.lat, latlng.lng], {
    radius: 8,
    weight: 2,
    color: "#111111",
    fillColor: "#ffffff",
    fillOpacity: 1
  }).addTo(map);
}

async function handleFormSubmit(event) {
  event.preventDefault();

  if (!state.selectedLatLng) {
    alert("Choose a map location first.");
    return;
  }

  const payload = {
    name: els.name.value.trim(),
    address: els.address.value.trim(),
    category: els.category.value.trim(),
    description: els.description.value.trim(),
    lat: state.selectedLatLng.lat,
    lng: state.selectedLatLng.lng
  };

  if (!payload.name || !payload.category) {
    alert("Name and category are required.");
    return;
  }

  try {
    if (state.mode === "create") {
      const { error } = await supabaseClient
        .from("waypoints")
        .insert([payload]);

      if (error) throw error;
    } else {
      const id = els.waypointId.value;
      const { error } = await supabaseClient
        .from("waypoints")
        .update(payload)
        .eq("id", id);

      if (error) throw error;
    }

    await loadWaypoints();
    closeSheet();
  } catch (error) {
    console.error("Save error:", error);
    alert("Could not save waypoint.");
  }
}

async function handleDeleteWaypoint() {
  const id = els.waypointId.value;
  if (!id) return;

  const confirmed = window.confirm("Delete this waypoint?");
  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from("waypoints")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await loadWaypoints();
    closeSheet();
  } catch (error) {
    console.error("Delete error:", error);
    alert("Could not delete waypoint.");
  }
}

function requestDeviceLocation(showFailureAlert = false) {
  if (!("geolocation" in navigator)) {
    if (showFailureAlert) {
      alert("Geolocation is not supported on this device.");
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
      }

      userLocationMarker = L.circleMarker([lat, lng], {
        radius: 7,
        weight: 2,
        color: "#0b57d0",
        fillColor: "#0b57d0",
        fillOpacity: 0.35
      }).addTo(map);

      userLocationMarker.bindPopup("You are here");

      if (mapScopeBounds && mapScopeBounds.contains([lat, lng])) {
        map.setView([lat, lng], Math.max(map.getZoom(), 14));
      } else if (mapScopeBounds) {
        map.fitBounds(mapScopeBounds, { padding: [12, 12] });
      } else {
        map.setView([lat, lng], 14);
      }
    },
    (error) => {
      console.error("Geolocation error:", error);
      if (showFailureAlert) {
        alert("Could not get your location.");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function createWaypointIcon(category) {
  const categoryKey = normalizeCategory(category);
  const categoryInfo = getCategoryMeta(categoryKey);
  const size = getMarkerSizeForZoom(map ? map.getZoom() : DEFAULT_ZOOM);
  const emojiSize = Math.round(size * 0.42);
  const borderRadius = Math.round(size * 0.28);
  const borderWidth = 2;
  const tailSize = Math.max(10, Math.round(size * 0.28));
  const tailOffset = Math.round(tailSize * 0.52);
  const totalHeight = size + tailOffset;

  return L.divIcon({
    className: `waypoint-icon-wrapper category-${categoryKey}`,
    html: `
      <div
        class="waypoint-icon-card"
        aria-hidden="true"
        style="
          width:${size}px;
          height:${size}px;
          border-radius:${borderRadius}px;
          border-width:${borderWidth}px;
          --marker-tail-size:${tailSize}px;
          --marker-emoji-size:${emojiSize}px;
        "
      >
        <span class="waypoint-icon-emoji">${escapeHtml(categoryInfo.icon)}</span>
      </div>
    `,
    iconSize: [size, totalHeight],
    iconAnchor: [size / 2, totalHeight],
    popupAnchor: [0, -totalHeight + 8]
  });
}

function getMarkerSizeForZoom(zoom) {
  if (zoom >= 16) return 64;
  if (zoom >= 14) return 56;
  if (zoom >= 12) return 48;
  return 40;
}

function getCategoryMeta(category) {
  const key = normalizeCategory(category);
  return CATEGORY_META[key] || CATEGORY_META.other;
}

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  return CATEGORY_META[value] ? value : "other";
}

function isSheetOpen() {
  return !els.sheet.classList.contains("hidden");
}

function getBufferedBounds(bounds, bufferMeters) {
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  const centerLat = bounds.getCenter().lat;

  const latPadding = metersToLatDegrees(bufferMeters);
  const lngPadding = metersToLngDegrees(bufferMeters, centerLat);

  return L.latLngBounds(
    [south - latPadding, west - lngPadding],
    [north + latPadding, east + lngPadding]
  );
}

function metersToLatDegrees(meters) {
  return meters / 111320;
}

function metersToLngDegrees(meters, latitude) {
  const safeCos = Math.max(Math.cos(latitude * (Math.PI / 180)), 0.01);
  return meters / (111320 * safeCos);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}
