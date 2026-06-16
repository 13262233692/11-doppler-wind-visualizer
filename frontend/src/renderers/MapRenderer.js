import L from 'leaflet';

class MapRenderer {
  constructor(container) {
    this.container = container;
    this.map = null;
    this.radarMarker = null;
    this.dataBounds = null;
    
    this.init();
  }

  init() {
    this.map = L.map(this.container, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(this.map);

    L.circle([39.9042, 116.4074], {
      color: '#4facfe',
      fillColor: '#4facfe',
      fillOpacity: 0.3,
      radius: 50000,
      weight: 2,
    }).addTo(this.map);

    this.map.setView([39.9042, 116.4074], 9);
  }

  updateRadarLocation(location, bounds) {
    if (!location) return;

    const { lat, lon } = location;

    if (this.radarMarker) {
      this.map.removeLayer(this.radarMarker);
    }

    const radarIcon = L.divIcon({
      className: 'radar-marker',
      html: `
        <div style="
          width: 24px;
          height: 24px;
          background: radial-gradient(circle, #4facfe 0%, #00f2fe 100%);
          border-radius: 50%;
          border: 3px solid #fff;
          box-shadow: 0 2px 8px rgba(79, 172, 254, 0.6);
          animation: pulse 2s ease-in-out infinite;
        "></div>
        <style>
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
          }
        </style>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    this.radarMarker = L.marker([lat, lon], { icon: radarIcon }).addTo(this.map);
    this.radarMarker.bindPopup(`
      <div style="font-family: inherit; padding: 4px;">
        <strong style="color: #4facfe;">📍 雷达位置</strong><br>
        纬度: ${lat.toFixed(4)}<br>
        经度: ${lon.toFixed(4)}
      </div>
    `);

    if (bounds) {
      this.dataBounds = L.rectangle([
        [lat - 0.3, lon - 0.3],
        [lat + 0.3, lon + 0.3]
      ], {
        color: '#4facfe',
        fillColor: '#4facfe',
        fillOpacity: 0.1,
        weight: 1,
        dashArray: '5, 5',
      }).addTo(this.map);
    }

    this.map.setView([lat, lon], 9);
  }

  clearData() {
    if (this.radarMarker) {
      this.map.removeLayer(this.radarMarker);
      this.radarMarker = null;
    }
    if (this.dataBounds) {
      this.map.removeLayer(this.dataBounds);
      this.dataBounds = null;
    }
  }

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}

export default MapRenderer;
