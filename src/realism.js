// Realism upgrade module.
//
// IMPORTANT: ES module namespaces are FROZEN — you cannot do
// `THREE.MeshToonMaterial = ...`. Instead, we:
//   1. Provide renderer / lighting upgrades.
//   2. Walk the scene graph and swap any MeshToonMaterial /
//      MeshLambertMaterial in place with a PBR MeshStandardMaterial.
//   3. Monkey-patch Object3D.prototype.add (its prototype object is
//      mutable) so newly added subtrees are also "realized" on the fly.
//
// Call upgradeRenderer() right after constructing the renderer, and
// realizeMaterials(scene) once right after buildWorld(scene).
// installAutoRealize() is invoked automatically below so any meshes
// spawned later (NPCs, cars, projectiles) are upgraded too.

import * as THREE from "three";

// Cache PBR clones keyed by the original material's UUID so multiple meshes
// sharing the same toon material still share the same PBR material.
const _pbrCache = new Map();

function toPBR(oldMat) {
  if (!oldMat) return oldMat;
  if (oldMat.isMeshStandardMaterial) return oldMat;
  // Only upgrade lit, opaque-ish materials. Leave MeshBasicMaterial alone —
  // it's used intentionally for water, glass, banners, and emissive splashes.
  const isToon    = oldMat.isMeshToonMaterial;
  const isLambert = oldMat.isMeshLambertMaterial;
  const isPhong   = oldMat.isMeshPhongMaterial;
  if (!isToon && !isLambert && !isPhong) return oldMat;

  if (_pbrCache.has(oldMat.uuid)) return _pbrCache.get(oldMat.uuid);

  const pbr = new THREE.MeshStandardMaterial({
    color:        oldMat.color ? oldMat.color.clone() : 0xffffff,
    map:          oldMat.map        || null,
    normalMap:    oldMat.normalMap  || null,
    transparent:  oldMat.transparent,
    opacity:      oldMat.opacity,
    side:         oldMat.side,
    alphaTest:    oldMat.alphaTest,
    vertexColors: oldMat.vertexColors,
    roughness:    0.82,
    metalness:    0.0,
  });
  _pbrCache.set(oldMat.uuid, pbr);
  return pbr;
}

function realizeObject(obj) {
  if (!obj || !obj.isMesh || !obj.material) return;
  if (Array.isArray(obj.material)) {
    obj.material = obj.material.map(toPBR);
  } else {
    const upgraded = toPBR(obj.material);
    if (upgraded !== obj.material) obj.material = upgraded;
  }
}

/**
 * Walk a subtree and convert any MeshToon / MeshLambert / MeshPhong
 * materials to MeshStandardMaterial in place. Safe to call repeatedly.
 */
export function realizeMaterials(root) {
  if (!root) return;
  root.traverse(realizeObject);
}

/**
 * Patch Object3D.prototype.add so that ANY object added to the scene
 * graph (now or later) is automatically realized. The prototype object
 * itself is a normal mutable JS object so this assignment is legal.
 */
function installAutoRealize() {
  if (THREE.Object3D.prototype.__realismPatched) return;
  const origAdd = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...children) {
    const result = origAdd.apply(this, children);
    for (const child of children) {
      if (child && typeof child.traverse === "function") {
        child.traverse(realizeObject);
      }
    }
    return result;
  };
  THREE.Object3D.prototype.__realismPatched = true;
}
installAutoRealize();

/**
 * Apply realism tweaks to the WebGLRenderer.
 */
export function upgradeRenderer(renderer, { isMobile = false } = {}) {
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled   = true;
  // PCFSoft is the most compatible across drivers; VSM can produce
  // artifacts on some setups, so stick with PCFSoft everywhere.
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
}

/**
 * Build a naturalistic outdoor lighting rig: warm key sun, cool sky
 * hemisphere bounce, low ambient floor, and a soft blue fill from the
 * opposite side so back-lit surfaces aren't lifeless.
 */
export function buildRealisticLighting(scene, { isMobile = false } = {}) {
  const hemi = new THREE.HemisphereLight(0xFFE4B5, 0x4A5D3A, 0.55);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xFFEDD0, 0.22);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xFFF1D6, 2.6);
  sun.position.set(25, 45, 18);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  sun.castShadow = true;
  const SHADOW_RES = isMobile ? 1024 : 2048;
  sun.shadow.mapSize.width  = SHADOW_RES;
  sun.shadow.mapSize.height = SHADOW_RES;
  sun.shadow.camera.near    = 0.5;
  sun.shadow.camera.far     = 140;
  sun.shadow.camera.left    = -65;
  sun.shadow.camera.right   =  65;
  sun.shadow.camera.top     =  65;
  sun.shadow.camera.bottom  = -65;
  sun.shadow.bias           = -0.0005;
  sun.shadow.normalBias     =  0.02;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xB4D5FF, 0.35);
  fill.position.set(-30, 25, -20);
  scene.add(fill);

  return { sun, hemi, ambient, fill };
}
