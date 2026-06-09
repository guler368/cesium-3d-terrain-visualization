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
  OpenStreetMapImageryProvider
} from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

function App() {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null); // Slider'dan Cesium'a erişebilmek için referans
  
  // Alt bar (Footer) için koordinat ve yükseklik state'leri
  const [coords, setCoords] = useState({ lon: '0.000000', lat: '0.000000', height: '0' });
  // Dikey abartı katsayısı state'i (Varsayılan 2.0x)
  const [exaggeration, setExaggeration] = useState(2.0); 

  // Sol üstteki slider kaydırıldığında arazinin yüksekliğini dinamik değiştiren fonksiyon
  const handleExaggerationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setExaggeration(value);
    
    if (viewerRef.current) {
      // Cesium sahnesindeki arazinin dikey abartı katsayısını anlık günceller
      viewerRef.current.scene.verticalExaggeration = value;
    }
  };

  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    // Çevrimdışı/Bağımsız Mod
    Ion.defaultAccessToken = ''; 
    const mevcutIP = window.location.hostname;

    const initializeCesium = async () => { // async = bu fonksiyon internetteki kaynaklara erişmeye çalışırken bekleme yapacak.
      try {
        // 1. Yerel Arazi (Terrain) Yüklemesi (Dinamik IP üzerinden)
        let yerelTerrain;
        try {
          yerelTerrain = await CesiumTerrainProvider.fromUrl(`http://${mevcutIP}/terrain/`, {
            requestVertexNormals: true 
          });
        } catch (e) {
          console.warn("Yerel arazi yüklenemedi, düz dünya modeliyle devam ediliyor.");
        }

        // 2. Cesium Viewer Başlatma
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

        // --- BAŞLANGIÇ DİKEY ABARTI AYARI ---
        viewer.scene.verticalExaggeration = exaggeration; 
        viewer.scene.verticalExaggerationRelativeHeight = 0.0;

        // 🚨 SLIDER'I KURTARAN KRİTİK HAMLE: 
        // Viewer doğar doğmaz referansı hemen en tepede eşitliyoruz ki slider asenkron yüklere takılmasın.
        viewerRef.current = viewer;

        // --- KATMAN SEÇENEKLERİ ---
        
        // KATMAN A: ONLINE OPENSTREETMAP KATMANI (İnternet altlığı)
        const canlıOsmAltlik = new OpenStreetMapImageryProvider({
          url: 'https://a.tile.openstreetmap.org/',
          maximumLevel: 19
        });
        viewer.imageryLayers.addImageryProvider(canlıOsmAltlik);

        // KATMAN B: YEREL MAPSERVER WMS KATMANI (GeoTIFF + Vektörler)
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
        
        // OSM altlığıyla paftayı bir arada görmek için %60 opaklık (alpha)
        (dresdenKatmanlari as any).alpha = 0.6;
        viewer.imageryLayers.addImageryProvider(dresdenKatmanlari);
        
        // 3. Kamera Başlangıç Odağı (GeoTIFF Paftasının Merkezi - Bolu/Mihalıççık)
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(31.750000, 39.750000, 95000.0),
          orientation: {
              heading: CesiumMath.toRadians(0.0),   
              pitch: CesiumMath.toRadians(-25.0),  // 25 derece eğik bakış (dağların kabarmasını görmek için)
              roll: 0.0
          }
        });

        // 4. FARE HAREKETLERİNİ DİNLEME (Tamir Edilmiş Garantili Koordinat Analizi)
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: any) => {
          if (!viewer) return;

          // Matematiksel elipsoid üzerinden kesin koordinat okuma (Offline modda 0'a düşmeyi engeller)
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

    // Cleanup
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
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, position: 'relative', overflow: 'hidden' }}>
      
      {/* Cesium Harita Alanı */}
      <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* --- ESTETİK DİNAMİK DİKEY ABARTI PANELİ (Sol Üst) --- */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        backgroundColor: 'rgba(23, 23, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        color: '#f3f4f6',
        padding: '14px 20px',
        borderRadius: '12px',
        fontFamily: '"SF Pro Display", -apple-system, sans-serif',
        fontSize: '13px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '200px'
      }}>
        <div style={{ display: 'flex', fontWeight: 600, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Vertical Exaggeration</span>
          <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>{exaggeration.toFixed(1)}x</span>
        </div>
        <input 
          type="range" 
          min="1.0" 
          max="5.0" 
          step="0.5" 
          value={exaggeration} 
          onChange={handleExaggerationChange}
          style={{
            width: '100%',
            accentColor: '#3b82f6',
            cursor: 'pointer'
          }}
        />
        <span style={{ fontSize: '10px', color: '#9ca3af' }}>Up to 5x.</span>
      </div>

      {/* --- ESTETİK CBS FOOTER BAR (Alt Orta) --- */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(23, 23, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        color: '#f3f4f6',
        padding: '6px 18px',
        borderRadius: '20px',
        fontFamily: '"SF Pro Display", -apple-system, sans-serif',
        fontSize: '12px',
        fontWeight: 500,
        display: 'flex',
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        pointerEvents: 'none', 
        zIndex: 1000
      }}>
        <div>
          <span style={{ color: '#9ca3af', marginRight: '4px' }}>Longitude:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{coords.lon}°</span>
        </div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)', height: '14px', alignSelf: 'center' }} />
        <div>
          <span style={{ color: '#9ca3af', marginRight: '4px' }}>Latitude:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{coords.lat}°</span>
        </div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)', height: '14px', alignSelf: 'center' }} />
        <div>
          <span style={{ color: '#3b82f6', marginRight: '4px', fontWeight: 600 }}>HEIGHT:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#60a5fa' }}>{coords.height} m</span>
        </div>
      </div>

    </div>
  );
}

export default App;