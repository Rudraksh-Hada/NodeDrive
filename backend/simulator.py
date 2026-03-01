import asyncio
import websockets
import json
import uuid
import random
import math
import os

# ==========================================================
# CONFIGURATION
# ==========================================================

# WebSocket endpoint (FastAPI backend)
# Uses the environment variable WS_URL provided by cloud platorms (like Render),
# or falls back to localhost for local testing.
_env_ws = os.getenv("WS_URL")
URI = f"{_env_ws}/ws/sim" if _env_ws else "ws://localhost:8000/ws/sim"
# Note: If the cloud WS_URL starts with 'https', replace it with 'wss'
if URI.startswith("https"):
    URI = URI.replace("https", "wss")
elif URI.startswith("http"):
    URI = URI.replace("http", "ws")

# Statue Circle, Jaipur (simulation center)
CENTER_LAT = 26.9124
CENTER_LNG = 75.7873

# Road stretch from center (~500m each direction)
ROAD_RADIUS = 0.005

# Traffic volume
NUM_NORMAL = 45
NUM_EMERGENCY = 5
NUM_USER = 1


# ==========================================================
# UTILITY FUNCTIONS
# ==========================================================

def get_distance(lat1, lon1, lat2, lon2):
    """
    Computes simple Euclidean distance between two coordinates.
    Used to check:
    - Distance from center
    - Respawn conditions
    """
    return math.sqrt((lat2 - lat1)**2 + (lon2 - lon1)**2)


# ==========================================================
# VEHICLE SPAWN LOGIC
# ==========================================================

def create_crossroad_vehicle(vehicle_type="car", is_user=False, force_dir=None):
    """
    Creates a vehicle positioned on one of 4 roads:
    N, S, E, W.
    
    Vehicles always travel straight through the intersection.
    """

    # Choose spawn direction
    direction = force_dir if force_dir else random.choice(["N", "S", "E", "W"])

    # Random offset distance from center
    offset = random.uniform(0.001, ROAD_RADIUS)

    # Slight lane jitter (prevents perfect stacking)
    lane_jitter = random.uniform(-0.00005, 0.00005)

    if direction == "N":
        lat = CENTER_LAT + offset
        lng = CENTER_LNG + lane_jitter
        heading = 180  # moving south

    elif direction == "S":
        lat = CENTER_LAT - offset
        lng = CENTER_LNG + lane_jitter
        heading = 0  # moving north

    elif direction == "E":
        lat = CENTER_LAT + lane_jitter
        lng = CENTER_LNG + offset
        heading = 270  # moving west

    else:  # W
        lat = CENTER_LAT + lane_jitter
        lng = CENTER_LNG - offset
        heading = 90  # moving east

    return {
        "vehicle_id": "USER_RUDRAKSH" if is_user else str(uuid.uuid4())[:6],
        "lat": lat,
        "lng": lng,
        "heading": heading,
        "speed": 50 if is_user else random.uniform(25, 60),
        "type": vehicle_type,
        "spawn_dir": direction,
        "base_speed": random.uniform(35, 55),
        "is_rebel": random.random() < 0.2 and not is_user
    }


# ==========================================================
# MAIN SIMULATION LOOP
# ==========================================================

