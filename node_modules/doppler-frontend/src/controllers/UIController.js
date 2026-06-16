import { dataService } from '../services/dataService.js';

class UIController {
  constructor(threeRenderer, mapRenderer) {
    this.threeRenderer = threeRenderer;
    this.mapRenderer = mapRenderer;
    
    this.currentDataType = 'velocity';
    this.threshold = 25;
    this.opacity = 0.6;
    
    this.elements = {};
    this.debounceTimer = null;
    
    this.init();
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.setupRendererCallbacks();
    this.updateStatus('就绪 - 请加载数据开始分析');
  }

  cacheElements() {
    this.elements = {
      loadSampleBtn: document.getElementById('loadSampleBtn'),
      fileInput: document.getElementById('fileInput'),
      thresholdSlider: document.getElementById('thresholdSlider'),
      thresholdValue: document.getElementById('thresholdValue'),
      opacitySlider: document.getElementById('opacitySlider'),
      opacityValue: document.getElementById('opacityValue'),
      showWireframe: document.getElementById('showWireframe'),
      showAxes: document.getElementById('showAxes'),
      autoRotate: document.getElementById('autoRotate'),
      radarInfo: document.getElementById('radarInfo'),
      statusContent: document.getElementById('statusContent'),
      progressBar: document.getElementById('progressBar'),
      progressFill: document.getElementById('progressFill'),
      progressText: document.getElementById('progressText'),
      typeButtons: document.querySelectorAll('[data-type]'),
    };
  }

