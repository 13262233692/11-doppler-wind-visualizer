import * as THREE from 'three';

const DEFAULT_PARTICLE_COUNT = 10000;
const DEFAULT_TRAIL_LENGTH = 12;
const DEFAULT_TIME_STEP = 0.05;
const DEFAULT_SPEED_SCALE = 1.0;
const PARTICLE_RESET_AGE = 200;
const PARTICLE_MIN_SPEED = 0.01;

class WindFieldParticleSystem {
  constructor(scene, bounds) {
    this.scene = scene;
    this.bounds = bounds || { minX: -50, maxX: 50, minY: -50, maxY: 50, minZ: 0, maxZ: 15 };
    
    this.particleCount = DEFAULT_PARTICLE_COUNT;
    this.trailLength = DEFAULT_TRAIL_LENGTH;
    this.timeStep = DEFAULT_TIME_STEP;
    this.speedScale = DEFAULT_SPEED_SCALE;
    this.visible = true;
    this.paused = false;
    
    this.windFieldU = null;
    this.windFieldV = null;
    this.windFieldW = null;
    this.fieldDims = { nx: 0, ny: 0, nz: 0 };
    
    this.particles = null;
    this.trailGeometry = null;
    this.trailMesh = null;
    this.trailMaterial = null;
    
    this.positions = null;
    this.colors = null;
    this.ages = null;
    this.lifetimes = null;
    
    this.frameCount = 0;
    this.centerX = 0;
    this.centerZ = 0;
  }

  setWindField(uField, vField, wField, dims, bounds) {
    this.windFieldU = uField;
    this.windFieldV = vField;
    this.windFieldW = wField;
    this.fieldDims = dims;
    
    if (bounds) {
      this.bounds = bounds;
    }
    
    this.centerX = (this.bounds.minX + this.bounds.maxX) / 2;
    this.centerZ = (this.bounds.minY + this.bounds.maxY) / 2;
  }

