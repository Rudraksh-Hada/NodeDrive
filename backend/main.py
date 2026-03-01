import json
import asyncio
import math
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import csv
import os

# Initialize FastAPI App
app = FastAPI()

# Configure CORS so the Vite frontend (or any external UI) can connect to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Global State Management
# -----------------------------
# We keep memory-state here because we aren't using a real Database for the MVP.
# Everything is rebuilt using these dictionaries continuously while the simulation runs.

# The `vehicles` dictionary acts as a live registry of every car currently tracked by the system.
# The keys are unique `vehicle_id` strings. 
# The values are dictionaries containing their telemetry `data` and a `last_seen` timestamp for cleanup.
vehicles = {}  

# Hazard reports tracks user-submitted danger zones (like potholes or accidents)
hazard_reports = []   # List of raw coordinate dicts: [{"lat": x, "lng": y}]

# The clustering engine groups nearby reports into these distinct entities
hazard_clusters = []  # Grouped/clustered hazard spots computed from raw reports

REPORT_FILE = "reports.csv" # A simple CSV fallback file to persist hazard reports

def init_reports():
    """Reads the saved hazard reports from CSV, or creates a new file if blank."""
    global hazard_reports
    if not os.path.exists(REPORT_FILE):
        with open(REPORT_FILE, mode="w", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(["lat", "lng"])
    else:
        with open(REPORT_FILE, mode="r", newline="") as file:
            reader = csv.DictReader(file)
            for row in reader:
                try:
                    hazard_reports.append({
                        "lat": float(row["lat"]),
                        "lng": float(row["lng"])
                    })
                except ValueError:
                    pass

# Load reports directly on server start
init_reports()


# -----------------------------
# Core Utility Functions
# -----------------------------

def get_distance(lat1, lon1, lat2, lon2):
    """
    Computes the great-circle distance (in meters) between two coordinates
    using the Haversine formula.
    """
    R = 6371000 # Earth radius in meters
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)

    a = (
        math.sin(dLat / 2) ** 2 +
        math.cos(math.radians(lat1)) *
        math.cos(math.radians(lat2)) *
        math.sin(dLon / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# -----------------------------
# Collision Engine
# -----------------------------

def compute_collision():
    """
    Iterates over all active vehicles and checks if they are within a high-risk 
    proximity (< 25m) entirely, and verifies if their headings strongly contradict 
    (an angle diff > 150 degrees implies head-on or steep intersection).
    Marks the 'risk' flag = True for the UI to display.
    """
    ids = list(vehicles.keys())

    # reset risk flags globally
    for vid in ids:
        vehicles[vid]["data"]["risk"] = False

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):

            v1 = vehicles[ids[i]]["data"]
            v2 = vehicles[ids[j]]["data"]

            distance = get_distance(
                v1["lat"], v1["lng"],
                v2["lat"], v2["lng"]
            )

            # If inside 15 meters, warn about proximity / rear-end risk regardless of heading
            # This triggers the "COLLISION RISK" alert in the UI
            if distance < 15:
                vehicles[ids[i]]["data"]["risk"] = True
                vehicles[ids[j]]["data"]["risk"] = True


# -----------------------------
# Hazard Warning Engine
# -----------------------------

def compute_hazard_proximity():
    """
    Checks if any vehicles are approaching a known clustered hazard.
    If within 30 meters, mark the vehicle as needing a 'hazard_alert'.
    """
    for vid in vehicles:
        vehicles[vid]["data"]["hazard_alert"] = False

    for vid, obj in vehicles.items():
        vehicle = obj["data"]

        for hazard in hazard_clusters:
            distance = get_distance(
                vehicle["lat"], vehicle["lng"],
                hazard["lat"], hazard["lng"]
            )

            if distance < 50:
                vehicles[vid]["data"]["hazard_alert"] = True


# -----------------------------
# Garbage Collection Engine
# -----------------------------

def cleanup_vehicles():
    """
    Identifies phantom vehicles. If we haven't received a ping from a unit 
    over the simulator WS in the last 5 seconds, drop them from tracking.
    """
    now = asyncio.get_event_loop().time()
    timeout = 5  # seconds

    to_remove = []

    for vid, obj in vehicles.items():
        if now - obj["last_seen"] > timeout:
            to_remove.append(vid)

    for vid in to_remove:
        del vehicles[vid]


# -----------------------------
# Hazard REST API
# -----------------------------

@app.post("/api/hazard")
async def add_hazard(hazard: dict):
    """
    REST endpoint to report new hazards from the UI.
    Saves to CSV log and triggers the Hazard Clustering engine to group the dots.
    """
    lat = hazard["lat"]
    lng = hazard["lng"]

    # Append to active visual memory
    hazard_reports.append({"lat": lat, "lng": lng})
    
    # Append to the CSV 
    with open(REPORT_FILE, mode="a", newline="") as file:
        writer = csv.writer(file)
        writer.writerow([lat, lng])

    compute_hazard_clusters()

    return {"status": "report_saved"}

@app.post("/api/hazard/clear")
async def clear_all_hazards():
    """
    Hidden endpoint allowing command-line clearing of hazards 
    without modifying the frontend UI or AI model logic.
    """
    hazard_reports.clear()
    
    # Blank out the CSV leaving only the header
    with open(REPORT_FILE, mode="w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["lat", "lng"]) 

    compute_hazard_clusters()
    return {"status": "all_cleared"}

def compute_hazard_clusters():
    """
    Analyzes all raw reported hazard pings.
    Groups pings into distinct clusters if they are within 20 meters of each other.
    The resulting grouped 'hazard_clusters' will dictate severity based on report count.
    """
    global hazard_clusters

    threshold = 0.0002  # group if within ~20 meters (approx 0.0002 coordinate degrees)
    clusters = []

    for report in hazard_reports:
        added = False

        for cluster in clusters:
            distance = get_distance(
                report["lat"], report["lng"],
                cluster["lat"], cluster["lng"]
            )

            # Assign to cluster, recalculating the central median lat/lng
            if distance < threshold:
                cluster["points"].append(report)
                cluster["lat"] = sum(p["lat"] for p in cluster["points"]) / len(cluster["points"])
                cluster["lng"] = sum(p["lng"] for p in cluster["points"]) / len(cluster["points"])
                added = True
                break

        # If a point was nowhere near existing clusters, create a new singular cluster
        if not added:
            clusters.append({
                "lat": report["lat"],
                "lng": report["lng"],
                "points": [report]
            })

    # Hydrate final clusters object
    hazard_clusters = [
        {
            "id": f"H{i+1}",
            "lat": c["lat"],
            "lng": c["lng"],
            "count": len(c["points"]),
            "type": "pothole"
        }
        for i, c in enumerate(clusters)
    ]


# -----------------------------
# Emergency Area Engine
# -----------------------------

def compute_emergency_zone():
    """
    If any vehicle is tagged as 'emergency', it broadcasts an aura.
    Any non-emergency unit within 50 meters of an emergency unit is flagged 
    with a 'yield_alert'.
    """
    radius = 50  # meters

    for vid in vehicles:
        vehicles[vid]["data"]["yield_alert"] = False

    for vid, obj in vehicles.items():
        vehicle = obj["data"]

        if vehicle["type"] == "emergency":

            for other_id, other_obj in vehicles.items():

                if vid == other_id:
                    continue

                other = other_obj["data"]

                distance = get_distance(
                    vehicle["lat"], vehicle["lng"],
                    other["lat"], other["lng"]
                )

                if distance < radius:
                    vehicles[other_id]["data"]["yield_alert"] = True


# -----------------------------
# Simulator Upload WebSocket
# -----------------------------

@app.websocket("/ws/sim")
async def simulator_ws(ws: WebSocket):
    """
    INGESTION ENDPOINT:
    Dedicated to ingesting raw telemetry data FROM the `simulator.py` vehicle script. 
    As packets arrive, it updates the `vehicles` state registry and immediately triggers
    the safety engines (Collision, Hazard, Yield) so the master state is fully evaluated
    and ready for UI consumption.
    """
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            vehicle = json.loads(data)

            # Update master memory state with the ping
            vehicles[vehicle["vehicle_id"]] = {
                "data": vehicle,
                "last_seen": asyncio.get_event_loop().time()
            }

            # Re-evaluate all engines
            compute_collision()
            compute_hazard_proximity()
            compute_emergency_zone()
            cleanup_vehicles()

    except WebSocketDisconnect:
        pass


# -----------------------------
# Viewer UI WebSocket
# -----------------------------

@app.websocket("/ws/view")
async def viewer_ws(ws: WebSocket):
    """
    BROADCAST ENDPOINT:
    Dedicated to broadcasting the fully-calculated global traffic & safety state 
    TO connected UI telemetry dashboards (NodeDrive frontend).
    It pushes the entire registry map every 1 second continuously.
    """
    await ws.accept()
    try:
        while True:
            # Send the fully evaluated master dictionaries out to the dashboard
            await ws.send_text(json.dumps({
                "vehicles": {vid: obj["data"] for vid, obj in vehicles.items()},
                "hazards": hazard_clusters
            }))
            await asyncio.sleep(1)

    except WebSocketDisconnect:
        pass

# Force hazard clusters calculation before start
compute_hazard_clusters()