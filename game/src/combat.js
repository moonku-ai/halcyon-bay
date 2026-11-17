// Halcyon Bay — combat feedback: a pooled particle system, explosions with a
// light flash, muzzle flashes, tracers, smoke, sparks and blood puffs.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';

const MAX_PARTICLES = 420;

export class CombatFX {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, grav: 0, size: 1 });
    }
    this.cursor = 0;
    this.flash = new THREE.PointLight(0xffc46b, 0, 18, 1.6);
    this.scene.add(this.flash);
    this.flashT = 0;
    // Reusable tracer line.
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(this.tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.tracerT = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, color, size, grav) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.mesh.scale.setScalar(size);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life;
    p.grav = grav || 0; p.size = size;
  }

  burst(x, y, z, n, color, speed, life, size, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z,
        Math.cos(a) * Math.cos(b) * s,
        Math.sin(b) * s + speed * 0.3,
        Math.sin(a) * Math.cos(b) * s,
        life * (0.6 + Math.random() * 0.7), color, size * (0.7 + Math.random() * 0.6), grav);
    }
  }

  sparks(x, y, z) { this.burst(x, y, z, 14, 0xffd76a, 7, 0.5, 1, 9); }
  blood(x, y, z) { this.burst(x, y, z, 12, 0x8a1212, 3, 0.7, 1.1, 8); }
  smoke(x, y, z, n) {
    for (let i = 0; i < (n || 8); i++) {
      this.spawn(x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6,
        1.4 + Math.random(), 0x555555, 1.6 + Math.random(), -0.6);
    }
  }

  muzzle(x, y, z) {
    this.flash.position.set(x, y, z);
    this.flash.intensity = 60;
    this.flashT = 0.06;
    this.burst(x, y, z, 5, 0xffc46b, 4, 0.12, 0.9, 0);
  }

  drawTracer(x1, y1, z1, x2, y2, z2) {
    const pos = this.tracerGeo.attributes.position.array;
    pos[0] = x1; pos[1] = y1; pos[2] = z1;
    pos[3] = x2; pos[4] = y2; pos[5] = z2;
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracer.material.opacity = 0.9;
    this.tracerT = 0.09;
  }

  npcShot(x, y, z, tx, ty, tz) {
    this.drawTracer(x, y, z, tx, ty, tz);
    this.muzzle(x, y, z);
  }

  explode(x, y, z, scale) {
    const s = scale || 1;
    this.burst(x, y, z, 26, 0xff7a2a, 9 * s, 0.8, 1.6, 6);
    this.burst(x, y, z, 18, 0xffd76a, 12 * s, 0.5, 1.2, 4);
    this.smoke(x, y + 1, z, 14);
    this.flash.position.set(x, y + 1.5, z);
    this.flash.intensity = 260 * s;
    this.flashT = 0.22;
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vy -= p.grav * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.1) { p.mesh.position.y = 0.1; p.vy = Math.abs(p.vy) * 0.3; }
      const f = p.life / p.maxLife;
      p.mesh.material.opacity = f;
      p.mesh.scale.setScalar(p.size * (0.5 + f * 0.7));
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity *= Math.pow(0.0001, dt * 4);
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerT / 0.09) * 0.9;
    }
  }
}

// Hitscan shooting, shared by the player and used for mission targets.
export class Combat {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ray.far = 90;
  }

  shootFrom(origin, dir, shooter) {
    const game = this.game;
    this.ray.set(origin, dir);
    // Targets: cars, pedestrians, mission fighters.
    const targets = [];
    for (const car of game.vehicles.cars) {
      if (!car.exploded) targets.push(car.mesh);
    }
    for (const ped of game.peds.peds) {
      if (ped.state !== 'dead') targets.push(ped.mesh);
    }
    const hits = this.ray.intersectObjects(targets, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(80));
    let hitSomething = false;
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      hitSomething = true;
      // Walk up to the object that owns userData-free group: find the car/ped.
      let obj = h.object;
      while (obj && !obj.userData.isCar && !obj.userData.isPed) obj = obj.parent;
      const car = game.vehicles.cars.find((c) => c.mesh === obj);
      if (car) {
        game.vehicles.damageCar(car, 34, shooter === 'player' ? 'player' : 'npc');
        game.fx.sparks(h.point.x, h.point.y, h.point.z);
      } else {
        const ped = game.peds.peds.find((p) => p.mesh === obj);
        if (ped) {
          game.peds.hitPed(ped, 50, origin.x, origin.z);
          game.fx.blood(h.point.x, h.point.y, h.point.z);
          if (shooter === 'player' && ped.armed) game.missions.onFighterDown(ped);
        }
      }
    } else {
      // Ground / building hit: dust puff where the ray ends low.
      if (end.y < 0.2) game.fx.burst(end.x, 0.3, end.z, 4, 0x9a9a9a, 2, 0.4, 0.8, 5);
    }
    // Muzzle + tracer from the gun tip.
    const muzzlePos = origin.clone().add(dir.clone().multiplyScalar(0.7));
    muzzlePos.y -= 0.08;
    game.fx.muzzle(muzzlePos.x, muzzlePos.y, muzzlePos.z);
    game.fx.drawTracer(muzzlePos.x, muzzlePos.y, muzzlePos.z, end.x, end.y, end.z);
    game.audio.gunshot();
    game.peds.scare(origin.x, origin.z, 26);
    return hitSomething;
  }
}
