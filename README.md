# 🚗 NodeDrive
Real-Time Traffic Simulation & Hazard Detection Dashboard

NodeDrive is a real-time traffic monitoring and simulation system designed to visualize vehicle movement, detect collision risks, identify road hazards, and simulate urban traffic behavior.

The system combines a FastAPI backend, WebSocket telemetry streaming, and a TypeScript + Leaflet frontend dashboard to monitor vehicles in real time.

This project demonstrates how AI-inspired analytics, geospatial data, and live dashboards can be used for smart city traffic monitoring systems.

------------------------------------------------------------

🌐 LIVE DEMO

Frontend (Vercel)
https://nodedrive-git-main-rudraksh-hadas-projects.vercel.app

Backend API (Render)
https://nodedrive.onrender.com

------------------------------------------------------------

⚠️ DEPLOYMENT NOTE

This project is deployed using the free tiers of Vercel and Render.

Because the backend is hosted on Render's free plan, the server may go into sleep mode after inactivity. When this happens, the first request can take 30–60 seconds to wake the server.

After the initial wake-up, the application will respond normally.

If the dashboard appears slow on first load, please wait for the backend service to start.

------------------------------------------------------------

🧠 PROJECT OVERVIEW

NodeDrive simulates a live urban traffic system and streams vehicle telemetry to a dashboard where traffic conditions can be analyzed visually.

The system demonstrates:

• Vehicle telemetry streaming  
• Collision risk detection  
• Emergency vehicle priority zones  
• Road hazard reporting  
• Geospatial clustering of pothole reports  
• Smart city traffic visualization  

The dashboard displays vehicles moving in real time across a simulated city intersection while detecting risks and hazards dynamically.

------------------------------------------------------------

🧱 SYSTEM ARCHITECTURE

Simulator (Python)
        │
        │ WebSocket Telemetry
        ▼
FastAPI Backend
        │
        │ Collision Detection Engine
        │ Hazard Detection
        │ Distance Metrics
        ▼
WebSocket Broadcast
        │
        ▼
Frontend Dashboard
(TypeScript + Leaflet)

------------------------------------------------------------

📁 PROJECT STRUCTURE

NodeDrive
│
├── backend
│   ├── main.py
│   └── requirements.txt
│
├── simulator
│   └── simulator.py
│
├── frontend
│   ├── index.html
│   ├── main.ts
│   ├── styles.css
│   └── types.ts
│
└── README.md

------------------------------------------------------------

🖥 FRONTEND

The frontend dashboard is built using:

• TypeScript
• Leaflet.js
• CSS
• Vite build system

FEATURES

• Interactive real-time map  
• Vehicle markers with live telemetry  
• Collision alerts  
• Emergency vehicle detection  
• Hazard cluster visualization  
• Pothole reporting interface  
• User login UI  
• Light / Dark theme toggle  

------------------------------------------------------------

🎨 USER INTERFACE DESIGN

The interface contains three main components.

TOP NAVIGATION BAR

Displays:

• Project logo  
• Project name  
• Dashboard title  
• Logged-in user profile  
• Settings menu  

MAP VIEW

The map visualizes vehicle states using color-coded markers.

Blue marker     → Emergency vehicle  
Red marker      → Collision risk  
Yellow marker   → Hazard alert  
Green marker    → User vehicle  
Default marker  → Normal vehicle  

Emergency vehicles also display a blue proximity zone around them.

SYSTEM PANEL

The side panel displays:

• connection status  
• number of active vehicles  
• real-time alerts  
• pothole reporting button  

Users can manually submit pothole coordinates through the dashboard.

------------------------------------------------------------

⚙️ BACKEND

The backend is built using:

• Python
• FastAPI
• WebSockets

It processes live telemetry data and performs analytics including:

• collision detection
• hazard proximity detection
• hazard clustering
• telemetry broadcasting

------------------------------------------------------------

🧠 CORE ALGORITHMS

