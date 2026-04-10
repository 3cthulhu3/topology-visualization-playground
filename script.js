import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js";

const container = document.getElementById("scene-container");
const amplitudeSlider = document.getElementById("amplitude");
const frequencySlider = document.getElementById("frequency");
const amplitudeValue = document.getElementById("amplitudeValue");
const frequencyValue = document.getElementById("frequencyValue");
const wireframeToggle = document.getElementById("wireframe");
const autorotateToggle = document.getElementById("autorotate");
const resetBtn = document.getElementById("resetBtn");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1117);

const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 2.5, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(4, 6, 3);
scene.add(directionalLight);

const gridHelper = new THREE.GridHelper(12, 24, 0x444444, 0x222222);
scene.add(gridHelper);

let surfaceMesh = null;

function surfaceHeight(x, y, amplitude, frequency) {
  return amplitude * Math.sin(frequency * x) * Math.cos(frequency * y);
}

function createSurface(amplitude, frequency, wireframe) {
  const size = 4;
  const segments = 120;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = surfaceHeight(x, z, amplitude, frequency);
    position.setY(i, y);
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x4ea1ff,
    metalness: 0.15,
    roughness: 0.7,
    wireframe: wireframe,
    side: THREE.DoubleSide
  });

  return new THREE.Mesh(geometry, material);
}

function updateSurface() {
  const amplitude = parseFloat(amplitudeSlider.value);
  const frequency = parseFloat(frequencySlider.value);
  const wireframe = wireframeToggle.checked;

  amplitudeValue.textContent = amplitude.toFixed(2);
  frequencyValue.textContent = frequency.toFixed(0);

  if (surfaceMesh) {
    scene.remove(surfaceMesh);
    surfaceMesh.geometry.dispose();
    surfaceMesh.material.dispose();
  }

  surfaceMesh = createSurface(amplitude, frequency, wireframe);
  scene.add(surfaceMesh);
}

amplitudeSlider.addEventListener("input", updateSurface);
frequencySlider.addEventListener("input", updateSurface);
wireframeToggle.addEventListener("change", updateSurface);

autorotateToggle.addEventListener("change", () => {
  controls.autoRotate = autorotateToggle.checked;
});

resetBtn.addEventListener("click", () => {
  camera.position.set(0, 2.5, 6);
  controls.target.set(0, 0, 0);
  controls.update();
});

window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

updateSurface();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();