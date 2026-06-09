import { useEffect, useRef, useState } from 'react';
import { 
  Viewer, 
  WebMapServiceImageryProvider, 
  GeographicTilingScheme,       
  CesiumTerrainProvider, 
  Cartesian3,                   
  Math as CesiumMath, 
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  OpenStreetMapImageryProvider,
  KmlDataSource
} from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

function App() {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  
  const [coords, setCoords] = useState({ lon: '0.000000', lat: '0.000000', height: '0' });
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
            requestVertexNormals: true 
          });
        } catch (e) {
          console.warn("Yerel arazi yüklenemedi, düz dünya modeliyle devam ediliyor.");
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
          baseLayer: false, 
          terrainProvider: yerelTerrain 
        });

        viewer.scene.verticalExaggeration = exaggeration; 
        viewer.scene.verticalExaggerationRelativeHeight = 0.0;

        // Slider'ın takılmaması için referansı anında eşitliyoruz
        viewerRef.current = viewer;

        // =======================================================
        // 🗺️ KATMAN 2: ONLINE OSM ALTLIĞI
        // =======================================================
        const canlıOsmAltlik = new OpenStreetMapImageryProvider({
          url: 'https://a.tile.openstreetmap.org/',
          maximumLevel: 19
        });
        viewer.imageryLayers.addImageryProvider(canlıOsmAltlik);

        // =======================================================
        // 🏢 KATMAN 3: YEREL MAPSERVER WMS KATMANI (Bolu/Mihalıççık)
        // =======================================================
        const dresdenKatmanlari = new WebMapServiceImageryProvider({
          url: `http://${mevcutIP}:8080/`, 
          layers: 'dresden_raster,dresden_binalar,dresden_noktalar', 
          parameters: {
            map: '/etc/mapserver/harita.map',
            transparent: true, 
            format: 'image/png'
          },
          tilingScheme: new GeographicTilingScheme(),
          crs: 'EPSG:4326'
        });
        (dresdenKatmanlari as any).alpha = 0.6;
        viewer.imageryLayers.addImageryProvider(dresdenKatmanlari);

        // =======================================================
        // 🗺️ KATMAN 4: KML GROUND OVERLAY ENTEGRASYONU (Yeni Eklenen)
        // =======================================================
        try {
          // public/kml/kml-test.kml dosyasını asenkron şarj ediyoruz
          const kmlKatmani = await KmlDataSource.load('/kml/kml-test.kml', {
            camera: viewer.camera,
            canvas: viewer.scene.canvas
          });
          viewer.dataSources.add(kmlKatmani);
          console.log("KML ve PNG haritaya başarıyla enjekte edildi.");
        } catch (kmlError) {
          console.error("KML dosyası yüklenirken bir sorun çıktı:", kmlError);
        }
        
        // =======================================================
        // 🚀 KAMERAYI KML BÖLGESİNE (İSVİÇRE ALPLERİ) KİLİTLEME
        // =======================================================
        // KML sınırları: 8.43 - 9.14 Doğu / 46.65 - 46.77 Kuzey arasındaydı.
        // Tam ortalamak için kamerayı 8.78 Doğu, 46.71 Kuzey coğrafyasına dikiyoruz.
        viewer.camera.setView({
          // Antalya Kemer dağlarının tam üstü (30.30 Doğu, 36.60 Kuzey)
          destination: Cartesian3.fromDegrees(30.300000, 36.600000, 28000.0), // 28 km yukarısı
          orientation: {
              heading: CesiumMath.toRadians(0.0),   // Tam Kuzey bakış
              pitch: CesiumMath.toRadians(-30.0),  // Dağların şahlanışını görebilmek için -30 derece eğik açı
              roll: 0.0
          }
        });

        // =======================================================
        // 🎛️ FARE HAREKETLERİ VE COĞRAFİ ANALİZ
        // =======================================================
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: any) => {
          if (!viewer) return;

          const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
          if (cartesian) {
            const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
            const longitudeString = CesiumMath.toDegrees(cartographic.longitude).toFixed(6);
            const latitudeString = CesiumMath.toDegrees(cartographic.latitude).toFixed(6);
            
            const heightValue = viewer.scene.globe.getHeight(cartographic);
            const heightString = heightValue ? Math.round(heightValue).toLocaleString() : "0";

            setCoords({ 
              lon: longitudeString, 
              lat: latitudeString, 
              height: heightString 
            });
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        (viewer as any)._mouseHandler = handler;

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
      
      {/* Harita Sahnesi */}
      <div ref={cesiumContainerRef} id="cesiumContainer" style={{ width: '100%', height: '100%' }} />

      {/* Dikey Abartı (Slider) Paneli */}
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

      {/* CBS Koordinat Footer Bar */}
      <div style={{ 
        position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', 
        backgroundColor: 'rgba(23, 23, 23, 0.9)', color: '#fff', padding: '8px 20px', 
        borderRadius: '25px', display: 'flex', gap: '20px', fontSize: '13px', zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'sans-serif', pointerEvents: 'none'
      }}>
        <div><span style={{ color: '#9ca3af' }}>Longitude:</span> <span style={{ fontFamily: 'monospace' }}>{coords.lon}°</span></div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.2)', height: '14px', alignSelf: 'center' }} />
        <div><span style={{ color: '#9ca3af' }}>Latitude:</span> <span style={{ fontFamily: 'monospace' }}>{coords.lat}°</span></div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.2)', height: '14px', alignSelf: 'center' }} />
        <div><span style={{ color: '#3b82f6', fontWeight: 'bold' }}>HEIGHT:</span> <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{coords.height} m</span></div>
      </div>

    </div>
  );
}

export default App;