// Halcyon Bay — the city itself: a 7x7 block grid with five districts, a bay and
// a pier to the south, canvas-painted ground (roads, lane marks, crosswalks),
// procedural building facades, streetlights, trees and a day/night sky.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, mulberry32, pick } from './util.js';

export const PITCH = 52;
export const BLOCK = 40;
export const ROAD_W = 12;
export const CITY_HALF = 182;
export const ROADS = [-182, -130, -78, -26, 26, 78, 130, 182];
export const GROUND_HALF = 320;

// Named places the missions and the HUD use.
export const SPOTS = {
  marinaPlaza: { x: -52, z: 156, name: 'Marina Plaza' },
  safehouse: { x: 104, z: -52, name: 'Safehouse' },
  oldTownDrop: { x: -156, z: -104, name: 'Old Town Drop' },
  bank: { x: 0, z: 0, name: 'Meridian Bank' },
  hideout: { x: -104, z: 104, name: 'Hideout' },
  industrialYard: { x: 156, z: 156, name: 'Rook Yard' },
  docks: { x: -130, z: 170, name: 'Halcyon Docks' },
  lighthouse: { x: 170, z: 196, name: 'Lighthouse Point' },
  hospital: { x: -104, z: -52, name: 'General Hospital' },
  policeStation: { x: 52, z: -104, name: 'HBPD Central' },
  pierEnd: { x: -52, z: 210, name: 'Pier End' },
};

export function districtAt(bx, bz) {
  if (bx >= 2 && bx <= 4 && bz >= 2 && bz <= 4) return 'downtown';
  if (bz === 6) return 'marina';
  if (bx <= 1 && bz <= 2) return 'oldtown';
  if (bx >= 5 && bz <= 1) return 'hills';
  if (bx >= 5 && bz >= 5) return 'industrial';
  return 'midtown';
}

