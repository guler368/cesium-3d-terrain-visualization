# 🌐 3D Geospatial Visualization & Hybrid GIS Infrastructure

An advanced, high-performance Geographic Information System (GIS) application leveraging a hybrid edge-computing architecture. The system orchestrates containerized backend spatial engines (Nginx & MapServer) to deliver dynamic WMS layers and static 3D terrain assets, enabling real-time multi-layered terrain visualization and highly optimized client-side spatial analytics.

---

## 🏗️ 1. System Architecture & Component Breakdown

The application decouples spatial data streaming from intensive analysis by splitting production loads into dedicated layers:

### 📡 Data Pipeline & Communication Flow
* **Static Asset Request:** The client browser requests pre-processed, static 3D geometry files directly via standard HTTP GET streams from the Nginx core layer.
* **Dynamic Imagery Request:** Map viewport movements trigger automated Web Map Service (WMS) tile demands, handled concurrently by the standalone C++ rendering engine.
* **Decentralized Evaluation:** Profiling actions trigger purely local algorithmic calculations. The system utilizes client-side hardware pipelines, completing the spatial lookup without hitting server application layers.

### 🛰️ Backend Infrastructure (Docker Container Mesh)
* **Nginx Server (Port 80):** Dedicated to high-throughput binary transmission. It serves static, pre-processed 3D Quantized-Mesh (`.terrain`) files and KML overlay configurations directly from persistent storage vectors, imposing zero runtime processing overhead on the host machine.
* **MapServer CGI & GDAL Engine (Port 8080):** A low-level, C++ compiled map production runtime. Backed natively by the **GDAL (Geospatial Data Abstraction Library)** binary layer, it queries multi-gigabyte source data (raw GeoTIFF rasters, Dresden structural footprints, and high-altitude orthophotos) on-the-fly, packaging them into compressed WMS layers.

### ⚡ Frontend Runtime (Vite + React + TypeScript + CesiumJS)
* **Vite Dev Server (Port 5173):** Manages internal developer utilities, structural dependency trees, and hot module replacements for the frontend implementation.
* **CesiumJS Kernel:** A standalone WebGL graphics engine executing inside the client sandbox. It reads hardware vector layers, projects multi-dimensional camera coordinates, and dynamically processes spatial interpolation trees.

---

## 🔄 2. Frontend-Backend Data Interaction Model

The system explicitly avoids legacy server-side computing functions (such as MapServer's native `msRasterQueryByShape()`) to protect server hardware resources and maximize scalability. 

### The Runtime Workflow of Elevation Profile Analysis:
1.  **Input Capture:** The user triggers a `LEFT_CLICK` event on the Cesium canvas inside the Turkey bounding box coordinates ($26^\circ\text{–}45^\circ\text{ E}$, $36^\circ\text{–}42^\circ\text{ N}$).
2.  **Ray Casting:** The 2D screen coordinate is transformed into a 3D vector ray via `camera.getPickRay()` and intersected with the virtual globe surface to extract raw geographic coordinates (Latitude/Longitude).
3.  **Linear Interpolation (Lerp):** The frontend mathematically slices the great-circle path between Point 1 and Point 2 into **20 equidistant coordinates** using a custom `lerp()` algorithm.
4.  **Asynchronous Caching & Fetching:** CesiumJS queries its spatial **Quadtree index** to locate the exact tiles matching those 20 coordinates, requesting only the specific binary `.terrain` pieces from Nginx.
5.  **Edge Computation Success:** Once the binary mesh layers are cached into the browser RAM, the client machine's CPU executes **Barycentric Interpolation** across the 3D triangle nodes to compute sub-meter accurate profile elevations natively, bypassing the backend server entirely.

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
