import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import WindFieldParticleSystem from '../particles/WindFieldParticleSystem.js';

const MAX_VERTICES_PER_CHUNK = 65000;
const MAX_TRIANGLES_PER_CHUNK = 20000;

class ThreeRenderer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.isosurfaceMeshes = [];
    this.wireframeMeshes = [];
    this.axesHelper = null;
    this.gridHelper = null;
    this.animationId = null;
    this.autoRotate = false;
    this.opacity = 0.6;
    this.wireframeVisible = true;
    this.axesVisible = true;
    
    this.worker = null;
    this.workerBusy = false;
    
    this.webglExtensions = {};
    this.contextLost = false;
    this.disposed = false;
    
    this.windParticleSystem = null;
    this.lastFrameTime = performance.now();
    
    this.stats = {
      totalVertices: 0,
      totalTriangles: 0,
      chunkCount: 0,
    };
    
    this.init();
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.scene.fog = new THREE.Fog(0x0a0e1a, 100, 500);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(80, 60, 80);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    this.setupWebGLExtensions();
    this.setupContextLossHandling();
    
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 300;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;

    this.setupLights();
    this.setupHelpers();
    this.setupGround();
    this.setupWorker();

    window.addEventListener('resize', () => this.onResize());
    
    this.animate();
  }

  setupWebGLExtensions() {
    const gl = this.renderer.getContext();
    
    if (!gl) {
      console.error('无法获取 WebGL 上下文');
      return;
    }

    this.webglExtensions.elementIndexUint = gl.getExtension('OES_element_index_uint');
    this.webglExtensions.standardDerivatives = gl.getExtension('OES_standard_derivatives');
    this.webglExtensions.textureFloat = gl.getExtension('OES_texture_float');
    this.webglExtensions.vertexArrayObject = gl.getExtension('OES_vertex_array_object');
    
    console.log('WebGL 扩展状态:', {
      OES_element_index_uint: !!this.webglExtensions.elementIndexUint,
      OES_standard_derivatives: !!this.webglExtensions.standardDerivatives,
      OES_texture_float: !!this.webglExtensions.textureFloat,
      OES_vertex_array_object: !!this.webglExtensions.vertexArrayObject,
    });

    if (!this.webglExtensions.elementIndexUint) {
      console.warn('⚠️ 不支持 OES_element_index_uint 扩展，将使用 16 位索引和严格的分块策略');
    } else {
      console.log('✅ OES_element_index_uint 扩展已启用，支持 32 位索引');
    }
  }

  setupContextLossHandling() {
    const canvas = this.renderer.domElement;
    
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      console.error('❌ WebGL 上下文丢失！');
      
      if (this.onContextLostCallback) {
        this.onContextLostCallback();
      }
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.log('🔄 WebGL 上下文恢复，正在重建资源...');
      this.contextLost = false;
      this.rebuildResources();
      
      if (this.onContextRestoredCallback) {
        this.onContextRestoredCallback();
      }
    });
  }

  rebuildResources() {
    this.setupWebGLExtensions();
    this.scene.traverse((object) => {
      if (object.isMesh) {
        object.material.needsUpdate = true;
      }
    });
  }

  setContextLostCallback(callback) {
    this.onContextLostCallback = callback;
  }

  setContextRestoredCallback(callback) {
    this.onContextRestoredCallback = callback;
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(50, 100, 50);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x4facfe, 0.4);
    fillLight.position.set(-50, 30, -50);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfe4fa0, 0.3);
    rimLight.position.set(0, 50, -80);
    this.scene.add(rimLight);
  }

  setupHelpers() {
    this.axesHelper = new THREE.AxesHelper(60);
    this.axesHelper.setColors(0xff4444, 0x44ff44, 0x4444ff);
    this.scene.add(this.axesHelper);

    this.gridHelper = new THREE.GridHelper(120, 60, 0x2a2f4a, 0x1a1f3a);
    this.gridHelper.position.y = -0.5;
    this.scene.add(this.gridHelper);
  }

  setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(120, 120);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1f3a,
      roughness: 0.9,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.51;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const radarMarkerGeometry = new THREE.ConeGeometry(3, 8, 16);
    const radarMarkerMaterial = new THREE.MeshStandardMaterial({
      color: 0x4facfe,
      emissive: 0x4facfe,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9,
    });
    const radarMarker = new THREE.Mesh(radarMarkerGeometry, radarMarkerMaterial);
    radarMarker.position.set(0, 4, 0);
    this.scene.add(radarMarker);

    const radarBaseGeometry = new THREE.CylinderGeometry(5, 7, 2, 32);
    const radarBaseMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3561,
      metalness: 0.5,
      roughness: 0.5,
    });
    const radarBase = new THREE.Mesh(radarBaseGeometry, radarBaseMaterial);
    radarBase.position.set(0, 1, 0);
    this.scene.add(radarBase);
  }

  setupWorker() {
    this.worker = new Worker(new URL('../workers/marchingCubesWorker.js', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (e) => {
      const { type, vertices, normals, colors, indices, metadata, progress, error, chunkIndex, totalChunks } = e.data;
      
      if (type === 'progress') {
        if (this.onProgressCallback) {
          this.onProgressCallback(progress);
        }
      } else if (type === 'chunk') {
        this.createIsosurfaceFromChunk(vertices, normals, colors, indices, metadata, chunkIndex);
      } else if (type === 'complete') {
        this.workerBusy = false;
        this.stats.chunkCount = totalChunks || this.isosurfaceMeshes.length;
        
        console.log(`✅ 等值面提取完成: ${this.stats.totalVertices.toLocaleString()} 顶点, ${this.stats.totalTriangles.toLocaleString()} 三角形, ${this.stats.chunkCount} 个分块`);
        
        if (this.isosurfaceMeshes.length > 0) {
          this.fitCameraToObjectGroup(this.isosurfaceMeshes);
        }
        
        if (this.onCompleteCallback) {
          this.onCompleteCallback({
            ...metadata,
            totalVertices: this.stats.totalVertices,
            totalTriangles: this.stats.totalTriangles,
            chunkCount: this.stats.chunkCount,
          });
        }
      } else if (type === 'error') {
        console.error('Worker error:', error);
        this.workerBusy = false;
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
      }
    };
  }

  createIsosurfaceFromChunk(vertices, normals, colors, indices, metadata, chunkIndex = 0) {
    if (!vertices || vertices.length === 0) {
      console.warn(`分块 ${chunkIndex}: 无顶点数据，跳过`);
      return;
    }
    
    if (!normals || normals.length !== vertices.length) {
      console.warn(`分块 ${chunkIndex}: 法向量数据无效`);
      return;
    }

    const vertexCount = vertices.length / 3;
    const triangleCount = indices ? indices.length / 3 : vertexCount / 3;
    
    this.stats.totalVertices += vertexCount;
    this.stats.totalTriangles += triangleCount;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    
    if (colors && colors.length > 0) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    }

    if (indices && indices.length > 0) {
      const use32Bit = !!this.webglExtensions.elementIndexUint;
      const IndexArray = use32Bit ? Uint32Array : Uint16Array;
      const maxIndex = Math.max(...indices);
      
      if (!use32Bit && maxIndex > 65535) {
        console.error(`⚠️ 分块 ${chunkIndex}: 索引 ${maxIndex} 超过 16 位限制 (65535)，可能导致渲染错误！`);
        return;
      }
      
      geometry.setIndex(new IndexArray(indices));
    }

    const centerX = (metadata?.bounds?.minX + metadata?.bounds?.maxX) / 2 || 0;
    const centerZ = (metadata?.bounds?.minY + metadata?.bounds?.maxY) / 2 || 0;
    geometry.translate(-centerX, 0, -centerZ);

    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: this.opacity,
      roughness: 0.3,
      metalness: 0.1,
      transmission: 0.3,
      thickness: 2,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      forceSinglePass: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.isosurfaceMeshes.push(mesh);

    if (this.wireframeVisible) {
      const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0x4facfe,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);
      wireframeMesh.frustumCulled = true;
      this.scene.add(wireframeMesh);
      this.wireframeMeshes.push(wireframeMesh);
    }
    
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    
    console.log(`📦 分块 ${chunkIndex}: ${vertexCount.toLocaleString()} 顶点, ${triangleCount.toLocaleString()} 三角形`);
  }

  fitCameraToObjectGroup(objects) {
    if (!objects || objects.length === 0) return;
    
    const box = new THREE.Box3();
    for (const obj of objects) {
      if (obj.geometry) {
        obj.geometry.computeBoundingBox();
        box.expandByObject(obj);
      }
    }
    
    if (box.isEmpty()) return;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5;

    this.camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.6, center.z + cameraZ);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  extractIsosurface(gridData, gridDimensions, bounds, threshold, isVelocity = true) {
    if (this.workerBusy) {
      console.warn('Worker is busy, skipping extraction');
      return;
    }
    
    this.workerBusy = true;
    this.clearIsosurfaceMeshes();

    const use32BitIndices = !!this.webglExtensions.elementIndexUint;
    const chunkSize = use32BitIndices ? 1000000 : MAX_VERTICES_PER_CHUNK;

    this.worker.postMessage({
      type: 'extract',
      gridData: gridData,
      gridDimensions: gridDimensions,
      bounds: bounds,
      threshold: threshold,
      isVelocity: isVelocity,
      use32BitIndices: use32BitIndices,
      maxVerticesPerChunk: chunkSize,
    });
  }

  clearIsosurfaceMeshes() {
    for (const mesh of this.isosurfaceMeshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) {
        this.disposeGeometry(mesh.geometry);
      }
      if (mesh.material) {
        mesh.material.dispose();
      }
    }
    this.isosurfaceMeshes = [];

    for (const mesh of this.wireframeMeshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) {
        this.disposeGeometry(mesh.geometry);
      }
      if (mesh.material) {
        mesh.material.dispose();
      }
    }
    this.wireframeMeshes = [];

    this.stats = {
      totalVertices: 0,
      totalTriangles: 0,
      chunkCount: 0,
    };
  }

  disposeGeometry(geometry) {
    if (!geometry) return;
    
    if (geometry.index && typeof geometry.index.dispose === 'function') {
      geometry.index.dispose();
    }
    
    if (geometry.attributes) {
      for (const name in geometry.attributes) {
        const attribute = geometry.attributes[name];
        if (attribute && typeof attribute.dispose === 'function') {
          attribute.dispose();
        }
      }
    }
    
    if (typeof geometry.dispose === 'function') {
      geometry.dispose();
    }
  }

  setOpacity(value) {
    this.opacity = value;
    for (const mesh of this.isosurfaceMeshes) {
      if (mesh.material) {
        mesh.material.opacity = value;
      }
    }
  }

  setWireframeVisible(visible) {
    this.wireframeVisible = visible;
    for (const mesh of this.wireframeMeshes) {
      mesh.visible = visible;
    }
  }

  setAxesVisible(visible) {
    this.axesVisible = visible;
    if (this.axesHelper) {
      this.axesHelper.visible = visible;
    }
  }

  setAutoRotate(value) {
    this.autoRotate = value;
    this.controls.autoRotate = value;
    this.controls.autoRotateSpeed = 1.0;
  }

  setProgressCallback(callback) {
    this.onProgressCallback = callback;
  }

  setCompleteCallback(callback) {
    this.onCompleteCallback = callback;
  }

  setErrorCallback(callback) {
    this.onErrorCallback = callback;
  }

  getStats() {
    return { ...this.stats };
  }

  isContextLost() {
    return this.contextLost;
  }

  initWindParticles(scalarGrid, dims, bounds, count) {
    if (this.windParticleSystem) {
      this.windParticleSystem.dispose();
    }
    
    this.windParticleSystem = new WindFieldParticleSystem(this.scene, bounds);
    this.windParticleSystem.buildWindFieldFromScalar(scalarGrid, dims, bounds);
    this.windParticleSystem.init(count || 10000);
    
    console.log(`🌬️ 风场粒子系统已初始化: ${this.windParticleSystem.getParticleCount()} 个粒子`);
  }

  setWindParticlesVisible(visible) {
    if (this.windParticleSystem) {
      this.windParticleSystem.setVisible(visible);
    }
  }

  setWindParticleCount(count) {
    if (this.windParticleSystem) {
      this.windParticleSystem.setParticleCount(count);
    }
  }

  setWindTrailLength(length) {
    if (this.windParticleSystem) {
      this.windParticleSystem.setTrailLength(length);
    }
  }

  setWindSpeedScale(scale) {
    if (this.windParticleSystem) {
      this.windParticleSystem.setSpeedScale(scale);
    }
  }

  setWindParticlesPaused(paused) {
    if (this.windParticleSystem) {
      this.windParticleSystem.setPaused(paused);
    }
  }

  isWindParticlesActive() {
    return !!this.windParticleSystem;
  }

  getWindParticleStats() {
    if (!this.windParticleSystem) return null;
    return {
      particleCount: this.windParticleSystem.getParticleCount(),
      activeCount: this.windParticleSystem.getActiveParticleCount(),
      trailLength: this.windParticleSystem.trailLength,
      speedScale: this.windParticleSystem.speedScale,
      visible: this.windParticleSystem.visible,
      paused: this.windParticleSystem.paused,
    };
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    const now = performance.now();
    const deltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    const dt = Math.min(deltaMs / 1000, 0.05);
    
    if (this.windParticleSystem) {
      this.windParticleSystem.update(dt);
    }
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.disposed = true;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    if (this.windParticleSystem) {
      this.windParticleSystem.dispose();
      this.windParticleSystem = null;
    }
    
    this.clearIsosurfaceMeshes();
    
    window.removeEventListener('resize', () => this.onResize());
    
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
    
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) {
          this.disposeGeometry(object.geometry);
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.scene = null;
    }
  }
}

export default ThreeRenderer;