  bindEvents() {
    this.elements.loadSampleBtn.addEventListener('click', () => this.loadSampleData());
    
    this.elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFile(e.target.files[0]);
      }
    });

    this.elements.thresholdSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.threshold = value;
      this.elements.thresholdValue.textContent = value;
      this.debouncedExtract();
    });

    this.elements.opacitySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.opacity = value;
      this.elements.opacityValue.textContent = value.toFixed(1);
      this.threeRenderer.setOpacity(value);
    });

    this.elements.showWireframe.addEventListener('change', (e) => {
      this.threeRenderer.setWireframeVisible(e.target.checked);
    });

    this.elements.showAxes.addEventListener('change', (e) => {
      this.threeRenderer.setAxesVisible(e.target.checked);
    });

    this.elements.autoRotate.addEventListener('change', (e) => {
      this.threeRenderer.setAutoRotate(e.target.checked);
    });

    this.elements.typeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (type !== this.currentDataType) {
          this.setDataType(type);
        }
      });
    });
  }

  setupRendererCallbacks() {
    this.threeRenderer.setProgressCallback((progress) => {
      this.showProgress(progress);
    });

    this.threeRenderer.setCompleteCallback((metadata) => {
      this.hideProgress();
      if (metadata) {
        this.updateStatus(`✅ 等值面提取完成 - ${metadata.generatedTriangles} 个三角形, 阈值 ${metadata.threshold} ${metadata.isVelocity ? 'm/s' : 'dBZ'}`);
      }
    });
  }

  setDataType(type) {
    this.currentDataType = type;
    
    this.elements.typeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    if (type === 'velocity') {
      this.elements.thresholdSlider.min = 0;
      this.elements.thresholdSlider.max = 50;
      this.elements.thresholdSlider.step = 1;
      this.elements.thresholdSlider.value = 25;
      this.threshold = 25;
      this.elements.thresholdValue.textContent = '25';
    } else {
      this.elements.thresholdSlider.min = 0;
      this.elements.thresholdSlider.max = 60;
      this.elements.thresholdSlider.step = 1;
      this.elements.thresholdSlider.value = 30;
      this.threshold = 30;
      this.elements.thresholdValue.textContent = '30';
    }

    this.extractIsosurface();
  }

  async loadSampleData() {
    this.updateStatus('⏳ 正在加载示例数据...');
    this.showProgress(0);

    try {
      const data = await dataService.getSampleData();
      this.handleDataLoaded(data);
    } catch (error) {
      this.updateStatus(`❌ 加载失败: ${error.message}`);
      this.hideProgress();
    }
  }

  async uploadFile(file) {
    if (!file.name.endsWith('.nc')) {
      this.updateStatus('❌ 请上传 .nc 格式的 NetCDF 文件');
      return;
    }

    this.updateStatus(`⏳ 正在上传文件: ${file.name}...`);
    this.showProgress(0);

    try {
      const result = await dataService.uploadFile(file);
      this.updateStatus('⏳ 文件上传成功，正在处理数据...');
      
      if (result.dimensions) {
        const filePath = result.filePath || file.name;
        const processedData = await dataService.processData(filePath);
        this.handleDataLoaded(processedData);
      } else {
        this.handleDataLoaded(result);
      }
    } catch (error) {
      this.updateStatus(`❌ 文件处理失败: ${error.message}`);
      this.hideProgress();
    }
  }

  handleDataLoaded(data) {
    this.hideProgress();
    
    this.updateRadarInfo(data.metadata);
    this.mapRenderer.updateRadarLocation(data.metadata?.location, data.bounds);
    
    this.updateStatus(`✅ 数据加载完成 - ${data.gridDimensions.nx}×${data.gridDimensions.ny}×${data.gridDimensions.nz} 网格`);
    
    setTimeout(() => {
      this.extractIsosurface();
    }, 500);
  }

  extractIsosurface() {
    const gridData = this.currentDataType === 'velocity' 
      ? dataService.getVelocityGrid() 
      : dataService.getReflectivityGrid();
    
    const gridDimensions = dataService.getGridDimensions();
    const bounds = dataService.getBounds();

    if (!gridData || !gridDimensions || !bounds) {
      this.updateStatus('⚠️ 请先加载数据');
      return;
    }

    this.updateStatus(`⏳ 正在提取等值面 (阈值: ${this.threshold} ${this.currentDataType === 'velocity' ? 'm/s' : 'dBZ'})...`);
    this.showProgress(0);

    this.threeRenderer.extractIsosurface(
      gridData,
      gridDimensions,
      bounds,
      this.threshold,
      this.currentDataType === 'velocity'
    );
  }

  debouncedExtract() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.extractIsosurface();
    }, 300);
  }

  updateRadarInfo(metadata) {
    if (!metadata) {
      this.elements.radarInfo.innerHTML = '<p class="info-empty">请先加载数据</p>';
      return;
    }

    const scanTime = metadata.scanTime 
      ? new Date(metadata.scanTime).toLocaleString('zh-CN')
      : '未知';

    this.elements.radarInfo.innerHTML = `
      <p><strong>雷达名称:</strong> ${metadata.radarName || '未知'}</p>
      <p><strong>纬度:</strong> ${metadata.location?.lat?.toFixed(4) || 'N/A'}</p>
      <p><strong>经度:</strong> ${metadata.location?.lon?.toFixed(4) || 'N/A'}</p>
      <p><strong>海拔:</strong> ${metadata.location?.height || 'N/A'} m</p>
      <p><strong>扫描时间:</strong> ${scanTime}</p>
      <p><strong>仰角层数:</strong> ${metadata.elevationAngles?.length || 'N/A'}</p>
      ${metadata.source ? `<p><strong>数据来源:</strong> ${metadata.source}</p>` : ''}
    `;
  }

  updateStatus(message) {
    this.elements.statusContent.innerHTML = `<p>${message}</p>`;
  }

  showProgress(progress) {
    this.elements.progressBar.style.display = 'block';
    const percent = Math.round(progress * 100);
    this.elements.progressFill.style.width = `${percent}%`;
    this.elements.progressText.textContent = `${percent}%`;
  }

  hideProgress() {
    this.elements.progressBar.style.display = 'none';
  }

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}

export default UIController;