  buildWindFieldFromScalar(scalarGrid, dims, bounds) {
    const { nx, ny, nz } = dims;
    const totalCells = nx * ny * nz;
    
    const uField = new Float32Array(totalCells);
    const vField = new Float32Array(totalCells);
    const wField = new Float32Array(totalCells);
    
    if (bounds) {
      this.bounds = bounds;
    }
    
    const cx = nx / 2;
    const cy = ny / 2;
    const cz = nz / 3;
    
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const idx = z * nx * ny + y * nx + x;
          
          const dx = x - cx;
          const dy = y - cy;
          const horizontalDist = Math.sqrt(dx * dx + dy * dy);
          
          const speed = scalarGrid[idx];
          
          if (horizontalDist < 0.5) {
            uField[idx] = 0;
            vField[idx] = 0;
            wField[idx] = speed * 0.3;
            continue;
          }
          
          const tangentX = -dy / horizontalDist;
          const tangentY = dx / horizontalDist;
          
          const inwardFactor = 0.15;
          const radialX = -dx / horizontalDist;
          const radialY = -dy / horizontalDist;
          
          const maxDist = Math.sqrt(cx * cx + cy * cy);
          const normalizedDist = horizontalDist / maxDist;
          
          const swirlAngle = normalizedDist * 0.6;
          const swirlX = tangentX * Math.cos(swirlAngle) + radialX * Math.sin(swirlAngle);
          const swirlY = tangentY * Math.cos(swirlAngle) + radialY * Math.sin(swirlAngle);
          
          const magnitude = Math.sqrt(swirlX * swirlX + swirlY * swirlY) || 1;
          
          uField[idx] = speed * swirlX / magnitude;
          vField[idx] = speed * swirlY / magnitude;
          
          const heightFactor = z / (nz - 1);
          const updraftStrength = speed * 0.2 * (1 - heightFactor) * (1 - normalizedDist);
          wField[idx] = updraftStrength + speed * 0.05 * Math.sin(normalizedDist * Math.PI);
        }
      }
    }
    
    this.setWindField(uField, vField, wField, dims, bounds);
    return { uField, vField, wField };
  }

  trilinearInterpolate(field, px, py, pz) {
    const { nx, ny, nz } = this.fieldDims;
    const { minX, maxX, minY, maxY, minZ, maxZ } = this.bounds;
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    
    const fx = ((px - minX) / rangeX) * (nx - 1);
    const fy = ((py - minY) / rangeY) * (ny - 1);
    const fz = ((pz - minZ) / rangeZ) * (nz - 1);
    
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    
    const x1 = Math.min(x0 + 1, nx - 1);
    const y1 = Math.min(y0 + 1, ny - 1);
    const z1 = Math.min(z0 + 1, nz - 1);
    
    const cx0 = Math.max(0, Math.min(x0, nx - 1));
    const cy0 = Math.max(0, Math.min(y0, ny - 1));
    const cz0 = Math.max(0, Math.min(z0, nz - 1));
    
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    
    const c000 = field[cz0 * nx * ny + cy0 * nx + cx0];
    const c100 = field[cz0 * nx * ny + cy0 * nx + x1];
    const c010 = field[cz0 * nx * ny + y1 * nx + cx0];
    const c110 = field[cz0 * nx * ny + y1 * nx + x1];
    const c001 = field[z1 * nx * ny + cy0 * nx + cx0];
    const c101 = field[z1 * nx * ny + cy0 * nx + x1];
    const c011 = field[z1 * nx * ny + y1 * nx + cx0];
    const c111 = field[z1 * nx * ny + y1 * nx + x1];
    
    const c00 = c000 * (1 - tx) + c100 * tx;
    const c01 = c001 * (1 - tx) + c101 * tx;
    const c10 = c010 * (1 - tx) + c110 * tx;
    const c11 = c011 * (1 - tx) + c111 * tx;
    
    const c0 = c00 * (1 - ty) + c10 * ty;
    const c1 = c01 * (1 - ty) + c11 * ty;
    
    return c0 * (1 - tz) + c1 * tz;
  }

  getWindVector(px, py, pz) {
    if (!this.windFieldU || !this.windFieldV || !this.windFieldW) {
      return { u: 0, v: 0, w: 0 };
    }
    
    const { minX, maxX, minY, maxY, minZ, maxZ } = this.bounds;
    
    if (px < minX || px > maxX || py < minY || py > maxY || pz < minZ || pz > maxZ) {
      return { u: 0, v: 0, w: 0 };
    }
    
    return {
      u: this.trilinearInterpolate(this.windFieldU, px, py, pz),
      v: this.trilinearInterpolate(this.windFieldV, px, py, pz),
      w: this.trilinearInterpolate(this.windFieldW, px, py, pz),
    };
  }

  rk4Integrate(px, py, pz, dt) {
    const k1 = this.getWindVector(px, py, pz);
    
    const k2 = this.getWindVector(
      px + k1.u * dt * 0.5,
      py + k1.v * dt * 0.5,
      pz + k1.w * dt * 0.5
    );
    
    const k3 = this.getWindVector(
      px + k2.u * dt * 0.5,
      py + k2.v * dt * 0.5,
      pz + k2.w * dt * 0.5
    );
    
    const k4 = this.getWindVector(
      px + k3.u * dt,
      py + k3.v * dt,
      pz + k3.w * dt
    );
    
    const dx = (k1.u + 2 * k2.u + 2 * k3.u + k4.u) / 6;
    const dy = (k1.v + 2 * k2.v + 2 * k3.v + k4.v) / 6;
    const dz = (k1.w + 2 * k2.w + 2 * k3.w + k4.w) / 6;
    
    return {
      x: px + dx * dt,
      y: py + dy * dt,
      z: pz + dz * dt,
      speed: Math.sqrt(dx * dx + dy * dy + dz * dz),
    };
  }

  init(count) {
    if (count) {
      this.particleCount = count;
    }
    
    this.dispose();
    
    const n = this.particleCount;
    const trailLen = this.trailLength;
    
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 4);
    this.ages = new Float32Array(n);
    this.lifetimes = new Float32Array(n);
    
    this.particles = [];
    for (let i = 0; i < n; i++) {
      const pos = this.randomPosition();
      this.positions[i * 3] = pos.x;
      this.positions[i * 3 + 1] = pos.y;
      this.positions[i * 3 + 2] = pos.z;
      
      this.particles.push({
        trail: [{ x: pos.x, y: pos.y, z: pos.z }],
        age: Math.floor(Math.random() * PARTICLE_RESET_AGE),
        lifetime: PARTICLE_RESET_AGE + Math.floor(Math.random() * 100),
      });
      
      this.ages[i] = 0;
      this.lifetimes[i] = this.particles[i].lifetime;
    }
    
    this.createTrailGeometry();
  }

  randomPosition() {
    const { minX, maxX, minY, maxY, minZ, maxZ } = this.bounds;
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * rangeX * 0.4;
    const x = this.centerX + Math.cos(angle) * radius;
    const z = this.centerZ + Math.sin(angle) * radius;
    const heightFraction = Math.random();
    const y = minZ + heightFraction * rangeZ;
    
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minZ, Math.min(maxZ, y)),
      z: Math.max(minY, Math.min(maxY, z)),
    };
  }

  createTrailGeometry() {
    const n = this.particleCount;
    const trailLen = this.trailLength;
    const lineCount = n * (trailLen - 1);
    
    const linePositions = new Float32Array(lineCount * 2 * 3);
    const lineColors = new Float32Array(lineCount * 2 * 4);
    
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 4));
    
    this.trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    });
    
    this.trailMesh = new THREE.LineSegments(this.trailGeometry, this.trailMaterial);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = this.visible;
    this.scene.add(this.trailMesh);
  }

  resetParticle(i) {
    const pos = this.randomPosition();
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    
    this.particles[i].trail = [{ x: pos.x, y: pos.y, z: pos.z }];
    this.particles[i].age = 0;
    this.particles[i].lifetime = PARTICLE_RESET_AGE + Math.floor(Math.random() * 100);
    this.ages[i] = 0;
    this.lifetimes[i] = this.particles[i].lifetime;
  }

  update(dt) {
    if (!this.particles || !this.windFieldU || this.paused) return;
    
    const actualDt = dt !== undefined ? dt : this.timeStep;
    const scaledDt = actualDt * this.speedScale;
    
    this.frameCount++;
    
    for (let i = 0; i < this.particleCount; i++) {
      const particle = this.particles[i];
      particle.age++;
      
      if (particle.age >= particle.lifetime) {
        this.resetParticle(i);
        continue;
      }
      
      const px = this.positions[i * 3];
      const py = this.positions[i * 3 + 1];
      const pz = this.positions[i * 3 + 2];
      
      const result = this.rk4Integrate(px, py, pz, scaledDt);
      
      const { minX, maxX, minY, maxY, minZ, maxZ } = this.bounds;
      if (result.x < minX || result.x > maxX || 
          result.y < minZ || result.y > maxZ || 
          result.z < minY || result.z > maxY ||
          result.speed < PARTICLE_MIN_SPEED) {
        this.resetParticle(i);
        continue;
      }
      
      this.positions[i * 3] = result.x;
      this.positions[i * 3 + 1] = result.y;
      this.positions[i * 3 + 2] = result.z;
      
      particle.trail.push({ x: result.x, y: result.y, z: result.z });
      
      if (particle.trail.length > this.trailLength) {
        particle.trail.shift();
      }
      
      this.ages[i] = particle.age;
    }
    
    this.updateTrailBuffers();
  }

  speedToColor(speed, ageFraction) {
    const normalizedSpeed = Math.min(1, speed / 35);
    
    let r, g, b;
    
    if (normalizedSpeed < 0.25) {
      r = 0.1;
      g = 0.3 + normalizedSpeed * 2.8;
      b = 0.8 + normalizedSpeed * 0.8;
    } else if (normalizedSpeed < 0.5) {
      const t = (normalizedSpeed - 0.25) * 4;
      r = 0.1 + t * 0.3;
      g = 0.9;
      b = 1.0 - t * 0.3;
    } else if (normalizedSpeed < 0.75) {
      const t = (normalizedSpeed - 0.5) * 4;
      r = 0.4 + t * 0.6;
      g = 0.9 - t * 0.3;
      b = 0.7 - t * 0.5;
    } else {
      const t = (normalizedSpeed - 0.75) * 4;
      r = 1.0;
      g = 0.6 - t * 0.4;
      b = 0.2 - t * 0.15;
    }
    
    const fadeIn = Math.min(1, ageFraction * 5);
    const fadeOut = Math.min(1, (1 - ageFraction) * 5);
    const alpha = fadeIn * fadeOut;
    
    return { r, g, b, a: alpha };
  }

  updateTrailBuffers() {
    if (!this.trailGeometry) return;
    
    const posAttr = this.trailGeometry.attributes.position;
    const colAttr = this.trailGeometry.attributes.color;
    
    if (!posAttr || !colAttr) return;
    
    const posArray = posAttr.array;
    const colArray = colAttr.array;
    
    let lineIdx = 0;
    
    for (let i = 0; i < this.particleCount; i++) {
      const particle = this.particles[i];
      const trail = particle.trail;
      const ageFraction = particle.age / particle.lifetime;
      
      if (trail.length < 2) continue;
      
      const px = this.positions[i * 3];
      const py = this.positions[i * 3 + 1];
      const pz = this.positions[i * 3 + 2];
      const wind = this.getWindVector(px, py, pz);
      const speed = Math.sqrt(wind.u * wind.u + wind.v * wind.v + wind.w * wind.w);
      
      for (let j = 0; j < trail.length - 1; j++) {
        if (lineIdx >= posArray.length / 3 - 1) break;
        
        const p1 = trail[j];
        const p2 = trail[j + 1];
        
        const baseIdx = lineIdx * 6;
        posArray[baseIdx] = p1.x - this.centerX;
        posArray[baseIdx + 1] = p1.y;
        posArray[baseIdx + 2] = p1.z - this.centerZ;
        posArray[baseIdx + 3] = p2.x - this.centerX;
        posArray[baseIdx + 4] = p2.y;
        posArray[baseIdx + 5] = p2.z - this.centerZ;
        
        const trailFraction1 = (j + 1) / trail.length;
        const trailFraction2 = (j + 2) / trail.length;
        
        const color1 = this.speedToColor(speed, ageFraction);
        const alpha1 = color1.a * trailFraction1 * 0.8;
        const alpha2 = color1.a * trailFraction2 * 0.8;
        
        const colBaseIdx = lineIdx * 8;
        colArray[colBaseIdx] = color1.r;
        colArray[colBaseIdx + 1] = color1.g;
        colArray[colBaseIdx + 2] = color1.b;
        colArray[colBaseIdx + 3] = alpha1;
        colArray[colBaseIdx + 4] = color1.r;
        colArray[colBaseIdx + 5] = color1.g;
        colArray[colBaseIdx + 6] = color1.b;
        colArray[colBaseIdx + 7] = alpha2;
        
        lineIdx++;
      }
    }
    
    const remainingStart = lineIdx * 6;
    for (let k = remainingStart; k < posArray.length; k++) {
      posArray[k] = 0;
    }
    const remainingColStart = lineIdx * 8;
    for (let k = remainingColStart; k < colArray.length; k++) {
      colArray[k] = 0;
    }
    
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.trailMesh) {
      this.trailMesh.visible = visible;
    }
  }

  setParticleCount(count) {
    if (count !== this.particleCount) {
      this.particleCount = count;
      this.init();
    }
  }

  setTrailLength(length) {
    if (length !== this.trailLength && length >= 2) {
      this.trailLength = length;
      this.init(this.particleCount);
    }
  }

  setSpeedScale(scale) {
    this.speedScale = scale;
  }

  setTimeStep(dt) {
    this.timeStep = dt;
  }

  setPaused(paused) {
    this.paused = paused;
  }

  getParticleCount() {
    return this.particleCount;
  }

  getActiveParticleCount() {
    if (!this.particles) return 0;
    let active = 0;
    for (let i = 0; i < this.particleCount; i++) {
      if (this.particles[i].trail.length >= 2) active++;
    }
    return active;
  }

  dispose() {
    if (this.trailMesh) {
      this.scene.remove(this.trailMesh);
      if (this.trailGeometry) {
        this.disposeGeometry(this.trailGeometry);
      }
      if (this.trailMaterial) {
        this.trailMaterial.dispose();
      }
      this.trailMesh = null;
      this.trailGeometry = null;
      this.trailMaterial = null;
    }
    
    this.particles = null;
    this.positions = null;
    this.colors = null;
    this.ages = null;
    this.lifetimes = null;
  }

  disposeGeometry(geometry) {
    if (!geometry) return;
    if (geometry.index && typeof geometry.index.dispose === 'function') {
      geometry.index.dispose();
    }
    if (geometry.attributes) {
      for (const name in geometry.attributes) {
        const attr = geometry.attributes[name];
        if (attr && typeof attr.dispose === 'function') {
          attr.dispose();
        }
      }
    }
    if (typeof geometry.dispose === 'function') {
      geometry.dispose();
    }
  }
}

export default WindFieldParticleSystem;
