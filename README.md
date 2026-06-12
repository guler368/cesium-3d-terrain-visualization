# 🌐 3D Geospatial Visualization & Hybrid GIS Infrastructure

An advanced, high-performance Geographic Information System (GIS) application leveraging a hybrid edge-computing architecture. The project encompasses a full-stack engineering pipeline: from offline server-side raster optimization (converting raw elevation TIFFs into highly compressed 3D Quantized-Mesh tiles via GDAL) to containerized runtime delivery (Nginx & MapServer) and instantaneous client-side spatial analytics.

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
* **Vite Dev Server (Port 3000):** Manages internal developer utilities, structural dependency trees, and hot module replacements for the frontend implementation.
* **CesiumJS Kernel:** A standalone WebGL graphics engine executing inside the client sandbox. It coordinates hardware vector layers, projects multi-dimensional camera coordinates, and dynamically processes spatial interpolation trees.

---

## ⚙️ 2. Data Pre-processing Pipeline (Offline Generation)

Before runtime deployment, raw geographical inputs undergo rigorous server-side extract-transform-load (ETL) pipelines using the **GDAL** ecosystem to transform flat rasters into structured 3D terrain pyramids.

### 🔹 Step 1: Raster Optimization via GDAL
The raw Digital Elevation Model (DEM) data, typically sourced as high-resolution GeoTIFFs, cannot be streamed efficiently in its raw state. GDAL utilities are executed natively to standardize the datasets:
* **Reprojection:** Transforming the native coordinate reference system (CRS) into global geographic coordinates (`EPSG:4326` WGS84) using `gdalwarp` to ensure seamless alignment with world ellipsoids.
* **Tiling Preparation:** Applying internal tiling, pixel-depth clamping, and no-data value masking via `gdal_translate` to prevent interpolation artifacts along coastal boundaries or sea-level data voids.

### 🔹 Step 2: Quantized-Mesh Tiling (The Terrain Builder)
Using a compiled C++ mesh pipeline (such as `cesium-terrain-builder`), the optimized GeoTIFF is sliced into a multi-resolution quadtree asset hierarchy:
* **Geometry Generation:** The flat pixel matrices (height grids) are converted into regular irregular 3D triangle networks (TIN - Triangulated Irregular Network).
* **Compression:** Vertices are quantized to 16-bit integers, and the mesh topology is compressed into binary `.terrain` files containing vertex arrays, index blocks, and normal vectors for native lighting/shading (`requestVertexNormals: true`).
* **Storage Hierarchy:** Files are indexed using the standard TMS (Tile Map Service) layout structured as `/terrain/{z}/{x}/{y}.terrain`, where `z` represents the Level of Detail (LOD) pyramid depth. Once generated, this entire tree structure is moved directly to the Nginx root directory for static serving.

---

## 🔄 3. Frontend-Backend Data Interaction Model

The system explicitly avoids legacy server-side computing functions (such as MapServer's native `msRasterQueryByShape()`) to protect server hardware resources and maximize scalability. 

### The Runtime Workflow of Elevation Profile Analysis:
1.  **Input Capture:** The user triggers a `LEFT_CLICK` event on the Cesium canvas inside the Turkey bounding box coordinates (26°–45° E, 36°–42° N).
2.  **Ray Casting:** The 2D screen coordinate is transformed into a 3D vector ray via `camera.getPickRay()` and intersected with the virtual globe surface to extract raw geographic coordinates (Latitude/Longitude).
3.  **Linear Interpolation (Lerp):** The frontend mathematically slices the great-circle path between Point 1 and Point 2 into **20 equidistant coordinates** using a custom `lerp()` algorithm.
4.  **Asynchronous Caching & Fetching:** CesiumJS queries its spatial **Quadtree index** to locate the exact tiles matching those 20 coordinates, requesting only the specific binary `.terrain` pieces from Nginx.
5.  **Edge Computation Success:** Once the binary mesh layers are cached into the browser RAM, the client machine's CPU executes **Barycentric Interpolation** across the 3D triangle nodes to compute sub-meter accurate profile elevations natively, bypassing the backend server entirely.

---

## 🛠️ 4. Installation & Deployment Guide

Follow these steps chronologically to spin up the entire ecosystem from a cold state.

### Prerequisites
Ensure your local machine has the following infrastructure installed:
* Docker & Docker Compose
* Node.js (v18+ recommended) & npm

### Step 1: Spin Up the Backend Infrastructure (Docker Containers)
Navigate to the root directory containing your `docker-compose.yml` file and launch the localized GIS data services in detached mode:
```bash
docker-compose up -d
