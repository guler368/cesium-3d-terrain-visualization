# 🌐 3D Geospatial Visualization & Hybrid GIS Infrastructure

An advanced, high-performance Geographic Information System (GIS) application leveraging a hybrid edge-computing architecture. The system orchestrates containerized backend spatial engines (Nginx & MapServer) to deliver dynamic WMS layers and static 3D terrain assets, enabling real-time multi-layered terrain visualization and highly optimized client-side spatial analytics.

## 🏗️ 1. System Architecture & Component Breakdown

The application splits computational heavy-lifting and static file serving into two distinct phases using a decentralized approach:

[ Client Browser (CesiumJS) ]
│
├── (1) HTTP GET (Static .terrain Tiles) ──────► [ Nginx Server (Port 80) ]
│                                                     │ (Serves Pre-processed
│                                                        Quantized-Mesh from Disk)
│
├── (2) HTTP GET (WMS Map Tiles PNG) ──────────► [ MapServer CGI (Port 8080) ]
│                                                     │ (Renders on-the-fly via GDAL
│                                                        from raw GeoTIFF/Shapefiles)
│
└── (3) Local Evaluation (6 ms Lerp + Barycentric Interp)
[ Executed natively via Client CPU/GPU ]

### 🛰️ Backend Infrastructure (Docker Mesh)
* **Nginx (Port 80):** Serves pre-processed 3D Quantized-Mesh (`.terrain`) tiles and static KML overlays. It acts as a lightweight, lightning-fast static asset provider with no runtime compute load on the server side.
* **MapServer & GDAL Engine (Port 8080):** A native C++ compiled CGI map engine. It utilizes the **GDAL (Geospatial Data Abstraction Library)** layer to read raw physical rasters (`tr_raster`), Dresden vector datasets, and orthophotos on-the-fly, serving them as dynamic WMS (Web Map Service) PNG tiles.

### ⚡ Frontend Engine (Vite + React + TypeScript + CesiumJS)
* **Vite Developer Server (Port 5173):** Used during the active development phase to provide Hot Module Replacement (HMR) and manage internal ES modules/asset paths of the massive CesiumJS library.
* **CesiumJS Kernel:** A 3D WebGL graphics engine running in the browser. It coordinates camera rays, intercepts screen space events, and executes runtime spatial interpolation.

---

## 🔄 2. Frontend-Backend Data Interaction Model

The system explicitly avoids legacy server-side computing functions (such as MapServer's native `msRasterQueryByShape()`) to protect server hardware resources and maximize scalability. 

### The Runtime Workflow of Elevation Profile Analysis:
1.  **Input Capture:** The user triggers a `LEFT_CLICK` event on the Cesium canvas inside the Turkey bounding box coordinates ($26^\circ\text{–}45^\circ\text{ E}$, $36^\circ\text{–}42^\circ\text{ N}$).
2.  **Ray Casting:** The 2D screen coordinate is transformed into a 3D vector ray via `camera.getPickRay()` and intersected with the virtual globe surface to extract raw geographic coordinates (Latitude/Longitude).
3.  **Linear Interpolation (Lerp):** The frontend mathematically slices the great-circle path between Point 1 and Point 2 into **20 equidistant coordinates** using a custom `lerp()` algorithm.
4.  **Asynchronous Caching & Fetching:** CesiumJS queries its spatial **Quadtree index** to locate the exact tiles matching those 20 coordinates, requesting only the specific binary `.terrain` pieces from Nginx.
5.  **Edge Computation Success (~6 ms):** Once the binary mesh layers are cached into the browser RAM, the client machine's CPU executes **Barycentric Interpolation** across the 3D triangle nodes to compute sub-meter accurate profile elevations natively, bypassing the backend server entirely.

---

## 🛠️ 3. Installation & Deployment Guide

Follow these steps chronologically to spin up the entire ecosystem from a cold state.

### Prerequisites
Ensure your local machine has the following infrastructure installed:
* Docker & Docker Compose
* Node.js (v18+ recommended) & npm

### Step 1: Spin Up the Backend Infrastructure (Docker Containers)
Navigate to the root directory containing your `docker-compose.yml` file and launch the localized GIS data services in detached mode:
```bash
docker-compose up -d
