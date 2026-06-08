import { useEffect, useRef, useState } from 'react';
import { 
  Viewer, 
  //WebMapServiceImageryProvider, 
  UrlTemplateImageryProvider, 
  //GeographicTilingScheme, 
  CesiumTerrainProvider, 
  Cartesian3, 
  Math as CesiumMath, 
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType
} from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

function App() {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null); // Slider'dan Cesium'a erişebilmek için referans
  
  // Alt bar (Footer) için koordinat ve yükseklik state'leri
  const [coords, setCoords] = useState({ lon: '0.000000', lat: '0.000000', height: '0' });
  // Dikey abartı katsayısı state'i (Varsayılan 1.0x - Gerçek boyut)
  const [exaggeration, setExaggeration] = useState(1.0);

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

    // Çevrimdışı/Bağımsız Mod: Cesium ion sunucularına zorunlu istek atılmasını engeller
    Ion.defaultAccessToken = '';

    const initializeCesium = async () => {
      try {
        // 1. Yerel Arazi (Terrain) Yüklemesi (Fiziksel data/ klasöründen okur)
        const yerelTerrain = await CesiumTerrainProvider.fromUrl('http://localhost/terrain/', {
          requestVertexNormals: true // Dağların ve vadilerin gölgelendirmelerini netleştirir
        });

        // 2. Cesium Viewer Başlatma
        const viewer = new Viewer(cesiumContainerRef.current!, {
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          creditContainer: document.createElement('div'), // Cesium logosunu gizler
          baseLayer: false, // Varsayılan online dünya uydusunu kapatarak siyah ekranı engeller
          terrainProvider: yerelTerrain // 3D arazi modelimizi küreye gömer
        });

        // --- BAŞLANGIÇ DİKEY ABARTI AYARI ---
        viewer.scene.verticalExaggeration = exaggeration; 

        // --- KATMAN SEÇENEKLERİ ---
        
        // SEÇENEK A: LOKAL MAPSERVER KATMANI (İsteğe bağlı çevrimdışı kullanım için)
        /*
        const yerelMapServerKatmani = new WebMapServiceImageryProvider({
          url: 'http://localhost:8080/',
          layers: 'dunya_altlik',
          parameters: {
            map: '/etc/mapserver/harita.map',
            transparent: false,
            format: 'image/png',
            styles: ''
          },
          tilingScheme: new GeographicTilingScheme(),
          crs: 'EPSG:4326'
        });
        viewer.imageryLayers.addImageryProvider(yerelMapServerKatmani);
        */

        // SEÇENEK B: ONLINE OPENSTREETMAP KATMANI (Şu an aktif olan detaylı altlık)
        const onlineOsmKatmani = new UrlTemplateImageryProvider({
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          subdomains: ['a', 'b', 'c']
        });
        viewer.imageryLayers.addImageryProvider(onlineOsmKatmani); 

        // 3. Kamera Başlangıç Odağı (Türkiye / Ankara semaları)
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(32.85, 39.93, 200000.0), // 200 km yükseklik
          orientation: {
            heading: CesiumMath.toRadians(0.0),
            pitch: CesiumMath.toRadians(-25.0), // Kamerayı 25 derece eğdik ki dağlar kabarsın
            roll: 0.0
          }
        });

        // 4. FARE HAREKETLERİNİ DİNLEME (Koordinat ve Canlı Yükseklik Analizi)
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        
        handler.setInputAction((movement: any) => {
          const ray = viewer.camera.getPickRay(movement.endPosition);
          if (!ray) return;
          
          // Işının 3D arazi (terrain) yüzeyiyle kesiştiği noktayı yakalar
          const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
          
          if (cartesian) {
            // Cartesian3 (X,Y,Z) koordinatını Coğrafi (Radyan) formata çevirir
            const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
            
            // Radyan değerlerini Derece cinsine dönüştürür (6 basamak hassasiyetle)
            const longitudeString = CesiumMath.toDegrees(cartographic.longitude).toFixed(6);
            const latitudeString = CesiumMath.toDegrees(cartographic.latitude).toFixed(6);
            
            // O koordinattaki arazinin anlık yüksekliğini (metre) çeker
            const heightValue = viewer.scene.globe.getHeight(cartographic);
            const heightString = heightValue ? Math.round(heightValue).toLocaleString() : "0";

            // Footer barı besleyen state'i günceller
            setCoords({
              lon: longitudeString,
              lat: latitudeString,
              height: heightString
            });
          }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        // Handler nesnesini temizlik aşamasında yok edebilmek için viewer'a bağlıyoruz
        (viewer as any)._mouseHandler = handler;
        // Viewer nesnesini yukarıdaki slider fonksiyonunun erişebilmesi için ref'e atıyoruz
        viewerRef.current = viewer;

        return viewer;
      } catch (error) {
        console.error("Cesium yüklenirken hata oluştu:", error);
      }
    };

    const viewerPromise = initializeCesium();

    // Cleanup: Bileşen ekrandan kalktığında hafızayı temizler ve kilitlenmeleri önler
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

      {/* --- ESTETİK DİNAMİK DİKEY ABARTI PANELİ (Sol Üst) --- */}
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
        pointerEvents: 'none', // Tıklamaları arkadaki haritaya geçirir
        zIndex: 1000
      }}>
        <div>
          <span style={{ color: '#9ca3af', marginRight: '4px' }}>Latitude:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{coords.lon}°</span>
        </div>
        <div style={{ width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)', height: '14px', alignSelf: 'center' }} />
        <div>
          <span style={{ color: '#9ca3af', marginRight: '4px' }}>Longitude:</span>
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