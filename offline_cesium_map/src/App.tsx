import { useEffect, useRef } from 'react';
import { Viewer, SingleTileImageryProvider, Rectangle, Ion } from 'cesium';

function App() {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    // Çevrimdışı mod: İyon tokenını kapat
    Ion.defaultAccessToken = '';

    // 1. Cesium Küresini başlat
    const viewer = new Viewer(cesiumContainerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      animation: false,
      timeline: false,

      skyBox: false,        // Arka plandaki uzay/yıldız resimlerini kapatır (İnternetten ion üzerinden çekilir)
      skyAtmosphere: false, // Dünyanın etrafındaki online atmosfer ışıklandırmasını kapatır
      creditContainer: document.createElement('div') // Sol alttaki "Cesium ion" logosunu ve telif yazılarını gizler
    });

    // 2. Bizim MapServer'dan tek parça resmi alan SingleTile sağlayıcısı
    const dogrudanResimKatmani = new SingleTileImageryProvider({
      url: 'http://localhost:8080/?map=/etc/mapserver/harita.map&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=dunya_altlik&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/png',
      rectangle: Rectangle.fromDegrees(-180, -90, 180, 90)
    });

    viewer.imageryLayers.addImageryProvider(dogrudanResimKatmani);

    viewer.camera.setView({
      destination: Rectangle.fromDegrees(-180, -90, 180, 90)
    });

    return () => {
      viewer.destroy();
    };
  }, []);

  return (
    <div 
      ref={cesiumContainerRef} 
      id="cesiumContainer"
      style={{ width: '100%', height: '100%', margin: 0, padding: 0 }} 
    />
  );
}

export default App;