COLLISION DETECTION

The backend uses distance metrics and heading analysis to detect possible collisions.

Two vehicles are considered a collision risk when:

• Distance < 25 meters  
• Heading difference > 150°

Distance is calculated using the Haversine formula.

------------------------------------------------------------

HAZARD DETECTION

Vehicles detect potholes when they are within 30 meters of a hazard coordinate.

When detected:

• the vehicle receives a hazard alert
• the dashboard highlights the event

------------------------------------------------------------

HAZARD CLUSTERING

Multiple reports near the same coordinates are grouped together.

Cluster size determines hazard severity.

1 report      → small yellow marker  
2–3 reports   → orange marker  
4+ reports    → large red marker  

This mimics AI-style clustering used in urban infrastructure monitoring.

------------------------------------------------------------

🚗 TRAFFIC SIMULATION DESIGN

The traffic simulation intentionally introduces controlled chaotic behavior to mimic real-world traffic patterns.

Real drivers are unpredictable. They hesitate, accelerate randomly, ignore signals, or brake suddenly.

This simulator models that reality using probabilistic behavior patterns.

------------------------------------------------------------

⚡ SIMULATION MECHANICS

CONTROLLED DRIVER CHAOS

Some vehicles are randomly marked as rebel drivers.

Approximately 20% of vehicles behave unpredictably.

These vehicles may:

• ignore traffic signals
• accelerate suddenly
• brake randomly
• drift across lanes

This prevents traffic from appearing robotic.

------------------------------------------------------------

🚦 TRAFFIC LIGHT VARIABILITY

Drivers do not always follow signals perfectly.

Near intersections there is a 35% chance that drivers ignore red lights.

This creates occasional crossing conflicts and realistic intersection behavior.

------------------------------------------------------------

⏱ DRIVER REACTION DELAYS

Drivers sometimes hesitate before reacting.

Each simulation tick includes a small probability that a vehicle does nothing temporarily.

This models:

• distraction
• delayed reactions
• hesitation

------------------------------------------------------------

🚗 CAR FOLLOWING MODEL

Vehicles monitor the distance to cars ahead in the same lane.

Distance < 30m → emergency braking  
Distance < 60m → slow down  

This produces traffic queues and congestion waves.

------------------------------------------------------------

⚡ RANDOM ACCELERATION BURSTS

Some drivers accelerate aggressively to simulate impatient driving behavior.

------------------------------------------------------------

🛑 PANIC BRAKING

Near intersections vehicles may suddenly stop due to hesitation or confusion.

------------------------------------------------------------

↔ LANE JITTER

Vehicles drift slightly within their lanes to prevent perfectly straight robotic motion.

------------------------------------------------------------

🚑 EMERGENCY VEHICLE PRIORITY

Emergency vehicles:

• ignore most restrictions  
• maintain higher speeds  
• generate proximity zones  

Nearby vehicles react with yield alerts.

------------------------------------------------------------

🔄 DYNAMIC VEHICLE RESPAWNING

Vehicles leaving the simulation zone are respawned on new roads with randomized parameters.

This keeps traffic density stable and continuously introduces new behavior patterns.

------------------------------------------------------------

🎯 WHY CHAOTIC TRAFFIC?

The chaotic traffic model was intentionally designed to:

• avoid unrealistic robotic movement  
• simulate real urban traffic patterns  
• stress test the backend telemetry system  
• create unpredictable traffic flow  
• improve visualization realism  

This approach makes the simulation closer to real-world traffic systems.

------------------------------------------------------------

🔮 FUTURE IMPROVEMENTS

Possible extensions include:

• machine learning traffic prediction  
• real GPS telemetry integration  
• AI pothole detection using camera images  
• emergency vehicle route optimization  
• mobile app integration  
• traffic congestion heatmaps  

------------------------------------------------------------

👨‍💻 AUTHOR

Rudraksh Hada  
BTech Computer Science (AI & ML)