function facadeTexture(style, rng) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  const palettes = {
    glass: ['#55748f', '#5f8098', '#4d6a84', '#64879e'],
    glassWarm: ['#7d6c52', '#86755c', '#6f6046'],
    brick: ['#9a5642', '#8d4e3a', '#a35f48', '#7d4232'],
    stucco: ['#c9a27a', '#bfa07e', '#d0ad85'],
    concrete: ['#9aa0a6', '#92969c', '#a6aab0'],
    house: ['#bd9a6a', '#b3895c', '#cbb184', '#9c8668'],
  };
  const base = pick(rng, palettes[style] || palettes.concrete);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Subtle vertical shading.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const cols = style === 'glass' || style === 'glassWarm' ? 8 : 6;
  const rows = style === 'glass' || style === 'glassWarm' ? 12 : 8;
  const cw = 256 / cols, rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.28;
      if (style === 'glass' || style === 'glassWarm') {
        g.fillStyle = lit ? '#ffd98a' : 'rgba(18,30,44,0.9)';
      } else if (style === 'brick' || style === 'stucco' || style === 'house') {
        g.fillStyle = lit ? '#ffcf7d' : 'rgba(20,22,30,0.85)';
      } else {
        g.fillStyle = lit ? '#ffe1a0' : 'rgba(25,30,38,0.9)';
      }
      g.fillRect(c * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.56);
      if (style === 'glass' || style === 'glassWarm') {
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(c * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.12);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(rng) {
  const S = 2048;
  const scale = S / (GROUND_HALF * 2); // px per unit
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const toPx = (v) => (v + GROUND_HALF) * scale;
  // Outskirts: dry grass.
  g.fillStyle = '#6d7a52';
  g.fillRect(0, 0, S, S);
  // Grass variation.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rng() * S, rng() * S, 6 + rng() * 20, 6 + rng() * 20);
  }
  // Beach strip at the south edge.
  g.fillStyle = '#c9b183';
  g.fillRect(toPx(-GROUND_HALF), toPx(186), S, toPx(212) - toPx(186));
  // City blocks.
  const parks = new Set(['1,4', '4,1', '5,3']);
  for (let bx = 0; bx < 7; bx++) {
    for (let bz = 0; bz < 7; bz++) {
      const x0 = ROADS[bx] + 6, z0 = ROADS[bz] + 6;
      const x1 = ROADS[bx + 1] - 6, z1 = ROADS[bz + 1] - 6;
      const d = districtAt(bx, bz);
      const isPark = parks.has(bx + ',' + bz);
      // Sidewalk ring.
      g.fillStyle = '#7e848d';
      g.fillRect(toPx(x0), toPx(z0), (x1 - x0) * scale, (z1 - z0) * scale);
      const inner = isPark ? '#5e7d46' : d === 'marina' ? '#b59a72' : d === 'industrial' ? '#8b8d90' : d === 'oldtown' ? '#9a8a76' : '#969ca4';
      g.fillStyle = inner;
      g.fillRect(toPx(x0 + 3), toPx(z0 + 3), (x1 - x0 - 6) * scale, (z1 - z0 - 6) * scale);
      if (isPark) {
        // Footpaths crossing the park.
        g.fillStyle = '#a89a7c';
        g.fillRect(toPx(x0 + 3), toPx((z0 + z1) / 2 - 1.5), (x1 - x0 - 6) * scale, 3 * scale);
        g.fillRect(toPx((x0 + x1) / 2 - 1.5), toPx(z0 + 3), 3 * scale, (z1 - z0 - 6) * scale);
      }
      if (d === 'industrial') {
        // Parking stall lines.
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 1.5;
        for (let s = 0; s < 6; s++) {
          const sx = toPx(x0 + 6 + s * 5);
          g.beginPath(); g.moveTo(sx, toPx(z1 - 12)); g.lineTo(sx, toPx(z1 - 4)); g.stroke();
        }
      }
    }
  }
  // Roads.
  g.fillStyle = '#23262c';
  for (const r of ROADS) {
    g.fillRect(toPx(-CITY_HALF), toPx(r - ROAD_W / 2), (CITY_HALF * 2) * scale, ROAD_W * scale);
    g.fillRect(toPx(r - ROAD_W / 2), toPx(-CITY_HALF), ROAD_W * scale, (CITY_HALF * 2) * scale);
  }
  // Lane dashes.
  g.fillStyle = '#d8c25a';
  for (const r of ROADS) {
    for (let v = -CITY_HALF + 4; v < CITY_HALF - 4; v += 10) {
      g.fillRect(toPx(v), toPx(r - 0.4), 5 * scale, 0.8 * scale);
      g.fillRect(toPx(r - 0.4), toPx(v), 0.8 * scale, 5 * scale);
    }
  }
  g.fillStyle = 'rgba(230,230,230,0.75)';
  for (const r of ROADS) {
    for (let v = -CITY_HALF + 4; v < CITY_HALF - 4; v += 10) {
      g.fillRect(toPx(v), toPx(r - 3.4), 5 * scale, 0.5 * scale);
      g.fillRect(toPx(v), toPx(r + 2.9), 5 * scale, 0.5 * scale);
      g.fillRect(toPx(r - 3.4), toPx(v), 0.5 * scale, 5 * scale);
      g.fillRect(toPx(r + 2.9), toPx(v), 0.5 * scale, 5 * scale);
    }
  }
  // Crosswalks at every intersection.
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let s = -5; s < 6; s += 2.2) {
        g.fillRect(toPx(rx + s - 0.8), toPx(rz - 6), 1.6 * scale, 2.4 * scale);
        g.fillRect(toPx(rx + s - 0.8), toPx(rz + 3.6), 1.6 * scale, 2.4 * scale);
        g.fillRect(toPx(rx - 6), toPx(rz + s - 0.8), 2.4 * scale, 1.6 * scale);
        g.fillRect(toPx(rx + 3.6), toPx(rz + s - 0.8), 2.4 * scale, 1.6 * scale);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.colliders = [];
    this.buildingMats = [];
    this.streetlightMats = [];
    this.water = null;
    this.sun = null;
    this.hemi = null;
    this.timeOfDay = 13;
    this.build();
  }

  build() {
    const rng = this.rng;
    const scene = this.scene;
    // Ground.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2),
      new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);
    // Bay water to the south.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 260),
      new THREE.MeshPhongMaterial({ color: 0x1d6f8f, shininess: 120, specular: 0x99ccff, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.4, 320);
    scene.add(water);
    this.water = water;
    // Beach edge blocks cars and the player from swimming away.
    this.colliders.push({ minX: -GROUND_HALF, maxX: GROUND_HALF, minZ: 198, maxZ: 420 });

    // Facade materials (shared textures, cloned per building for repeat).
    const styles = {
      glass: facadeTexture('glass', rng),
      glassWarm: facadeTexture('glassWarm', rng),
      brick: facadeTexture('brick', rng),
      stucco: facadeTexture('stucco', rng),
      concrete: facadeTexture('concrete', rng),
      house: facadeTexture('house', rng),
    };
    const roofMats = {
      dark: new THREE.MeshLambertMaterial({ color: 0x2e3138 }),
      brickRoof: new THREE.MeshLambertMaterial({ color: 0x4a2f26 }),
      warm: new THREE.MeshLambertMaterial({ color: 0x6b5a44 }),
      flat: new THREE.MeshLambertMaterial({ color: 0x55585e }),
    };
    const parkBlocks = new Set(['1,4', '4,1', '5,3']);
    const bankBlock = '3,3';
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const addBuilding = (x, z, w, h, d, style, roof) => {
      const tex = styles[style].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 9)));
      const mat = new THREE.MeshLambertMaterial({
        map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffc46b), emissiveIntensity: 0.04,
      });
      this.buildingMats.push(mat);
      const mesh = new THREE.Mesh(boxGeo, [mat, mat, roof, roof, mat, mat]);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      return mesh;
    };
    const roofGeo = new THREE.ConeGeometry(1, 1, 4);
    const addRoof = (x, y, z, w, d, color) => {
      const m = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color }));
      m.scale.set(w * 0.72, 3.2, d * 0.72);
      m.position.set(x, y + 1.6, z);
      m.rotation.y = Math.PI / 4;
      m.castShadow = true;
      scene.add(m);
    };

    for (let bx = 0; bx < 7; bx++) {
      for (let bz = 0; bz < 7; bz++) {
        const key = bx + ',' + bz;
        if (parkBlocks.has(key)) { this.plantPark(bx, bz, rng); continue; }
        const d = districtAt(bx, bz);
        const cx = (ROADS[bx] + ROADS[bx + 1]) / 2;
        const cz = (ROADS[bz] + ROADS[bz + 1]) / 2;
        if (key === bankBlock) {
          // Meridian Bank: wide stone landmark with a sign band.
          addBuilding(cx, cz, 34, 13, 26, 'concrete', roofMats.flat);
          continue;
        }
        if (d === 'downtown') {
          const w = 22 + rng() * 8, dep = 22 + rng() * 8;
          const h = 26 + rng() * 38;
          addBuilding(cx + (rng() - 0.5) * 6, cz + (rng() - 0.5) * 6, w, h, dep, rng() < 0.7 ? 'glass' : 'glassWarm', roofMats.dark);
          if (rng() < 0.5) addBuilding(cx + (rng() - 0.5) * 14, cz + (rng() - 0.5) * 14, 10, 8 + rng() * 6, 10, 'concrete', roofMats.flat);
        } else if (d === 'midtown') {
          addBuilding(cx - 9, cz - 8, 15, 10 + rng() * 9, 14, 'concrete', roofMats.flat);
          addBuilding(cx + 10, cz + 9, 14, 9 + rng() * 8, 13, rng() < 0.5 ? 'brick' : 'concrete', roofMats.flat);
        } else if (d === 'oldtown') {
          for (let k = 0; k < 3; k++) {
            const ox = cx - 11 + (k % 2) * 20 + (rng() - 0.5) * 3;
            const oz = cz - 10 + Math.floor(k / 2) * 20 + (rng() - 0.5) * 3;
            addBuilding(ox, oz, 13, 8 + rng() * 6, 12, 'brick', roofMats.brickRoof);
          }
        } else if (d === 'marina') {
          addBuilding(cx - 8, cz - 6, 16, 6 + rng() * 3, 12, 'stucco', roofMats.warm);
          addBuilding(cx + 9, cz + 7, 13, 5 + rng() * 3, 11, 'house', roofMats.warm);
        } else if (d === 'hills') {
          for (let k = 0; k < 4; k++) {
            const ox = cx - 12 + (k % 2) * 22 + (rng() - 0.5) * 4;
            const oz = cz - 11 + Math.floor(k / 2) * 22 + (rng() - 0.5) * 4;
            const h = 5 + rng() * 2.5;
            addBuilding(ox, oz, 10, h, 9, 'house', roofMats.flat);
            addRoof(ox, h, oz, 10, 9, pick(rng, [0x7a4a34, 0x4a5a6a, 0x6a5a3a]));
          }
        } else { // industrial
          addBuilding(cx - 6, cz - 4, 30, 7 + rng() * 3, 16, 'concrete', roofMats.flat);
          addBuilding(cx + 8, cz + 10, 16, 6 + rng() * 2, 12, 'brick', roofMats.flat);
        }
      }
    }
    this.buildStreetlights();
    this.buildTrees();
    this.buildPier();
    this.buildLighthouse();
    this.buildBoats();
  }

  plantPark(bx, bz, rng) {
    const cx = (ROADS[bx] + ROADS[bx + 1]) / 2;
    const cz = (ROADS[bz] + ROADS[bz + 1]) / 2;
    for (let i = 0; i < 9; i++) {
      const x = cx - 15 + rng() * 30;
      const z = cz - 15 + rng() * 30;
      if (Math.abs(x - cx) < 4 && Math.abs(z - cz) < 4) continue;
      this.addTree(x, z, 1.6 + rng() * 1.4, 0x2e6b34);
    }
    // A couple of benches: low boxes.
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
    for (const [bx2, bz2] of [[cx + 8, cz], [cx - 8, cz + 6]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
      b.position.set(bx2, 0.6, bz2);
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  addTree(x, z, s, color) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2.2 * s, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a4028 }),
    );
    trunk.position.set(x, 1.1 * s, z);
    trunk.castShadow = true;
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.1 * s, 4.4 * s, 7),
      new THREE.MeshLambertMaterial({ color }),
    );
    top.position.set(x, 2.2 * s + 2.2 * s, z);
    top.castShadow = true;
    this.scene.add(trunk, top);
  }

  buildTrees() {
    const rng = this.rng;
    // Hills gardens and marina palms.
    for (let i = 0; i < 26; i++) {
      const bx = 5 + Math.floor(rng() * 2), bz = Math.floor(rng() * 2);
      const cx = (ROADS[bx] + ROADS[bx + 1]) / 2 + (rng() - 0.5) * 26;
      const cz = (ROADS[bz] + ROADS[bz + 1]) / 2 + (rng() - 0.5) * 26;
      this.addTree(cx, cz, 1.1 + rng() * 0.9, 0x2e6b34);
    }
    for (let i = 0; i < 12; i++) {
      const x = -170 + rng() * 340;
      this.addTree(x, 168 + rng() * 12, 1.5 + rng(), 0x3a7d44);
    }
  }

  buildStreetlights() {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
    const headGeo = new THREE.BoxGeometry(1.6, 0.22, 0.4);
    for (const rx of ROADS) {
      for (const rz of ROADS) {
        if ((rx + rz) % 104 !== 0) continue; // every other intersection, both corners
        for (const [ox, oz] of [[7.5, 7.5], [-7.5, -7.5]]) {
          const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffd98a, emissiveIntensity: 0.05 });
          this.streetlightMats.push(lampMat);
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(rx + ox, 3.5, rz + oz);
          const head = new THREE.Mesh(headGeo, lampMat);
          head.position.set(rx + ox, 7, rz + oz);
          this.scene.add(pole, head);
        }
      }
    }
  }

  buildPier() {
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 34), wood);
    pier.position.set(SPOTS.pierEnd.x, 0.9, 196);
    pier.castShadow = true;
    this.scene.add(pier);
    // Piles.
    const pileGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6);
    for (const [px, pz] of [[-56, 200], [-48, 200], [-56, 210], [-48, 210], [-56, 220], [-48, 220]]) {
      const p = new THREE.Mesh(pileGeo, wood);
      p.position.set(px, 0.4, pz);
      this.scene.add(p);
    }
  }

  buildLighthouse() {
    const x = SPOTS.lighthouse.x, z = SPOTS.lighthouse.z;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.2, 18, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
    );
    tower.position.set(x, 9, z);
    tower.castShadow = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(2.45, 2.45, 3, 10),
      new THREE.MeshLambertMaterial({ color: 0xb03a2e }),
    );
    band.position.set(x, 12, z);
    const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.4 });
    this.streetlightMats.push(lampMat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), lampMat);
    lamp.position.set(x, 18.8, z);
    this.scene.add(tower, band, lamp);
    this.colliders.push({ minX: x - 3.4, maxX: x + 3.4, minZ: z - 3.4, maxZ: z + 3.4 });
    this.lighthouseLamp = lampMat;
  }

  buildBoats() {
    const rng = this.rng;
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
    const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x2e5a74 });
    this.boats = [];
    for (let i = 0; i < 5; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), i % 2 ? hullMat : hullMat2);
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      cabin.position.set(0, 1.4, -0.5);
      boat.add(hull, cabin);
      boat.position.set(-140 + i * 62 + rng() * 10, 0.1, 235 + rng() * 40);
      boat.rotation.y = rng() * Math.PI;
      this.scene.add(boat);
      this.boats.push(boat);
    }
  }

  randomRoadPoint(rng, minDistFrom) {
    for (let tries = 0; tries < 40; tries++) {
      const along = ROADS[Math.floor(rng() * ROADS.length)];
      const cross = -CITY_HALF + rng() * (CITY_HALF * 2);
      const p = rng() < 0.5 ? { x: along, z: cross } : { x: cross, z: along };
      if (minDistFrom && Math.hypot(p.x - minDistFrom.x, p.z - minDistFrom.z) < 60) continue;
      return p;
    }
    return { x: 0, z: -26 };
  }

  randomSidewalkPoint(rng) {
    const bx = Math.floor(rng() * 7), bz = Math.floor(rng() * 7);
    const x0 = ROADS[bx] + 6, x1 = ROADS[bx + 1] - 6;
    const z0 = ROADS[bz] + 6, z1 = ROADS[bz + 1] - 6;
    const edge = Math.floor(rng() * 4);
    if (edge === 0) return { x: x0 + rng() * (x1 - x0), z: z0 + 1.2 };
    if (edge === 1) return { x: x0 + rng() * (x1 - x0), z: z1 - 1.2 };
    if (edge === 2) return { x: x0 + 1.2, z: z0 + rng() * (z1 - z0) };
    return { x: x1 - 1.2, z: z0 + rng() * (z1 - z0) };
  }

  clampToCity(x, z) {
    return { x: clamp(x, -CITY_HALF - 6, CITY_HALF + 6), z: clamp(z, -CITY_HALF - 6, 196) };
  }

  // hours: 0..24. Sets sun, sky, fog, window glow and streetlight glow.
  setTimeOfDay(hours, sun, hemi, scene) {
    this.timeOfDay = hours;
    const day = { sky: new THREE.Color(0x8fc3ea), fog: new THREE.Color(0xa8c8e0), sun: 1.2, sunColor: new THREE.Color(0xfff2d8), hemi: 0.6, win: 0.04, lamp: 0.05, sunPos: [120, 190, 60] };
    const gold = { sky: new THREE.Color(0xf2a35e), fog: new THREE.Color(0xe8a06a), sun: 0.9, sunColor: new THREE.Color(0xffb36b), hemi: 0.42, win: 0.35, lamp: 0.5, sunPos: [200, 55, 40] };
    const night = { sky: new THREE.Color(0x0b1424), fog: new THREE.Color(0x0d1626), sun: 0.16, sunColor: new THREE.Color(0x9db8ff), hemi: 0.2, win: 0.95, lamp: 1.6, sunPos: [-90, 160, -70] };
    let a, b, t;
    if (hours < 6 || hours >= 20.5) { a = night; b = night; t = 0; }
    else if (hours < 10) { a = night; b = day; t = (hours - 6) / 4; }
    else if (hours < 16.5) { a = day; b = day; t = 0; }
    else if (hours < 19) { a = day; b = gold; t = (hours - 16.5) / 2.5; }
    else { a = gold; b = night; t = (hours - 19) / 1.5; }
    t = clamp(t, 0, 1);
    scene.background = a.sky.clone().lerp(b.sky, t);
    scene.fog.color.copy(a.fog).lerp(b.fog, t);
    sun.intensity = lerp(a.sun, b.sun, t);
    sun.color.copy(a.sunColor).lerp(b.sunColor, t);
    const sp = [lerp(a.sunPos[0], b.sunPos[0], t), lerp(a.sunPos[1], b.sunPos[1], t), lerp(a.sunPos[2], b.sunPos[2], t)];
    sun.position.set(sp[0], sp[1], sp[2]);
    this.sunDir = new THREE.Vector3(sp[0], sp[1], sp[2]).normalize();
    hemi.intensity = lerp(a.hemi, b.hemi, t);
    const win = lerp(a.win, b.win, t);
    for (const m of this.buildingMats) m.emissiveIntensity = win;
    const lamp = lerp(a.lamp, b.lamp, t);
    for (const m of this.streetlightMats) m.emissiveIntensity = lamp;
    this.isNight = hours < 6 || hours >= 19.5;
  }
}
