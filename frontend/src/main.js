import ThreeRenderer from './renderers/ThreeRenderer.js';
import MapRenderer from './renderers/MapRenderer.js';
import UIController from './controllers/UIController.js';
import { dataService } from './services/dataService.js';

class App {
  constructor() {
    this.threeRenderer = null;
    this.mapRenderer = null;
    this.uiController = null;
    
    this.init();
  }

  async init() {
    this.checkBackendHealth();
    this.initRenderers();
    this.initControllers();
    this.autoLoadSampleData();
  }

  async checkBackendHealth() {
    try {
      const health = await dataService.getHealth();
      console.log('后端状态:', health);
    } catch (error) {
      console.warn('后端连接失败，将使用前端模拟数据');
    }
  }

  initRenderers() {
    const threeContainer = document.getElementById('threeContainer');
    const mapContainer = document.getElementById('mapContainer');

    if (threeContainer) {
      this.threeRenderer = new ThreeRenderer(threeContainer);
    }

    if (mapContainer) {
      this.mapRenderer = new MapRenderer(mapContainer);
    }
  }

  initControllers() {
    if (this.threeRenderer && this.mapRenderer) {
      this.uiController = new UIController(this.threeRenderer, this.mapRenderer);
    }
  }

  async autoLoadSampleData() {
    setTimeout(async () => {
      try {
        await this.uiController?.loadSampleData();
      } catch (error) {
        console.error('自动加载示例数据失败:', error);
      }
    }, 1000);
  }

  destroy() {
    if (this.threeRenderer) {
      this.threeRenderer.destroy();
    }
    if (this.mapRenderer) {
      this.mapRenderer.destroy();
    }
    if (this.uiController) {
      this.uiController.destroy();
    }
  }
}

let app = null;

window.addEventListener('DOMContentLoaded', () => {
  app = new App();
});

window.addEventListener('beforeunload', () => {
  if (app) {
    app.destroy();
  }
});

export default App;