async def simulate():

    vehicles = []

    # Create user vehicle first
    user_vehicle = create_crossroad_vehicle("car", is_user=True)
    user_dir = user_vehicle["spawn_dir"]
    vehicles.append(user_vehicle)

    # Spawn civilian cars
    for _ in range(NUM_NORMAL):
        v_dir = user_dir if random.random() < 0.6 else None
        vehicles.append(create_crossroad_vehicle("car", force_dir=v_dir))

    # Spawn emergency vehicles
    for _ in range(NUM_EMERGENCY):
        vehicles.append(create_crossroad_vehicle("emergency"))

    print("🔥 Node Drive CHAOTIC Simulation Running...")

    while True:
        try:
            async with websockets.connect(URI, ping_interval=None) as ws:

                traffic_light = "NS"  # NS green initially
                light_timer = 0

                while True:

                    # -------------------------
                    # TRAFFIC LIGHT SWITCHING
                    # -------------------------
                    light_timer += 1
                    if light_timer > random.randint(8, 15):
                        traffic_light = "EW" if traffic_light == "NS" else "NS"
                        light_timer = 0

                    # -------------------------
                    # PROCESS EACH VEHICLE
                    # -------------------------
                    for i, v in enumerate(vehicles):

                        # Random reaction freeze (chaos)
                        if random.random() < 0.04:
                            continue

                        dist_to_center = get_distance(
                            v["lat"], v["lng"],
                            CENTER_LAT, CENTER_LNG
                        )

                        target_speed = v["base_speed"]

                        # -------------------------
                        # 2. RED LIGHT BEHAVIOR
                        # -------------------------
                        # Only apply light logic if the car is very close to the center
                        if dist_to_center < 0.0015 and v["type"] != "emergency":

                            # Chaos Factor: 35% chance a rebel driver just ignores the red light
                            ignore_light = random.random() < 0.35

                            if not ignore_light:
                                # Stop N/S traffic when light is E/W
                                if traffic_light == "EW" and v["spawn_dir"] in ["N", "S"]:
                                    target_speed = 0

                                # Stop E/W traffic when light is N/S
                                if traffic_light == "NS" and v["spawn_dir"] in ["E", "W"]:
                                    target_speed = 0

                        # -------------------------
                        # 3. LANE DISCIPLINE (Car Following)
                        # -------------------------
                        # Scan all other vehicles to see if someone is directly blocking our lane
                        min_dist_ahead = 999
                        for j, other_v in enumerate(vehicles):
                            if i == j or other_v["spawn_dir"] != v["spawn_dir"]: continue
                            
                            # Check if the other car is geographically in front of us
                            in_front = False
                            gap = 999
                            if v["spawn_dir"] == "N" and other_v["lat"] < v["lat"]:
                                gap = v["lat"] - other_v["lat"]
                                in_front = True
                            elif v["spawn_dir"] == "S" and other_v["lat"] > v["lat"]:
                                gap = other_v["lat"] - v["lat"]
                                in_front = True
                            elif v["spawn_dir"] == "E" and other_v["lng"] < v["lng"]:
                                gap = v["lng"] - other_v["lng"]
                                in_front = True
                            elif v["spawn_dir"] == "W" and other_v["lng"] > v["lng"]:
                                gap = other_v["lng"] - v["lng"]
                                in_front = True
                                
                            if in_front and gap < min_dist_ahead:
                                min_dist_ahead = gap
                                
                        # React to traffic queue
                        if min_dist_ahead < 0.0003: # Emergency braking distance (approx 30m)
                            target_speed = 0 # Full stop
                        elif min_dist_ahead < 0.0006: # Following distance (approx 60m)
                            target_speed = min(target_speed, 20) # Slow to match pace
                        # -------------------------
                        # 4. CHAOS MECHANICS (Rebels only)
                        # -------------------------
                        # Randomly burst speed to break the monotony
                        if random.random() < 0.07:
                            target_speed += random.uniform(20, 35)

                        # Random panic braking / brake-checking
                        if dist_to_center < 0.0008 and random.random() < 0.25:
                            target_speed = 0

                        # Swerve slightly across the lane near the intersection
                        if dist_to_center < 0.001 and random.random() < 0.15:
                            jitter = random.uniform(-0.00015, 0.00015)
                            if v["spawn_dir"] in ["N", "S"]:
                                v["lng"] += jitter
                            else:
                                v["lat"] += jitter

                        # -------------------------
                        # 5. PHYSICS APPLICATION 
                        # -------------------------
                        if v["speed"] < target_speed:
                            v["speed"] += random.uniform(5, 15)
                        else:
                            v["speed"] -= random.uniform(10, 25)

                        # Emergency vehicles slightly faster
                        if v["type"] == "emergency":
                            v["speed"] += random.uniform(5, 10)

                        # Clamp realistic bounds
                        v["speed"] = max(0, min(110, v["speed"]))

                        # -------------------------
                        # COORDINATE MOVEMENT
                        # -------------------------
                        step = (v["speed"] / 3600) * 0.009

                        heading_rad = math.radians(90 - v["heading"])
                        v["lat"] += math.sin(heading_rad) * step
                        v["lng"] += math.cos(heading_rad) * step

                        # -------------------------
                        # RESPAWN LOGIC
                        # -------------------------
                        dist = get_distance(
                            v["lat"], v["lng"],
                            CENTER_LAT, CENTER_LNG
                        )

                        if dist > ROAD_RADIUS + 0.001:

                            is_user = (v["vehicle_id"] == "USER_RUDRAKSH")

                            if is_user:
                                new_v = create_crossroad_vehicle("car", is_user=True)
                                user_dir = new_v["spawn_dir"]
                                vehicles[i] = new_v
                            else:
                                v_dir = user_dir if random.random() < 0.6 else None
                                vehicles[i] = create_crossroad_vehicle(
                                    v["type"],
                                    is_user=False,
                                    force_dir=v_dir
                                )

                        # -------------------------
                        # SEND TELEMETRY
                        # -------------------------
                        payload = {
                            "vehicle_id": v["vehicle_id"],
                            "lat": v["lat"],
                            "lng": v["lng"],
                            "speed": v["speed"],
                            "heading": v["heading"],
                            "type": v["type"]
                        }

                        await ws.send(json.dumps(payload))

                    # Simulation tick (2.5 FPS)
                    await asyncio.sleep(0.4)

        except Exception as e:
            print("⚠ Server disconnected. Reconnecting in 2 seconds...", e)
            await asyncio.sleep(2)


# ==========================================================
# ENTRY POINT
# ==========================================================

if __name__ == "__main__":
    asyncio.run(simulate())