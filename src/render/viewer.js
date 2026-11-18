/**
 * Thin THREE.js wrapper. It only knows how to display MeshData buffers; all maths
 * lives in src/math. Geometry buffers are updated in place when the vertex count is
 * unchanged, so dragging a slider does not allocate a new mesh every frame.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SOLID_COLOR = 0x4ea1ff;
const BACKGROUND = 0x0f1117;
const VIEW_DIRECTION = new THREE.Vector3(0, 2.5, 6).normalize();
const MAX_PIXEL_RATIO = 2;

/** Converts sRGB-encoded [0,1] colours to linear, as THREE expects for vertex colours. */
function srgbToLinearInPlace(arr) {
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    arr[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return arr;
}

/**
 * @param {HTMLElement} container
 * @param {{ autoRotate?: boolean }} [options]
 */
export function createViewer(container, options = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  camera.position.copy(VIEW_DIRECTION).multiplyScalar(6.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = options.autoRotate ?? true;
  controls.autoRotateSpeed = 1.0;

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(4, 6, 3);
  scene.add(directional);
  const rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(-4, -3, -5);
  scene.add(rim);

  const grid = new THREE.GridHelper(12, 24, 0x444444, 0x222222);
  scene.add(grid);

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: SOLID_COLOR,
    metalness: 0.15,
    roughness: 0.7,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Maths uses z-up; THREE uses y-up. Rotating −90° about X maps (x, y, z) → (x, z, −y).
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  let colorsEnabled = false;
  const boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function setAttribute(name, array, itemSize) {
    const existing = geometry.getAttribute(name);
    if (existing && existing.array.length === array.length) {
      existing.array.set(array);
      existing.needsUpdate = true;
    } else {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }
  }

  /** @param {import('../math/mesh.js').MeshData} data */
  function setMesh(data) {
    setAttribute("position", data.positions, 3);
    setAttribute("normal", data.normals, 3);
    const index = geometry.getIndex();
    if (!index || index.array.length !== data.indices.length) {
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    boundingSphere.copy(geometry.boundingSphere);

    // Keep the grid just below the surface (math z-min becomes THREE y-min).
    grid.position.y = geometry.boundingBox.min.z - 0.05;
  }

  /** @param {Float32Array | null} colors sRGB triples, or null for a solid colour */
  function setColors(colors) {
    const wantColors = colors !== null;
    if (wantColors) {
      setAttribute("color", srgbToLinearInPlace(Float32Array.from(colors)), 3);
    }
    if (wantColors !== colorsEnabled) {
      colorsEnabled = wantColors;
      material.vertexColors = wantColors;
      material.color.set(wantColors ? 0xffffff : SOLID_COLOR);
      material.needsUpdate = true;
    }
  }

  function setWireframe(on) {
    material.wireframe = Boolean(on);
  }

  function setAutoRotate(on) {
    controls.autoRotate = Boolean(on);
  }

  /** Fits the camera to the current surface along the default viewing direction. */
  function frame() {
    const r = Math.max(boundingSphere.radius, 0.5);
    // Use the narrower of the vertical and horizontal FOV so portrait screens fit too.
    const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    const distance = (r / Math.sin(Math.min(halfV, halfH))) * 1.15;
    // Bounding-sphere centre is in mesh-local (z-up) coordinates.
    const center = boundingSphere.center.clone().applyEuler(mesh.rotation);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance);
    controls.update();
  }

  let frameId = 0;
  function animate() {
    frameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function dispose() {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    controls.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setMesh, setColors, setWireframe, setAutoRotate, frame, dispose };
}
