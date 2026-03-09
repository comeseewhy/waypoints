const SUPABASE_URL = "https://stvbzpdpwcbypzpomacb.supabase.co";
const SUPABASE_KEY = "sb_publishable_PRmge0zjP5ML9YxlEZeJRQ_2RZv-1bh";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_CENTER = [43.6532, -79.3832];
const DEFAULT_ZOOM = 10;

let map;
let neighbourhoodsLayer;
let waypointsLayer;
let userLocationMarker = null;
let draftMarker = null;

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
    zoomControl: true
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  waypointsLayer = L.layerGroup().addTo(map);

  map.on("click", (event) => {
    openCreateSheet(event.latlng);
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

async function loadNeighbourhoods() {
  try {
    const response = await fetch("./data/neighbourhoods.geojson");
    if (!response.ok) {
      throw new Error(`Failed to load neighbourhoods.geojson (${response.status})`);
    }

    const geojson = await response.json();

    neighbourhoodsLayer = L.geoJSON(geojson, {
      style: {
        color: "#555",
        weight: 1,
        fillColor: "#cccccc",
        fillOpacity: 0.12
      },
      onEachFeature: (feature, layer) => {
        const name =
          feature?.properties?.AREA_NAME ||
          feature?.properties?.name ||
          feature?.properties?.NAME ||
          "Neighbourhood";

        layer.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
      }
    }).addTo(map);

    const bounds = neighbourhoodsLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [12, 12] });
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
  waypointsLayer.clearLayers();

  state.waypoints.forEach((waypoint) => {
    const marker = L.marker([waypoint.lat, waypoint.lng]).addTo(waypointsLayer);

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
  const addressHtml = waypoint.address
    ? `<div>${escapeHtml(waypoint.address)}</div>`
    : "";

  const descHtml = waypoint.description
    ? `<div class="popup-desc">${escapeHtml(waypoint.description)}</div>`
    : "";

  return `
    <div>
      <div class="popup-title">${escapeHtml(waypoint.name)}</div>
      <div class="popup-meta">${escapeHtml(waypoint.category)}</div>
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
      map.setView([lat, lng], 14);
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
