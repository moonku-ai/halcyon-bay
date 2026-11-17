// Halcyon Bay — every car in the city: traffic that follows the road grid,
// parked cars you can steal, police cruisers that chase the player, and the
// police helicopter that only shows up at five stars.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, mulberry32, pick, angleDiff } from './util.js';
import { CITY_HALF, ROADS } from './city.js';
import { makeCarMesh, makeHelicopterMesh } from './models.js';

const CAR_COLORS = [0x8a2f2f, 0x2f5a8a, 0x3a7d44, 0xc2a23a, 0x6a6a72, 0xd8d8d8, 0x1f1f24, 0x7a3a8a, 0x2e8a7a, 0xb06030, 0x4a6a8a, 0x9a9a9a];
const TAXI_COLOR = 0xe8b400;

function headingFromDir(dx, dz) { return Math.atan2(-dx, -dz); }

export class VehicleWorld {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.city = game.city;
    this.rng = mulberry32(game.seed + 77);
    this.cars = [];
    this.police = [];
    this.heli = null;
    this.heliLight = null;
    this.heliCone = null;
    this.spawnTraffic(14);
    this.spawnParked(9);
  }

  makeCar(kind, color, x, z, heading) {
    const mesh = makeCarMesh(color, { police: kind === 'police', taxi: kind === 'taxi' });
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    const car = {
      mesh, kind, color, x, z, heading, speed: 0,
      targetSpeed: 0, axis: 'z', dir: 1, road: x, lane: 0,
      health: 100, driver: kind === 'traffic' || kind === 'taxi',
      pauseT: 0, stuckT: 0, smokeT: 0, exploded: false, isPlayerCar: false,
    };
    this.cars.push(car);
    return car;
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      // The point lies on a road: exactly one coordinate is a road line.
      const vertical = ROADS.includes(p.x);
      const axis = vertical ? 'z' : 'x';
      const road = vertical ? p.x : p.z;
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = axis === 'z' ? (dir > 0 ? -3 : 3) : (dir > 0 ? 3 : -3);
      const x = axis === 'z' ? road + lane : p.x;
      const z = axis === 'z' ? p.z : road + lane;
      const taxi = this.rng() < 0.12;
      const car = this.makeCar(taxi ? 'taxi' : 'traffic', taxi ? TAXI_COLOR : pick(this.rng, CAR_COLORS), x, z,
        headingFromDir(axis === 'x' ? dir : 0, axis === 'z' ? dir : 0));
      car.axis = axis; car.dir = dir; car.road = road; car.lane = lane;
      car.speed = 7 + this.rng() * 4;
      car.targetSpeed = car.speed;
      car.cruise = car.speed;
    }
  }

  spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      const vertical = ROADS.includes(p.x);
      const axis = vertical ? 'z' : 'x';
      const road = vertical ? p.x : p.z;
      const side = this.rng() < 0.5 ? -4.6 : 4.6;
      const x = axis === 'z' ? road + side : p.x;
      const z = axis === 'z' ? p.z : road + side;
      const dir = this.rng() < 0.5 ? 1 : -1;
      const car = this.makeCar('parked', pick(this.rng, CAR_COLORS), x, z,
        headingFromDir(axis === 'x' ? dir : 0, axis === 'z' ? dir : 0));
      car.speed = 0; car.targetSpeed = 0;
      car.axis = axis; car.dir = dir; car.road = road; car.lane = side;
    }
  }

  nearestCar(x, z, maxDist, kinds) {
    let best = null, bestD = maxDist;
    for (const c of this.cars) {
      if (c.exploded) continue;
      if (kinds && !kinds.includes(c.kind)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  damageCar(car, amount, cause) {
    if (car.exploded) return;
    car.health -= amount;
    if (car.health <= 55 && car.smokeT <= 0) {
      car.smokeT = 0.4;
      this.game.fx.smoke(car.x, 1.2, car.z, 6);
    }
    if (car.health <= 0) {
      car.exploded = true;
      this.game.fx.explode(car.x, 1, car.z, 2.2);
      this.game.audio.explosion();
      this.game.cameraShake(0.9);
      this.scene.remove(car.mesh);
      car.mesh.visible = false;
      if (car.isPlayerCar) this.game.player.ejectFromExplosion();
      if (cause === 'player') this.game.addWanted(25, 'Destroyed a vehicle');
      setTimeout(() => {
        const i = this.cars.indexOf(car);
        if (i >= 0) this.cars.splice(i, 1);
        const j = this.police.indexOf(car);
        if (j >= 0) this.police.splice(j, 1);
      }, 50);
      // Keep the streets full: a fresh traffic car joins later.
      if (car.kind === 'traffic' || car.kind === 'taxi') {
        setTimeout(() => { if (this.game.state === 'play') this.spawnTraffic(1); }, 9000);
      }
    }
  }

  spawnPolice(count) {
    const player = this.game.player;
    while (this.police.length < count) {
      const p = this.city.randomRoadPoint(this.rng, { x: player.x, z: player.z });
      const car = this.makeCar('police', 0x14181d, p.x, p.z, 0);
      car.cruise = 24 + this.rng() * 4;
      this.police.push(car);
    }
  }

  despawnPolice() {
    for (const c of this.police) {
      this.scene.remove(c.mesh);
      const i = this.cars.indexOf(c);
      if (i >= 0) this.cars.splice(i, 1);
    }
    this.police = [];
    this.despawnHeli();
  }

  spawnHeli() {
    if (this.heli) return;
    const mesh = makeHelicopterMesh();
    mesh.position.set(this.game.player.x + 30, 40, this.game.player.z - 20);
    this.scene.add(mesh);
    const light = new THREE.SpotLight(0xfff2c0, 900, 90, 0.32, 0.5, 1.2);
    light.position.copy(mesh.position);
    this.scene.add(light);
    this.scene.add(light.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(9, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.copy(mesh.position);
    this.scene.add(cone);
    this.heli = { mesh, light, cone, angle: 0 };
    this.game.toast('HBPD helicopter on scene — lose them!');
  }

  despawnHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli.mesh);
    this.scene.remove(this.heli.light);
    this.scene.remove(this.heli.cone);
    this.heli = null;
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    // --- Traffic ---
    for (const car of this.cars) {
      if (car.kind !== 'traffic' && car.kind !== 'taxi') continue;
      if (car.exploded || car.isPlayerCar) continue;
      if (car.pauseT > 0) {
        car.pauseT -= dt;
        car.speed = lerp(car.speed, 0, dt * 6);
      } else {
        // Slow for a car ahead in the same lane.
        let want = car.cruise;
        for (const other of this.cars) {
          if (other === car || other.exploded) continue;
          if (other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
          const ahead = car.axis === 'z' ? (other.z - car.z) * car.dir : (other.x - car.x) * car.dir;
          if (ahead > 0 && ahead < 9) { want = ahead < 4.5 ? 0 : other.speed * 0.85; break; }
        }
        car.targetSpeed = want;
        car.speed = lerp(car.speed, car.targetSpeed, dt * 1.4);
      }
      const step = car.speed * dt;
      if (car.axis === 'z') car.z += car.dir * step; else car.x += car.dir * step;
      // Intersection decisions.
      const pos = car.axis === 'z' ? car.z : car.x;
      let nearCross = null;
      for (const r of ROADS) {
        if (Math.abs(pos - r) < 1.2) { nearCross = r; break; }
      }
      if (nearCross !== null && car.lastCross !== nearCross) {
        car.lastCross = nearCross;
        const roll = this.rng();
        if (roll < 0.14) car.pauseT = 0.8 + this.rng() * 1.4;
        else if (roll < 0.45) {
          // Turn onto the crossing road.
          const newAxis = car.axis === 'z' ? 'x' : 'z';
          const newDir = this.rng() < 0.5 ? 1 : -1;
          const newRoad = nearCross;
          const newLane = newAxis === 'z' ? (newDir > 0 ? -3 : 3) : (newDir > 0 ? 3 : -3);
          if (newAxis === 'z') { car.x = newRoad + newLane; } else { car.z = newRoad + newLane; }
          car.axis = newAxis; car.dir = newDir; car.road = newRoad; car.lane = newLane;
        }
      }
      if (car.lastCross !== null && nearCross === null) car.lastCross = null;
      // Wrap around the city edge so traffic never runs out.
      if (car.x > CITY_HALF + 4) car.x = -CITY_HALF - 4;
      if (car.x < -CITY_HALF - 4) car.x = CITY_HALF + 4;
      if (car.z > CITY_HALF + 4) car.z = -CITY_HALF - 4;
      if (car.z < -CITY_HALF - 4) car.z = CITY_HALF + 4;
      car.heading = headingFromDir(car.axis === 'x' ? car.dir : 0, car.axis === 'z' ? car.dir : 0);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Wheel spin.
      const spin = car.speed * dt * 1.4;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
      if (car.smokeT > 0) car.smokeT -= dt;
    }
    // --- Police ---
    const wanted = game.wanted;
    const wantCount = wanted === 0 ? 0 : Math.min(1 + wanted, 4);
    if (wanted > 0) this.spawnPolice(wantCount);
    else if (this.police.length) this.despawnPolice();
    if (wanted >= 5) this.spawnHeli(); else if (this.heli) this.despawnHeli();
    let anySiren = false;
    let cornered = false;
    for (const car of this.police) {
      if (car.exploded) continue;
      anySiren = true;
      // Scripted cars (staged screenshots) hold their heading and speed.
      if (car.scripted) {
        const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
        car.x += fx * car.speed * dt;
        car.z += fz * car.speed * dt;
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
        const bar = car.mesh.userData.lightBar;
        if (bar) {
          bar.phase += dt * 9;
          const on = Math.sin(bar.phase) > 0;
          bar.red.emissiveIntensity = on ? 2.2 : 0.15;
          bar.blue.emissiveIntensity = on ? 0.15 : 2.2;
        }
        continue;
      }
      const dx = player.x - car.x, dz = player.z - car.z;
      const dist = Math.hypot(dx, dz) || 1;
      const desired = headingFromDir(dx / dist, dz / dist);
      const turn = clamp(angleDiff(car.heading, desired), -1, 1);
      car.heading += turn * dt * 2.4;
      // Police are fast, but ease off when right on top of the player.
      // Far away they push hard to close the gap, so a chase stays a chase.
      const wantSpeed = dist < 6 ? 6 : dist > 70 ? 36 : car.cruise;
      car.speed = lerp(car.speed, wantSpeed, dt * 1.2);
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      // Keep them on the map and out of buildings: slide along colliders.
      const fixed = this.resolveBuildings(car.x, car.z, 1.6);
      car.x = fixed.x; car.z = fixed.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 1.4;
      // Light bar strobe.
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        bar.phase += dt * 9;
        const on = Math.sin(bar.phase) > 0;
        bar.red.emissiveIntensity = on ? 2.2 : 0.15;
        bar.blue.emissiveIntensity = on ? 0.15 : 2.2;
      }
      // Ram the player's car; corner a player on foot.
      const pd = Math.hypot(player.x - car.x, player.z - car.z);
      if (player.inCar && pd < 3.6) {
        const push = 26 * dt;
        const px = player.x - car.x, pz = player.z - car.z;
        const pl = Math.hypot(px, pz) || 1;
        player.carSpeed += 2.2 * dt;
        player.x += (px / pl) * push * 0.4;
        player.z += (pz / pl) * push * 0.4;
        if (Math.random() < dt * 2) { this.damageCar(player.car, 2, 'police'); this.game.fx.sparks(player.x, 1, player.z); }
      } else if (!player.inCar && pd < 2.6) {
        cornered = true;
        player.bustedT += dt;
        if (player.bustedT > 1.4) game.busted();
      }
      if (car.smokeT > 0) car.smokeT -= dt;
    }
    if (!cornered) player.bustedT = Math.max(0, player.bustedT - dt * 2);
    game.audio.setSiren(anySiren);
    game.audio.updateSiren(dt);
    // --- Helicopter ---
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.35;
      const tx = player.x + Math.cos(h.angle) * 26;
      const tz = player.z + Math.sin(h.angle) * 26;
      h.mesh.position.x = lerp(h.mesh.position.x, tx, dt * 0.8);
      h.mesh.position.z = lerp(h.mesh.position.z, tz, dt * 0.8);
      h.mesh.position.y = 38 + Math.sin(h.angle * 2.3) * 2;
      h.mesh.rotation.y = Math.atan2(player.x - h.mesh.position.x, player.z - h.mesh.position.z);
      h.mesh.userData.rotor.rotation.y += dt * 22;
      h.mesh.userData.rotor2.rotation.y += dt * 22;
      h.light.position.copy(h.mesh.position);
      h.light.target.position.set(player.x, 0, player.z);
      h.cone.position.set(
        (h.mesh.position.x + player.x) / 2,
        h.mesh.position.y / 2,
        (h.mesh.position.z + player.z) / 2,
      );
      h.cone.lookAt(player.x, 0, player.z);
      h.cone.rotateX(Math.PI / 2);
    }
  }

  resolveBuildings(x, z, r) {
    // Simple circle-vs-AABB push for police cars.
    for (const c of this.city.colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      }
    }
    return { x, z };
  }
}
