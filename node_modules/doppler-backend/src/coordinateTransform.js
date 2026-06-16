export function polarToCartesian3D(radialData, reflectivityData, dimensions) {
  const { numTilts, numRays, numGates, gateSize = 250, firstGateDistance = 2125 } = dimensions;
  
  const elevationAngles = dimensions.elevationAngles || generateElevationAngles(numTilts);
  
  const cartesianPoints = [];
  
  const toRadians = deg => deg * Math.PI / 180;
  
  for (let tilt = 0; tilt < numTilts; tilt++) {
    const elevation = toRadians(elevationAngles[tilt] || (tilt * 1.5 + 0.5));
    const cosEl = Math.cos(elevation);
    const sinEl = Math.sin(elevation);
    
    for (let ray = 0; ray < numRays; ray++) {
      const azimuth = toRadians(ray * (360 / numRays));
      const cosAz = Math.cos(azimuth);
      const sinAz = Math.sin(azimuth);
      
      for (let gate = 0; gate < numGates; gate++) {
        const range = firstGateDistance + gate * gateSize;
        
        const x = range * cosEl * cosAz;
        const y = range * cosEl * sinAz;
        const z = range * sinEl;
        
        const idx = tilt * numRays * numGates + ray * numGates + gate;
        
        cartesianPoints.push({
          x,
          y,
          z,
          velocity: radialData.data[idx] || 0,
          reflectivity: reflectivityData?.data?.[idx] || 0,
        });
      }
    }
  }
  
  return {
    points: cartesianPoints,
    bounds: calculateBounds(cartesianPoints),
  };
}

function generateElevationAngles(numTilts) {
  const angles = [];
  const baseAngles = [0.5, 1.5, 2.4, 3.4, 4.3, 5.3, 6.2, 7.5, 8.7, 10.0, 12.0, 14.0, 16.7, 19.5];
  for (let i = 0; i < numTilts; i++) {
    angles.push(baseAngles[i] || (i * 1.5 + 0.5));
  }
  return angles;
}

function calculateBounds(points) {
  if (points.length === 0) {
    return {
      minX: 0, maxX: 0,
      minY: 0, maxY: 0,
      minZ: 0, maxZ: 0,
    };
  }
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function reconstructGrid(cartesianData, dimensions) {
  const { points, bounds } = cartesianData;
  const { gridSize = 64 } = dimensions;
  
  const nx = gridSize;
  const ny = gridSize;
  const nz = Math.max(16, Math.floor(gridSize * 0.5));
  
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  
  const dx = (maxX - minX) / (nx - 1);
  const dy = (maxY - minY) / (ny - 1);
  const dz = (maxZ - minZ) / (nz - 1);
  
  const velocityGrid = new Float32Array(nx * ny * nz);
  const reflectivityGrid = new Float32Array(nx * ny * nz);
  const weightGrid = new Float32Array(nx * ny * nz);
  
  velocityGrid.fill(0);
  reflectivityGrid.fill(0);
  weightGrid.fill(0);
  
  for (const point of points) {
    const ix = Math.floor((point.x - minX) / dx);
    const iy = Math.floor((point.y - minY) / dy);
    const iz = Math.floor((point.z - minZ) / dz);
    
    const clampedIx = Math.max(0, Math.min(nx - 1, ix));
    const clampedIy = Math.max(0, Math.min(ny - 1, iy));
    const clampedIz = Math.max(0, Math.min(nz - 1, iz));
    
    for (let k = Math.max(0, clampedIz - 1); k <= Math.min(nz - 1, clampedIz + 1); k++) {
      for (let j = Math.max(0, clampedIy - 1); j <= Math.min(ny - 1, clampedIy + 1); j++) {
        for (let i = Math.max(0, clampedIx - 1); i <= Math.min(nx - 1, clampedIx + 1); i++) {
          const gx = minX + i * dx;
          const gy = minY + j * dy;
          const gz = minZ + k * dz;
          
          const distSq = (point.x - gx) ** 2 + (point.y - gy) ** 2 + (point.z - gz) ** 2;
          const weight = 1 / (1 + distSq * 0.0001);
          
          const gIdx = k * nx * ny + j * nx + i;
          
          velocityGrid[gIdx] += point.velocity * weight;
          reflectivityGrid[gIdx] += point.reflectivity * weight;
          weightGrid[gIdx] += weight;
        }
      }
    }
  }
  
  for (let idx = 0; idx < nx * ny * nz; idx++) {
    if (weightGrid[idx] > 0) {
      velocityGrid[idx] /= weightGrid[idx];
      reflectivityGrid[idx] /= weightGrid[idx];
    }
  }
  
  return {
    velocity: Array.from(velocityGrid),
    reflectivity: Array.from(reflectivityGrid),
    dimensions: { nx, ny, nz },
    bounds: {
      minX: minX / 1000,
      maxX: maxX / 1000,
      minY: minY / 1000,
      maxY: maxY / 1000,
      minZ: minZ / 1000,
      maxZ: maxZ / 1000,
    },
  };
}

export default { polarToCartesian3D, reconstructGrid };
