import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class ThreeRenderer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.isosurfaceMesh = null;
    this.wireframeMesh = null;
    this.axesHelper = null;
    this.gridHelper = null;
    this.animationId = null;
    this.autoRotate = false;
    this.opacity = 0.6;
    
    this.worker = null;
    this.workerBusy = false;
    
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
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
      const { type, vertices, normals, colors, metadata, progress, error } = e.data;
      
      if (type === 'progress') {
        if (this.onProgressCallback) {
          this.onProgressCallback(progress);
        }
      } else if (type === 'result') {
        this.createIsosurface(vertices, normals, colors, metadata);
        this.workerBusy = false;
        if (this.onCompleteCallback) {
          this.onCompleteCallback(metadata);
        }
      } else if (type === 'error') {
        console.error('Worker error:', error);
        this.workerBusy = false;
      }
    };
  }

  extractIsosurface(gridData, gridDimensions, bounds, threshold, isVelocity = true) {
    if (this.workerBusy) {
      console.warn('Worker is busy, skipping extraction');
      return;
    }
    
    this.workerBusy = true;
    
    if (this.isosurfaceMesh) {
      this.scene.remove(this.isosurfaceMesh);
      this.isosurfaceMesh.geometry.dispose();
      this.isosurfaceMesh.material.dispose();
      this.isosurfaceMesh = null;
    }
    
    if (this.wireframeMesh) {
      this.scene.remove(this.wireframeMesh);
      this.wireframeMesh.geometry.dispose();
      this.wireframeMesh.material.dispose();
      this.wireframeMesh = null;
    }

    this.worker.postMessage({
      type: 'extract',
      gridData: gridData,
      gridDimensions: gridDimensions,
      bounds: bounds,
      threshold: threshold,
      isVelocity: isVelocity,
    });
  }

  createIsosurface(vertices, normals, colors, metadata) {
    if (!vertices || vertices.length === 0) {
      console.warn('No isosurface vertices generated');
      return;
    }
    
    if (!normals || normals.length !== vertices.length) {
      console.warn('Invalid normals data, recalculating');
      return;
    }
    
    if (!colors || colors.length === 0) {
      console.warn('Invalid colors data');
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));

    const centerX = (metadata?.bounds?.minX + metadata?.bounds?.maxX) / 2 || 0;
    const centerY = (metadata?.bounds?.minY + metadata?.bounds?.maxY) / 2 || 0;
    geometry.translate(-centerX, 0, -centerY);

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
    });

    this.isosurfaceMesh = new THREE.Mesh(geometry, material);
    this.isosurfaceMesh.castShadow = true;
    this.isosurfaceMesh.receiveShadow = true;
    this.scene.add(this.isosurfaceMesh);

    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x4facfe,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });

    this.wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);
    this.scene.add(this.wireframeMesh);

    this.fitCameraToObject(this.isosurfaceMesh);
  }

  fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
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

  setOpacity(value) {
    this.opacity = value;
    if (this.isosurfaceMesh) {
      this.isosurfaceMesh.material.opacity = value;
    }
  }

  setWireframeVisible(visible) {
    if (this.wireframeMesh) {
      this.wireframeMesh.visible = visible;
    }
  }

  setAxesVisible(visible) {
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

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.worker) {
      this.worker.terminate();
    }
    window.removeEventListener('resize', () => this.onResize());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

export default ThreeRenderer;
