import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseNetCDF } from './netcdfParser.js';
import { polarToCartesian3D, reconstructGrid } from './coordinateTransform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '多普勒雷达数据服务运行中' });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未接收到文件' });
    }

    const filePath = req.file.path;
    const parsedData = await parseNetCDF(filePath);

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error) {
    console.error('文件解析失败:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/parse', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: '未提供文件路径' });
    }

    const parsedData = await parseNetCDF(filePath);
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('数据解析失败:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transform', (req, res) => {
  try {
    const { radialData, reflectivityData, dimensions } = req.body;

    if (!radialData || !dimensions) {
      return res.status(400).json({ error: '缺少必要的数据' });
    }

    const cartesianData = polarToCartesian3D(radialData, reflectivityData, dimensions);
    const gridData = reconstructGrid(cartesianData, dimensions);

    res.json({
      success: true,
      data: {
        velocityGrid: gridData.velocity,
        reflectivityGrid: gridData.reflectivity,
        gridDimensions: gridData.dimensions,
        bounds: gridData.bounds,
      },
    });
  } catch (error) {
    console.error('坐标变换失败:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/process', async (req, res) => {
  try {
    const { filePath, gridSize = 100 } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: '未提供文件路径' });
    }

    const parsedData = await parseNetCDF(filePath);
    const cartesianData = polarToCartesian3D(
      parsedData.radialVelocity,
      parsedData.reflectivity,
      parsedData.dimensions
    );
    const gridData = reconstructGrid(cartesianData, {
      ...parsedData.dimensions,
      gridSize,
    });

    res.json({
      success: true,
      data: {
        metadata: parsedData.metadata,
        velocityGrid: gridData.velocity,
        reflectivityGrid: gridData.reflectivity,
        gridDimensions: gridData.dimensions,
        bounds: gridData.bounds,
      },
    });
  } catch (error) {
    console.error('数据处理失败:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sample', async (req, res) => {
  try {
    const sampleData = generateSampleData();
    res.json({ success: true, data: sampleData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generateSampleData() {
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
      radarName: '示例雷达站',
      location: { lat: 39.9042, lon: 116.4074, height: 500 },
      scanTime: new Date().toISOString(),
      elevationAngles: [0.5, 1.5, 2.4, 3.4, 4.3, 5.3, 6.2, 7.5, 8.7, 10.0, 12.0, 14.0, 16.7, 19.5],
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

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log(`示例数据: http://localhost:${PORT}/api/sample`);
});

export default app;
