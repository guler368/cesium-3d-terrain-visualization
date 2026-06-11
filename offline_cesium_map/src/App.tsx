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
  Math as CesiumMath, // 🟢 İsim çakışmasını önlemek için 'Math' objesini 'CesiumMath' olarak takma adla alıyoruz
  WebMapServiceImageryProvider,
  Cartographic
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

    const initializeCesium = async () => {
      try {
        // =======================================================
        // ⛰️ KATMAN 1: YEREL ARAZİ (TERRAIN) KATMANI
        // =======================================================
        let yerelTerrain;
        try {
          yerelTerrain = await CesiumTerrainProvider.fromUrl(`http://${mevcutIP}/terrain/`, {
            requestVertexNormals: true,
            tilingScheme: new GeographicTilingScheme()
          } as any);
          console.log("⛰️ Yerel Arazi (terrain_set) başarıyla hafızaya alındı!");
        } catch (e) {
          console.warn("Yerel arazi yüklenemedi, düz dünya modeliyle devam ediliyor.", e);
        }

        // =======================================================
        // 🌐 CESIUM VIEWER BAŞLATMA
        // =======================================================
        const viewer = new Viewer(cesiumContainerRef.current!, {
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          creditContainer: document.createElement('div'), 
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
        

        // =======================================================
        // 🏢 KATMAN 3: YEREL MAPSERVER WMS KATMANI
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
        // 🗺️ KATMAN 4: KML GROUND OVERLAY ENTEGRASYONU
        // =======================================================
        try {
          const kmlKatmani = await KmlDataSource.load('/kml/kml-test.kml', {
            camera: viewer.camera,
            canvas: viewer.scene.canvas
          });
          viewer.dataSources.add(kmlKatmani);
          console.log("KML ve PNG haritaya başarıyla enjekte edildi.");
        } catch (kmlError) {
          console.error("KML dosyası yüklenirken bir sorun çıktı:", kmlError);
        }

        // mouse activation
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
                
                // 🟢 PROFESYONEL FİLTRE: Türkiye dışındaki tüm negatifleri ve okyanus pürüzlerini 0'a kilitliyoruz
                heightString = rawHeight > 0 ? Math.round(rawHeight).toLocaleString() : "0";
              } else {
                heightString = "0"; 
              }
            } catch (error) {
              heightString = "0"; 
            }

            // 📺 Arayüz elementlerini güvenle güncelle
            const heightElement = document.getElementById("footer-height-val");
            if (heightElement) {
              heightElement.innerText = `${heightString} m`;
            }
            
            const latElement = document.getElementById("footer-lat-val");
            if (latElement) latElement.innerText = `${latitudeString}°`;
            
            const lonElement = document.getElementById("footer-lon-val");
            if (lonElement) lonElement.innerText = `${longitudeString}°`;
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);

      (viewer as any)._mouseHandler = handler;

      // camera.setView() çalışmıyor şuan
      /* viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(30.300000, 36.600000, 28000.0), // Antalya Kemer Dağları Üstü
        orientation: {
            heading: CesiumMath.toRadians(0.0),   
            pitch: CesiumMath.toRadians(-90.0),  
            roll: 0.0
        }
      }); */

      return viewer;
      } catch (error) {
        console.error("Cesium yüklenirken genel bir hata oluştu:", error);
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