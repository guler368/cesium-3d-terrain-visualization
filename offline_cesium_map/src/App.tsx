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
    const mevcutIP = window.location.hostname;

    // Local array to track the two clicks in memory without triggering re-renders
    const tiklananNoktalar: Cartographic[] = [];

    // Linear interpolation according to lat/lon then we will send these points to .terrain for height query
    const lerp = (p1: Cartographic, p2: Cartographic, noktaSayisi: number = 20): Cartographic[] => {
      const noktalar: Cartographic[] = [];
      for (let i = 0; i < noktaSayisi; i++) {
        const t = i / (noktaSayisi - 1); 
        const araLon = p1.longitude + (p2.longitude - p1.longitude) * t;
        const araLat = p1.latitude + (p2.latitude - p1.latitude) * t;
        noktalar.push(new Cartographic(araLon, araLat, 0));
      }
      return noktalar;
    };

    const initializeCesium = async () => {
      try {
        // =======================================================
        // ⛰️ LAYER 1: LOCAL TERRAIN LAYER
        // =======================================================
        let yerelTerrain;
        try {
          yerelTerrain = await CesiumTerrainProvider.fromUrl(`http://${mevcutIP}/terrain/`, {
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
          terrainProvider: yerelTerrain 
        });

        viewer.scene.verticalExaggeration = exaggeration; 
        viewer.scene.verticalExaggerationRelativeHeight = 0.0;

        viewerRef.current = viewer;

        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
        

        // =======================================================
        // 🏢 LAYER 3: LOCAL MAPSERVER WMS LAYER
        // =======================================================
        const dresdenKatmanlari = new WebMapServiceImageryProvider({
          url: `http://${mevcutIP}:8080/`, 
          layers: 'tr_raster,dresden_binalar,dresden_noktalar,sahil_ortofoto', 
          parameters: {
            map: '/etc/mapserver/harita.map',
            transparent: true, 
            format: 'image/png'
          },
          tilingScheme: new GeographicTilingScheme(),
          crs: 'EPSG:4326',
        });
        
        (dresdenKatmanlari as any).alpha = 1.0;
        viewer.imageryLayers.addImageryProvider(dresdenKatmanlari);

        // =======================================================
        // 🗺️ LAYER 4: KML GROUND OVERLAY INTEGRATION
        // =======================================================
        try {
          const kmlKatmani = await KmlDataSource.load('/kml/kml-test.kml', {
            camera: viewer.camera,
            canvas: viewer.scene.canvas
          });
          viewer.dataSources.add(kmlKatmani);
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
          if (tiklananNoktalar.length >= 2) {
            tiklananNoktalar.length = 0; 
            console.log("🧹 [STEP 4] Flushed previous points. Starting a new profile path selection.");
          }

          tiklananNoktalar.push(cartographic);
          const pNum = tiklananNoktalar.length;
          console.log(`📍 [STEP 4] Point ${pNum} stored in memory. (Current queue size: ${pNum}/2)`);

          // 🛑 STEP 5: Profile analysis trigger conditions
          if (tiklananNoktalar.length === 2) {
            //console.log("🚀 [STEP 5] Profile path completed! Initiating 20-point asynchronous .terrain analysis query...");
            
            const p1 = tiklananNoktalar[0];
            const p2 = tiklananNoktalar[1];
            
            const yirmiNokta = lerp(p1, p2, 20);
            //console.log("📐 [STEP 5.1] Generated 20 interpolated coordinates along the linear path.");

            const t0 = performance.now();

            try {
              console.log("⏳ [STEP 5.2] Request dispatched to sampleTerrainMostDetailed. Waiting for promise resolution...");
              const sonuclar = await Cesium.sampleTerrainMostDetailed( // barycentric interpolation
                viewer.terrainProvider, 
                yirmiNokta
              );
              //console.log("✅ [STEP 5.3] Asynchronous response resolved from local .terrain datasets!");

              const t1 = performance.now();
              const gecenSure = t1 - t0;
              const yukseklikler = sonuclar.map(n => n.height !== undefined ? Math.round(n.height) : 0);

              console.log(`==================================================`);
              console.log(`🏆 CLIENT-SIDE (EDGE COMPUTING) PROFILE METRICS`);
              console.log(`⏱️ Total Execution Time: ${gecenSure.toFixed(2)} ms`);
              console.log(`📊 Average Latency per Sample Point: ${(gecenSure / 20).toFixed(2)} ms`);
              console.log(`🗻 Interpolated Elevation Dataset (20 Points - Meters):`);
              console.log(JSON.stringify(yukseklikler));
              console.log(`==================================================`);

            } catch (err) {
              //console.error("[STEP 5 ERROR] sampleTerrainMostDetailed execution crashed:", err);
            }
          } else {
            //console.log("[STEP 5 SKIPPED] Stored point 1. Awaiting second point to run profile analysis.");
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