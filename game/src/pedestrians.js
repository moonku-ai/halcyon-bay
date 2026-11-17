// Halcyon Bay — pedestrians: they stroll the sidewalks, chat in pairs, and
// run screaming from gunfire, explosions and speeding cars.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, mulberry32, pick } from './util.js';
import { makePersonMesh } from './models.js';

const SHIRTS = [0xc23b3b, 0x3b6ac2, 0x3ba03b, 0xd8a83b, 0x8a3bc2, 0xd8d8d8, 0x3bc2b8, 0xe07020, 0x5a5a6a, 0xc23b8a];
const PANTS = [0x2a3242, 0x3a2a22, 0x222222, 0x4a5a6a, 0x6a6a72];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4030];

export class PedestrianWorld {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.city = game.city;
    this.rng = mulberry32(game.seed + 31);
    this.peds = [];
    for (let i = 0; i < 28; i++) this.spawnPed();
  }

  makePed(x, z, armed) {
    const mesh = makePersonMesh(
      pick(this.rng, SHIRTS), pick(this.rng, PANTS), pick(this.rng, SKINS));
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = {
      mesh, x, z, heading: this.rng() * Math.PI * 2,
      speed: 1.1 + this.rng() * 0.9, state: 'walk', // walk | flee | fall | dead | fight
      target: this.city.randomSidewalkPoint(this.rng),
      timer: 0, health: 100, armed: !!armed, shootT: 0, walkPhase: this.rng() * 6,
    };
    this.peds.push(ped);
    return ped;
  }

  spawnPed(armed) {
    const p = this.city.randomSidewalkPoint(this.rng);
    return this.makePed(p.x, p.z, armed);
  }

  spawnAt(x, z, armed, count, ringRadius, centerAngle) {
    const out = [];
    for (let i = 0; i < count; i++) {
      let px, pz;
      if (ringRadius) {
        // An arc facing the player (centerAngle), not a full ring: the
        // fighters stand between the player and the objective, in the open.
        const a = centerAngle + (i - (count - 1) / 2) * 0.3;
        px = x + Math.sin(a) * ringRadius;
        pz = z + Math.cos(a) * ringRadius;
      } else {
        px = x + (this.rng() - 0.5) * 10;
        pz = z + (this.rng() - 0.5) * 10;
      }
      out.push(this.makePed(px, pz, armed));
    }
    return out;
  }

  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'dead' || ped.state === 'fall') continue;
      if (ped.state === 'fight') continue; // armed fighters hold their ground
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeFrom = { x, z };
        ped.timer = 2 + this.rng() * 2;
      }
    }
  }

  hitPed(ped, damage, fromX, fromZ) {
    if (ped.state === 'dead') return;
    ped.health -= damage;
    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.timer = 0;
      ped.mesh.rotation.z = Math.PI / 2;
      ped.mesh.position.y = 0.3;
      this.game.addWanted(60, 'Pedestrian down');
    } else if (ped.state === 'fight') {
      // An armed fighter in a gunfight does not run from being shot.
      ped.timer = 3;
    } else {
      ped.state = 'flee';
      ped.fleeFrom = { x: fromX, z: fromZ };
      ped.timer = 3;
      this.game.addWanted(15, 'Assault');
    }
  }

  // A car ploughs into a pedestrian.
  runOver(ped, carSpeed) {
    if (ped.state === 'dead' || ped.state === 'fall') return;
    ped.state = 'fall';
    ped.timer = 2.5;
    ped.health -= 60;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.3;
    const a = Math.atan2(ped.x - this.game.player.x, ped.z - this.game.player.z);
    ped.flyX = Math.sin(a) * carSpeed * 0.35;
    ped.flyZ = Math.cos(a) * carSpeed * 0.35;
    this.game.addWanted(80, 'Hit a pedestrian');
    this.game.audio.thud();
    this.game.fx.blood(ped.x, 0.6, ped.z);
    this.scare(ped.x, ped.z, 22);
  }

  update(dt) {
    const player = this.game.player;
    for (const ped of this.peds) {
      if (ped.state === 'dead') continue;
      const u = ped.mesh.userData;
      if (ped.state === 'fall') {
        ped.timer -= dt;
        ped.x += (ped.flyX || 0) * dt;
        ped.z += (ped.flyZ || 0) * dt;
        ped.flyX = (ped.flyX || 0) * 0.9;
        ped.flyZ = (ped.flyZ || 0) * 0.9;
        if (ped.timer <= 0) {
          if (ped.health <= 0) { ped.state = 'dead'; }
          else {
            ped.state = 'flee';
            ped.fleeFrom = { x: player.x, z: player.z };
            ped.timer = 3;
            ped.mesh.rotation.z = 0;
            ped.mesh.position.y = 0;
          }
        }
        ped.mesh.position.set(ped.x, ped.mesh.position.y, ped.z);
        continue;
      }
      if (ped.state === 'flee') {
        ped.timer -= dt;
        const dx = ped.x - ped.fleeFrom.x, dz = ped.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.x += (dx / d) * 5.2 * dt;
        ped.z += (dz / d) * 5.2 * dt;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.target = this.city.randomSidewalkPoint(this.rng); }
      } else if (ped.state === 'fight') {
        // Armed mission NPC: face the player and shoot back.
        const dx = player.x - ped.x, dz = player.z - ped.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.shootT -= dt;
        if (d < 34 && ped.shootT <= 0 && !player.inCar) {
          ped.shootT = 0.9 + this.rng() * 0.7;
          this.game.fx.npcShot(ped.x, 1.5, ped.z, player.x, player.y + 1.2, player.z);
          if (this.rng() < 0.45) player.damage(6 + this.rng() * 6, 'shot');
        } else if (d < 34 && player.inCar && ped.shootT <= 0) {
          ped.shootT = 1.4;
          this.game.fx.npcShot(ped.x, 1.5, ped.z, player.car.x, 1, player.car.z);
          if (this.rng() < 0.3) this.game.vehicles.damageCar(player.car, 4, 'npc');
        }
      } else {
        // Stroll toward the waypoint, then pick a new one.
        const dx = ped.target.x - ped.x, dz = ped.target.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          if (this.rng() < 0.3) { ped.timer = 2 + this.rng() * 4; ped.state = 'idle'; }
          else ped.target = this.city.randomSidewalkPoint(this.rng);
        } else {
          ped.heading = Math.atan2(dx / d, dz / d);
          ped.x += (dx / d) * ped.speed * dt;
          ped.z += (dz / d) * ped.speed * dt;
        }
      }
      if (ped.state === 'idle') {
        ped.timer -= dt;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.target = this.city.randomSidewalkPoint(this.rng); }
      }
      // Keep pedestrians inside the city and out of buildings.
      const fixed = this.city.clampToCity(ped.x, ped.z);
      ped.x = fixed.x; ped.z = fixed.z;
      ped.walkPhase += dt * (ped.state === 'flee' ? 11 : ped.state === 'walk' ? 6 : 0);
      const swing = Math.sin(ped.walkPhase) * (ped.state === 'walk' || ped.state === 'flee' ? 0.55 : 0.08);
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
      ped.mesh.position.set(ped.x, ped.mesh.position.y, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  clearFighters() {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const ped = this.peds[i];
      if (ped.armed) {
        this.scene.remove(ped.mesh);
        this.peds.splice(i, 1);
      }
    }
  }
}
