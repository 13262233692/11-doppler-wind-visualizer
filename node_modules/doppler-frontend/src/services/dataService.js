const LOD_LEVELS = {
  HIGH: { step: 1, maxGridSize: 128, description: '高精度' },
  MEDIUM: { step: 2, maxGridSize: 64, description: '中等精度' },
  LOW: { step: 4, maxGridSize: 32, description: '低精度' },
  ULTRA_LOW: { step: 8, maxGridSize: 16, description: '超低精度' },
};

class DataService {
  constructor() {
    this.baseUrl = '/api';
    this.currentData = null;
    this.currentLOD = 'HIGH';
  }

  getAvailableLODLevels() {
    return LOD_LEVELS;
  }

  getCurrentLOD() {
    return this.currentLOD;
  }

  setLOD(level) {
    if (LOD_LEVELS[level]) {
      this.currentLOD = level;
      console.log(`LOD 级别已设置为: ${LOD_LEVELS[level].description}`);
      return true;
    }
    return false;
  }

  autoSelectLOD(gridSize) {
    if (gridSize <= 32) return 'HIGH';
    if (gridSize <= 64) return 'MEDIUM';
    if (gridSize <= 128) return 'LOW';
    return 'ULTRA_LOW';
  }

  simplifyGrid(grid, originalDims, targetDims) {
    const { nx, ny, nz } = originalDims;
    const { nx: tnx, ny: tny, nz: tnz } = targetDims;
    
    const stepX = Math.max(1, Math.floor(nx / tnx));
    const stepY = Math.max(1, Math.floor(ny / tny));
    const stepZ = Math.max(1, Math.floor(nz / tnz));
    
    const simplified = new Float32Array(tnx * tny * tnz);
    
    for (let z = 0; z < tnz; z++) {
      for (let y = 0; y < tny; y++) {
        for (let x = 0; x < tnx; x++) {
          const srcX = Math.min(x * stepX, nx - 1);
          const srcY = Math.min(y * stepY, ny - 1);
          const srcZ = Math.min(z * stepZ, nz - 1);
          
          const srcIdx = srcZ * nx * ny + srcY * nx + srcX;
          const dstIdx = z * tnx * tny + y * tnx + x;
          
          simplified[dstIdx] = grid[srcIdx];
        }
      }
    }
    
    return simplified;
  }

  getGridWithLOD(gridData, dims, lodLevel = null) {
    const lod = lodLevel || this.currentLOD;
    const lodConfig = LOD_LEVELS[lod] || LOD_LEVELS.HIGH;
    
    const { nx, ny, nz } = dims;
    const totalSize = nx * ny * nz;
    
    if (totalSize <= lodConfig.maxGridSize * lodConfig.maxGridSize * lodConfig.maxGridSize && lodConfig.step === 1) {
      return {
        grid: gridData,
        dims: dims,
        lod: lod,
        simplified: false,
      };
    }
    
    const targetNx = Math.max(16, Math.min(lodConfig.maxGridSize, Math.floor(nx / lodConfig.step)));
    const targetNy = Math.max(16, Math.min(lodConfig.maxGridSize, Math.floor(ny / lodConfig.step)));
    const targetNz = Math.max(16, Math.min(lodConfig.maxGridSize, Math.floor(nz / lodConfig.step)));
    
    const targetDims = { nx: targetNx, ny: targetNy, nz: targetNz };
    const simplifiedGrid = this.simplifyGrid(gridData, dims, targetDims);
    
    console.log(`网格已简化: ${nx}×${ny}×${nz} → ${targetNx}×${targetNy}×${targetNz} (LOD: ${lodConfig.description})`);
    
    return {
      grid: simplifiedGrid,
      dims: targetDims,
      lod: lod,
      simplified: true,
      originalDims: dims,
    };
  }

  async getHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return await response.json();
    } catch (error) {
      console.warn('后端服务不可用，将使用前端模拟数据');
      return { status: 'offline' };
    }
  }

  async getSampleData() {
    try {
      const response = await fetch(`${this.baseUrl}/sample`);
      const data = await response.json();
      if (data.success) {
        this.currentData = data.data;
        return data.data;
      }
      throw new Error(data.error);
    } catch (error) {
      console.warn('使用前端模拟数据:', error.message);
      const mockData = this.generateMockData();
      this.currentData = mockData;
      return mockData;
    }
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        return data.data;
      }
      throw new Error(data.error);
    } catch (error) {
      console.error('文件上传失败:', error);
      throw error;
    }
  }

  async processData(filePath, gridSize = 64) {
    try {
      const response = await fetch(`${this.baseUrl}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath, gridSize }),
      });
      const data = await response.json();
      if (data.success) {
        this.currentData = data.data;
        return data.data;
      }
      throw new Error(data.error);
    } catch (error) {
      console.error('数据处理失败:', error);
      throw error;
    }
  }

  generateMockData() {
    const gridSize = 64;
    const velocityGrid = new Float32Array(gridSize * gridSize * gridSize);
    const reflectivityGrid = new Float32Array(gridSize * gridSize * gridSize);

    const centerX = gridSize / 2;
    const centerY = gridSize / 2;
    const centerZ = gridSize / 3;

    for (let z = 0; z < gridSize; z++) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const idx = z * gridSize * gridSize + y * gridSize + x;
          
          const dx = x - centerX;
          const dy = y - centerY;
          const dz = z - centerZ;
          
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const maxDist = gridSize * 0.4;
          
          const angle = Math.atan2(dy, dx);
          const shearFactor = Math.sin(angle * 3 + z * 0.1) * 0.5 + 0.5;
          
          const velocityValue = Math.max(0, (1 - dist / maxDist) * 35 * shearFactor);
          const reflectivityValue = Math.max(0, (1 - dist / maxDist) * 60 * (0.7 + shearFactor * 0.3));
          
          velocityGrid[idx] = velocityValue;
          reflectivityGrid[idx] = reflectivityValue;
        }
      }
    }

    return {
      metadata: {
        radarName: '模拟雷达站 (前端)',
        location: { lat: 39.9042, lon: 116.4074, height: 500 },
        scanTime: new Date().toISOString(),
        elevationAngles: [0.5, 1.5, 2.4, 3.4, 4.3, 5.3, 6.2, 7.5, 8.7, 10.0, 12.0, 14.0, 16.7, 19.5],
        source: 'frontend-mock',
      },
      velocityGrid: Array.from(velocityGrid),
      reflectivityGrid: Array.from(reflectivityGrid),
      gridDimensions: { nx: gridSize, ny: gridSize, nz: gridSize },
      bounds: {
        minX: -50, maxX: 50,
        minY: -50, maxY: 50,
        minZ: 0, maxZ: 15,
      },
    };
  }

  getCurrentData() {
    return this.currentData;
  }

  getVelocityGrid() {
    return this.currentData?.velocityGrid || null;
  }

  getReflectivityGrid() {
    return this.currentData?.reflectivityGrid || null;
  }

  getGridDimensions() {
    return this.currentData?.gridDimensions || null;
  }

  getBounds() {
    return this.currentData?.bounds || null;
  }

  getMetadata() {
    return this.currentData?.metadata || null;
  }
}

export const dataService = new DataService();
export default DataService;
