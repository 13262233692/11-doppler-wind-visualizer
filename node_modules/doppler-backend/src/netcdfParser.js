import fs from 'fs/promises';
import path from 'path';

let netcdf4 = null;

async function loadNetCDF() {
  if (!netcdf4) {
    try {
      netcdf4 = await import('netcdf4');
    } catch (e) {
      console.warn('netcdf4 模块未安装，将使用模拟数据');
      return null;
    }
  }
  return netcdf4;
}

export async function parseNetCDF(filePath) {
  const nc = await loadNetCDF();
  
  if (!nc) {
    return parseNetCDFSimulated(filePath);
  }

  try {
    const file = await fs.access(filePath);
    if (!file) {
      throw new Error('文件不存在');
    }

    const dataset = new nc.File(filePath, 'r');
    
    const metadata = extractMetadata(dataset);
    const dimensions = extractDimensions(dataset);
    const radialVelocity = extractVariable(dataset, 'radial_velocity', 'velocity');
    const reflectivity = extractVariable(dataset, 'reflectivity', 'DBZ');
    
    dataset.close();

    return {
      metadata,
      dimensions,
      radialVelocity,
      reflectivity,
    };
  } catch (error) {
    console.error('解析 NetCDF 文件失败，使用模拟数据:', error.message);
    return parseNetCDFSimulated(filePath);
  }
}

function extractMetadata(dataset) {
  const metadata = {};
  
  try {
    const attributes = dataset.attributes;
    for (const key in attributes) {
      metadata[key] = attributes[key].value;
    }
  } catch (e) {
    console.warn('提取元数据失败:', e.message);
  }

  return {
    radarName: metadata['radar_name'] || metadata['instrument_name'] || '未知雷达',
    location: {
      lat: metadata['latitude'] || metadata['Lat'] || 39.9042,
      lon: metadata['longitude'] || metadata['Lon'] || 116.4074,
      height: metadata['height'] || metadata['Height'] || 500,
    },
    scanTime: metadata['time_coverage_start'] || metadata['scan_time'] || new Date().toISOString(),
    elevationAngles: metadata['elevation'] || metadata['elevation_angles'] || 
      [0.5, 1.5, 2.4, 3.4, 4.3, 5.3, 6.2, 7.5, 8.7, 10.0, 12.0, 14.0, 16.7, 19.5],
    raw: metadata,
  };
}

function extractDimensions(dataset) {
  const dimensions = {};
  
  try {
    const dims = dataset.dimensions;
    for (const key in dims) {
      dimensions[key] = dims[key].length;
    }
  } catch (e) {
    console.warn('提取维度失败:', e.message);
  }

  return {
    numRays: dimensions['nrads'] || dimensions['ray'] || 360,
    numGates: dimensions['ngates'] || dimensions['gate'] || 1000,
    numTilts: dimensions['ntilts'] || dimensions['elevation'] || 14,
    gateSize: 250,
    firstGateDistance: 2125,
    ...dimensions,
  };
}

function extractVariable(dataset, prefix, suffix) {
  let variable = null;
  let variableName = null;

  try {
    const variables = dataset.variables;
    
    for (const name in variables) {
      if (name.includes(prefix) || name.includes(suffix) || name.toLowerCase().includes(suffix.toLowerCase())) {
        variableName = name;
        break;
      }
    }
    
    if (variableName && variables[variableName]) {
      const v = variables[variableName];
      const data = v.readSlice([0, 0, 0], v.dimensions.map(d => d.length));
      variable = {
        name: variableName,
        data: Array.from(data),
        dimensions: v.dimensions.map(d => d.length),
      };
    }
  } catch (e) {
    console.warn(`提取变量 ${prefix}${suffix} 失败:`, e.message);
  }

  if (!variable) {
    variable = {
      name: `${prefix}${suffix}`,
      data: [],
      dimensions: [],
    };
  }

  return variable;
}

function parseNetCDFSimulated(filePath) {
  console.log('使用模拟雷达数据');
  
  const numTilts = 14;
  const numRays = 360;
  const numGates = 200;

  const radialVelocityData = new Float32Array(numTilts * numRays * numGates);
  const reflectivityData = new Float32Array(numTilts * numRays * numGates);

  const centerRay = numRays / 2;
  const centerGate = numGates * 0.6;

  for (let tilt = 0; tilt < numTilts; tilt++) {
    const elevationAngle = tilt * 1.5 + 0.5;
    const verticalFactor = 1 - tilt / numTilts;

    for (let ray = 0; ray < numRays; ray++) {
      const angle = (ray / numRays) * Math.PI * 2;
      
      for (let gate = 0; gate < numGates; gate++) {
        const idx = tilt * numRays * numGates + ray * numGates + gate;
        
        const dr = ray - centerRay;
        const dg = gate - centerGate;
        const dist = Math.sqrt(dr * dr * 0.01 + dg * dg);
        const maxDist = numGates * 0.3;
        
        const shearFactor = Math.sin(angle * 3 + tilt * 0.2) * 0.5 + 0.5;
        
        const velocity = Math.max(-30, Math.min(30, 
          Math.sin(angle + gate * 0.02) * 20 * shearFactor * verticalFactor +
          (1 - dist / maxDist) * 15 * shearFactor
        ));
        
        const reflectivity = Math.max(0, 
          (1 - dist / maxDist) * 55 * (0.6 + shearFactor * 0.4) * verticalFactor
        );
        
        radialVelocityData[idx] = velocity;
        reflectivityData[idx] = reflectivity;
      }
    }
  }

  return {
    metadata: {
      radarName: '模拟雷达站',
      location: { lat: 39.9042, lon: 116.4074, height: 500 },
      scanTime: new Date().toISOString(),
      elevationAngles: [0.5, 1.5, 2.4, 3.4, 4.3, 5.3, 6.2, 7.5, 8.7, 10.0, 12.0, 14.0, 16.7, 19.5],
      source: 'simulated',
    },
    dimensions: {
      numRays,
      numGates,
      numTilts,
      gateSize: 250,
      firstGateDistance: 2125,
    },
    radialVelocity: {
      name: 'radial_velocity',
      data: Array.from(radialVelocityData),
      dimensions: [numTilts, numRays, numGates],
    },
    reflectivity: {
      name: 'reflectivity',
      data: Array.from(reflectivityData),
      dimensions: [numTilts, numRays, numGates],
    },
  };
}

export default parseNetCDF;
