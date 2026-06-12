import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { 
  Viewer, 
  GeographicTilingScheme,       
  CesiumTerrainProvider, 
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  OpenStreetMapImageryProvider,
  KmlDataSource,
  ImageryLayer,
  Math as CesiumMath, 
  WebMapServiceImageryProvider,
  Cartographic,
  Cartesian3
} from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

function App() {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  
  const [exaggeration, setExaggeration] = useState(2.0); 

  const handleExaggerationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setExaggeration(value);
    if (viewerRef.current) {
      viewerRef.current.scene.verticalExaggeration = value;
    }
  };

  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    Ion.defaultAccessToken = ''; 
    const currentIP = window.location.hostname;

    // Local array to track the two clicks in memory without triggering re-renders
    const clickedPoints: Cartographic[] = [];

    // Local array to keep track of drawing entities (points and polylines) for clean-up
    const drawnEntitiesList: Cesium.Entity[] = [];

    // Linear interpolation according to lat/lon then we will send these points to .terrain for height query
    const lerp = (p1: Cartographic, p2: Cartographic, pointCount: number = 20): Cartographic[] => {
      const points: Cartographic[] = [];
      for (let i = 0; i < pointCount; i++) {
        const t = i / (pointCount - 1); 
        const intermediateLon = p1.longitude + (p2.longitude - p1.longitude) * t;
        const intermediateLat = p1.latitude + (p2.latitude - p1.latitude) * t;
        points.push(new Cartographic(intermediateLon, intermediateLat, 0));
      }
      return points;
    };

    // Helper function to flush previous visual path entities from the globe
    const clearOldDrawings = (viewerInstance: Viewer) => {
      drawnEntitiesList.forEach(entity => viewerInstance.entities.remove(entity));
      drawnEntitiesList.length = 0;
    };

    const initializeCesium = async () => {
      try {
        // =======================================================
        // ⛰️ LAYER 1: LOCAL TERRAIN LAYER
        // =======================================================
        let localTerrainProvider;
        try {
          // Nginx altındaki /terrain/ klasör yolumuz aynı kalıyor çünkü Docker mountu bunu /data/terrain altına eşitledi
          localTerrainProvider = await CesiumTerrainProvider.fromUrl(`http://${currentIP}/terrain/`, {
            requestVertexNormals: true,
            tilingScheme: new GeographicTilingScheme()
          } as any);
          console.log("⛰️ Local terrain provider successfully loaded into memory!");
        } catch (e) {
          console.warn("Local terrain provider failed to load, falling back to ellipsoid model.", e);
        }

        // =======================================================
        // 🌐 CESIUM VIEWER INITIALIZATION
        // =======================================================
        const viewer = new Viewer(cesiumContainerRef.current!, {
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          infoBox: false,
          baseLayer: new ImageryLayer(
            new OpenStreetMapImageryProvider({
              url : 'https://a.tile.openstreetmap.org/',
            })
          ), 
          terrainProvider: localTerrainProvider 
        });

        viewer.scene.verticalExaggeration = exaggeration; 
        viewer.scene.verticalExaggerationRelativeHeight = 0.0;

        viewerRef.current = viewer;

        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
        

        // =======================================================
        // 🏢 LAYER 3: LOCAL MAPSERVER WMS LAYER
        // =======================================================
        const dresdenWmsLayers = new WebMapServiceImageryProvider({
          url: `http://${currentIP}:8080/`, 
          layers: 'tr_raster,dresden_binalar,dresden_noktalar,sahil_ortofoto', 
          parameters: {
            // ✅ DEĞİŞEN KISIM: harita.map dosyasının yeni konteyner içi mutlak adresini verdik!
            map: '/etc/mapserver/volumes/mapfiles/harita.map',
            transparent: true, 
            format: 'image/png'
          },
          tilingScheme: new GeographicTilingScheme(),
          crs: 'EPSG:4326',
        });
        
        (dresdenWmsLayers as any).alpha = 1.0;
        viewer.imageryLayers.addImageryProvider(dresdenWmsLayers);

        // =======================================================
        // 🗺️ LAYER 4: KML GROUND OVERLAY INTEGRATION
        // =======================================================
        try {
          const kmlLayer = await KmlDataSource.load('/kml/kml-test.kml', {
            camera: viewer.camera,
            canvas: viewer.scene.canvas
          });
          viewer.dataSources.add(kmlLayer);
          console.log("KML and PNG ground overlay successfully injected into map.");
        } catch (kmlError) {
          console.error("Error occurred while loading KML file:", kmlError);
        }

        // =======================================================
        // 🎛️ MOUSE MOVEMENTS (MOUSE_MOVE) - HOVER STATE
        // =======================================================
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction(async (movement: any) => {
          const ray = viewer.camera.getPickRay(movement.endPosition);
          const cartesian = viewer.scene.globe.pick(ray!, viewer.scene);

          if (Cesium.defined(cartesian)) {
            const cartographic = Cartographic.fromCartesian(cartesian);
            
            const longitudeString = CesiumMath.toDegrees(cartographic.longitude).toFixed(6);
            const latitudeString = CesiumMath.toDegrees(cartographic.latitude).toFixed(6);
            
            let heightString = "0"; 

            try {
              const updatedPositions = await Cesium.sampleTerrainMostDetailed(
                viewer.terrainProvider, 
                [cartographic]
              );
              
              if (updatedPositions && updatedPositions[0] && updatedPositions[0].height !== undefined) {
                const rawHeight = updatedPositions[0].height;
                heightString = rawHeight > 0 ? Math.round(rawHeight).toLocaleString() : "0";
              } else {
                heightString = "0"; 
              }
            } catch (error) {
              heightString = "0"; 
            }

            const heightElement = document.getElementById("footer-height-val");
            if (heightElement) heightElement.innerText = `${heightString} m`;
            
            const latElement = document.getElementById("footer-lat-val");
            if (latElement) latElement.innerText = `${latitudeString}°`;
            
            const lonElement = document.getElementById("footer-lon-val");
            if (lonElement) lonElement.innerText = `${longitudeString}°`;
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        // Debugging / Performance Measurement
        console.log("🛠️ DEBUG: Initializing LEFT_CLICK handler...");

        handler.setInputAction(async (click: any) => {
          // 🛑 STEP 1: Event captured
          console.log("🔍 [STEP 1] Map click detected! Screen coordinates (x, y):", click.position);

          const ray = viewer.camera.getPickRay(click.position);
          if (!ray) {
            console.log("❌ [STEP 1.5] GetPickRay failed, unable to cast ray.");
            return;
          }

          const cartesian = viewer.scene.globe.pick(ray, viewer.scene);

          // 🛑 STEP 2: Globe intersection check
          if (!Cesium.defined(cartesian)) {
            console.log("❌ [STEP 2] Ray cast into outer space, no globe intersection found.");
            return;
          }
          console.log("✅ [STEP 2] Ray successfully intersected with the globe (Cartesian3 coordinates generated).");

          const cartographic = Cartographic.fromCartesian(cartesian);
          const clickLon = CesiumMath.toDegrees(cartographic.longitude);
          const clickLat = CesiumMath.toDegrees(cartographic.latitude);
          console.log(`🌍 [STEP 2.5] Transformed Coordinates -> Lon: ${clickLon.toFixed(4)}, Lat: ${clickLat.toFixed(4)}`);

          // 🛑 STEP 3: Geographic bounding box constraint (Turkey bounds filter)
          console.log("⏳ [STEP 3] Validating geographic bounds...");
          if (clickLon < 26.0 || clickLon > 45.0 || clickLat < 36.0 || clickLat > 42.0) {
            console.warn(`❌ [STEP 3 FAILED] Out of bounds! Click position is outside Turkey. Lon: ${clickLon.toFixed(2)}, Lat: ${clickLat.toFixed(2)}`);
            return; 
          }
          console.log("✅ [STEP 3 PASSED] Geographic bounds validated. Position is within Turkey.");
          
          // 🛑 STEP 4: Memory management for the polyline points
          if (clickedPoints.length >= 2) {
            clickedPoints.length = 0; 
            console.log("🧹 [STEP 4] Flushed previous points. Starting a new profile path selection.");
            // Wipe out the old polyline and point entities from the globe scene
            clearOldDrawings(viewer);
          }

          clickedPoints.push(cartographic);
          const pointNumber = clickedPoints.length;
          console.log(`📍 [STEP 4] Point ${pointNumber} stored in memory. (Current queue size: ${pointNumber}/2)`);

          // Draw the clicked pinpoint marker onto the globe surface
          const pinpointEntity = viewer.entities.add({
            position: Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height + 10),
            point: {
              pixelSize: 10,
              color: Cesium.Color.RED, 
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY 
            }
          });
          drawnEntitiesList.push(pinpointEntity);

          // 🛑 STEP 5: Profile analysis trigger conditions
          if (clickedPoints.length === 2) {
            console.log("🚀 [STEP 5] Profile path completed! Initiating 20-point asynchronous .terrain analysis query...");
            
            const p1 = clickedPoints[0];
            const p2 = clickedPoints[1];
            
            // Draw a vibrant line directly connecting the two clicked samples
            const polylineEntity = viewer.entities.add({
              polyline: {
                positions: [
                  Cartesian3.fromRadians(p1.longitude, p1.latitude, p1.height + 10),
                  Cartesian3.fromRadians(p2.longitude, p2.latitude, p2.height + 10)
                ],
                width: 4,
                material: Cesium.Color.RED, 
                clampToGround: true // Ensures the polyline hugs mountains, ridges, and valleys smoothly
              }
            });
            drawnEntitiesList.push(polylineEntity);

            const interpolatedPoints = lerp(p1, p2, 20);
            console.log("📐 [STEP 5.1] Generated 20 interpolated coordinates along the linear path.");

            const startTime = performance.now();

            try {
              console.log("⏳ [STEP 5.2] Request dispatched to sampleTerrainMostDetailed. Waiting for promise resolution...");
              const elevationResults = await Cesium.sampleTerrainMostDetailed(
                viewer.terrainProvider, 
                interpolatedPoints
              );
              console.log("✅ [STEP 5.3] Asynchronous response resolved from local .terrain datasets!");

              const endTime = performance.now();
              const executionTime = endTime - startTime;
              const extractedHeights = elevationResults.map(n => n.height !== undefined ? Math.round(n.height) : 0);

              console.log(`==================================================`);
              console.log(`🏆 CLIENT-SIDE (EDGE COMPUTING) PROFILE METRICS`);
              console.log(`⏱️ Total Execution Time: ${executionTime.toFixed(2)} ms`);
              console.log(`📊 Average Latency per Sample Point: ${(executionTime / 20).toFixed(2)} ms`);
              console.log(`| Interpolated Elevation Dataset (20 Points - Meters):`);
              console.log(JSON.stringify(extractedHeights));
              console.log(`==================================================`);

            } catch (err) {
              console.error("❌ [STEP 5 ERROR] sampleTerrainMostDetailed execution crashed:", err);
            }
          } else {
            console.log("ℹ️ [STEP 5 SKIPPED] Stored point 1. Awaiting second point to run profile analysis.");
          }
        }, ScreenSpaceEventType.LEFT_CLICK);

        console.log("🛠️ DEBUG: LEFT_CLICK handler successfully registered.");

        return viewer;
      } catch (error) {
        console.error("Fatal error occurred during Cesium initialization:", error);
      }
    };

    const viewerPromise = initializeCesium();

    return () => {
      viewerPromise.then(v => {
        if (v) {
          if ((v as any)._mouseHandler) (v as any)._mouseHandler.destroy();
          v.destroy();
        }
      });
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      
      <div ref={cesiumContainerRef} id="cesiumContainer" style={{ width: '100%', height: '100%' }} />

      <div style={{ 
        position: 'absolute', top: '20px', left: '20px', backgroundColor: 'rgba(23, 23, 23, 0.9)', 
        color: '#fff', padding: '15px', borderRadius: '10px', zIndex: 1000, width: '220px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'sans-serif', fontSize: '13px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontWeight: 600 }}>
          <span>Terrain Exaggeration</span>
          <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>{exaggeration.toFixed(1)}x</span>
        </div>
        <input 
          type="range" 
          min="1.0" 
          max="5.0" 
          step="0.5" 
          value={exaggeration} 
          onChange={handleExaggerationChange} 
          style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }} 
        />
      </div>

      <div style={{ 
        position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', 
        backgroundColor: 'rgba(23, 23, 23, 0.9)', color: '#fff', padding: '8px 20px', 
        borderRadius: '25px', display: 'flex', gap: '20px', fontSize: '13px', zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'sans-serif', pointerEvents: 'none'
      }}>
        <div><span style={{ color: '#9ca3af' }}>Longitude:</span> <span id="footer-lon-val" style={{ fontFamily: 'monospace' }}>0.000000°</span></div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.2)', height: '14px', alignSelf: 'center' }} />
        <div><span style={{ color: '#9ca3af' }}>Latitude:</span> <span id="footer-lat-val" style={{ fontFamily: 'monospace' }}>0.000000°</span></div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.2)', height: '14px', alignSelf: 'center' }} />
        <div><span style={{ color: '#3b82f6', fontWeight: 'bold' }}>HEIGHT:</span> <span id="footer-height-val" style={{ fontFamily: 'monospace', color: '#60a5fa' }}>0 m</span></div>
      </div>

    </div>
  );
}

export default App;