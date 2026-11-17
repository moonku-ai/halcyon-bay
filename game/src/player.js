// Halcyon Bay — the player: on-foot movement and shooting, arcade car driving
// with steering, drifting and collisions, entering and stealing cars, health,
// cash stashes hidden around the city, and the third-person camera rig.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, angleLerp, angleDiff, collideCircleAABBs } from './util.js';
import { makePersonMesh, makePistolMesh } from './models.js';
import { CITY_HALF } from './city.js';

const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.5;
const CAR_TOP_SPEED = 34;
const CAR_ACCEL = 15;
const CAR_BRAKE = 30;

export class Player {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.city = game.city;
    this.x = -52; this.z = 150; // Marina Plaza start
    this.y = 0;
    this.heading = 0; // facing north, into the city
    this.camYaw = 0;
    this.camPitch = 0.22;
    this.camDist = 6.5;
    this.inCar = false;
    this.car = null;
    this.carSpeed = 0;
    this.steer = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.lastDamageT = -99;
    this.bustedT = 0;
    this.weapon = 'pistol';
    this.fireT = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.mesh = makePersonMesh(0x2e6a8a, 0x2a3242, 0xe8b88a);
    this.mesh.position.set(this.x, 0, this.z);
    this.scene.add(this.mesh);
    this.gun = makePistolMesh();
    this.gun.position.set(0.42, 1.25, 0.1);
    this.gun.visible = true;
    this.mesh.add(this.gun);
    // Headlights for the player's car (one spotlight, night only).
    this.headlight = new THREE.SpotLight(0xfff2c0, 0, 55, 0.42, 0.5, 1.1);
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);
    this.stashes = [];
    this.spawnStashes();
  }

  spawnStashes() {
    const rng = this.game.rng;
    const mat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a, emissive: 0x35c24a, emissiveIntensity: 0.9 });
    for (let i = 0; i < 8; i++) {
      const p = this.city.randomSidewalkPoint(rng);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), mat);
      mesh.position.set(p.x, 0.7, p.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.stashes.push({ mesh, x: p.x, z: p.z, taken: false, phase: rng() * 6 });
    }
  }

  reset(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading ?? this.heading;
    this.camYaw = this.heading;
    this.health = this.maxHealth;
    this.bustedT = 0;
    this.exitCar(true);
    this.mesh.visible = true;
    this.mesh.position.set(x, 0, z);
  }

  damage(amount, cause) {
    if (this.game.state !== 'play') return;
    if (this.game.shotMode) return; // staged screenshots never kill the player
    this.health -= amount;
    this.lastDamageT = this.game.elapsed;
    this.game.hud.flashDamage();
    this.game.cameraShake(0.35);
    if (this.health <= 0) {
      this.health = 0;
      this.game.wasted(cause);
    }
  }

  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  enterCar(car) {
    if (this.inCar) return;
    if (car.kind === 'police') this.game.addWanted(50, 'Stole a police cruiser');
    else if (car.kind === 'traffic' || car.kind === 'taxi') {
      this.game.addWanted(30, 'Carjacked a driver');
      if (car.driver) {
        const ped = this.game.peds.makePed(car.x + 2, car.z + 2, false);
        ped.state = 'flee';
        ped.fleeFrom = { x: car.x, z: car.z };
        ped.timer = 4;
        car.driver = false;
      }
    }
    this.inCar = true;
    this.car = car;
    car.isPlayerCar = true;
    car.speed = 0;
    this.carSpeed = 0;
    this.mesh.visible = false;
    this.game.audio.setEngine(0, true);
    this.game.toast(car.kind === 'police' ? 'HBPD cruiser — the whole city is coming.' : 'Car acquired. Drive, Mara.');
  }

  exitCar(silent) {
    if (!this.inCar || !this.car) return;
    const car = this.car;
    car.isPlayerCar = false;
    car.speed = 0;
    this.carSpeed = 0;
    const side = Math.cos(car.heading) >= 0 ? 1 : -1;
    this.x = car.x + side * 2.4;
    this.z = car.z + 1.5;
    const fixed = collideCircleAABBs(this.x, this.z, 0.7, this.city.colliders);
    this.x = fixed.x; this.z = fixed.z;
    this.inCar = false;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.game.audio.setEngine(0, false);
    if (!silent) this.game.audio.blip(300, 0.06, 'square', 0.08);
  }

  ejectFromExplosion() {
    if (!this.car) return;
    const car = this.car;
    this.x = car.x + 3; this.z = car.z + 3;
    this.inCar = false;
    this.car = null;
    this.carSpeed = 0;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.game.audio.setEngine(0, false);
    this.damage(40, 'explosion');
  }

  tryEnterCar() {
    const car = this.game.vehicles.nearestCar(this.x, this.z, 3.4, ['parked', 'traffic', 'taxi', 'police']);
    if (car) this.enterCar(car);
    else this.game.audio.denied();
  }

  shoot() {
    if (this.inCar || this.fireT > 0 || this.game.state !== 'play') return;
    const rate = this.weapon === 'rifle' ? 0.1 : 0.3;
    this.fireT = rate;
    const cam = this.game.camera;
    const origin = new THREE.Vector3(this.x, 1.5, this.z);
    // Aim from the camera centre: the shot starts at the player, flies where the camera looks.
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.y += 0.02;
    dir.normalize();
    const spread = this.weapon === 'rifle' ? 0.008 : 0.02;
    dir.x += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    this.game.combat.shootFrom(origin, dir, 'player');
    this.game.addWanted(4, 'Fired a weapon');
  }

  update(dt) {
    const game = this.game;
    const input = game.input;
    this.fireT = Math.max(0, this.fireT - dt);
    if (input.shootHeld) this.shoot();
    // Slow health regen after a quiet spell.
    if (game.elapsed - this.lastDamageT > 7 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 3.5 * dt);
    }
    // Camera orbit from mouse / arrow keys.
    this.camYaw += input.mouseDX * 0.0032;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0022, -0.05, 0.62);
    input.mouseDX = 0; input.mouseDY = 0;
    if (input.keys.has('ArrowLeft')) this.camYaw += 1.9 * dt;
    if (input.keys.has('ArrowRight')) this.camYaw -= 1.9 * dt;
    if (this.inCar) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);
    // Cash stashes.
    for (const s of this.stashes) {
      if (s.taken) continue;
      s.phase += dt;
      s.mesh.position.y = 0.7 + Math.sin(s.phase * 2.2) * 0.14;
      s.mesh.rotation.y += dt * 1.2;
      if (Math.hypot(this.x - s.x, this.z - s.z) < 2.1) {
        s.taken = true;
        this.scene.remove(s.mesh);
        game.cash += 250;
        game.audio.cash();
        game.toast('Found a stash: +$250');
        game.hud.flashCash();
      }
    }
    this.updateCamera(dt);
    this.updateHeadlight();
  }

  updateOnFoot(dt, input) {
    const k = input.keys;
    // Camera-relative movement.
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rightX = -fwdZ, rightZ = fwdX;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) { mx += fwdX; mz += fwdZ; }
    if (k.has('KeyS') || k.has('ArrowDown')) { mx -= fwdX; mz -= fwdZ; }
    if (k.has('KeyA')) { mx -= rightX; mz -= rightZ; }
    if (k.has('KeyD')) { mx += rightX; mz += rightZ; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0;
    if (this.moving) {
      mx /= len; mz /= len;
      const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * (sprint ? 13 : 9);
    }
    // Buildings + city bounds.
    const fixed = collideCircleAABBs(this.x, this.z, 0.7, this.city.colliders);
    this.x = fixed.x; this.z = fixed.z;
    const c = this.city.clampToCity(this.x, this.z);
    this.x = c.x; this.z = c.z;
    // Walk animation.
    const u = this.mesh.userData;
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  updateDriving(dt, input) {
    const k = input.keys;
    const car = this.car;
    if (!car) { this.inCar = false; return; }
    const forward = k.has('KeyW') || k.has('ArrowUp');
    const back = k.has('KeyS') || k.has('ArrowDown');
    const handbrake = k.has('Space');
    if (forward) this.carSpeed += CAR_ACCEL * dt;
    if (back) {
      if (this.carSpeed > 0.5) this.carSpeed -= CAR_BRAKE * dt;
      else this.carSpeed -= CAR_ACCEL * 0.55 * dt;
    }
    if (handbrake) this.carSpeed -= Math.sign(this.carSpeed) * 22 * dt;
    if (!forward && !back) this.carSpeed -= this.carSpeed * 0.55 * dt;
    this.carSpeed = clamp(this.carSpeed, -9, CAR_TOP_SPEED);
    if (Math.abs(this.carSpeed) < 0.05 && !forward && !back) this.carSpeed = 0;
    // Steering: sharper at low speed, looser at top speed.
    const steerInput = (k.has('KeyA') ? 1 : 0) - (k.has('KeyD') ? 1 : 0);
    const steerTarget = steerInput * 0.55 * (1 - Math.min(0.55, Math.abs(this.carSpeed) / CAR_TOP_SPEED * 0.55)) * (handbrake ? 1.5 : 1);
    this.steer = lerp(this.steer, steerTarget, dt * 7);
    const dirSign = this.carSpeed >= 0 ? 1 : -1;
    car.heading += this.steer * (Math.abs(this.carSpeed) / 5.2) * dt * dirSign;
    const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
    car.x += fx * this.carSpeed * dt;
    car.z += fz * this.carSpeed * dt;
    this.x = car.x; this.z = car.z;
    this.heading = car.heading;
    // Buildings.
    const fixed = collideCircleAABBs(car.x, car.z, 1.75, this.city.colliders);
    const hitWall = fixed.pushed;
    if (hitWall) {
      if (Math.abs(this.carSpeed) > 8) {
        this.game.vehicles.damageCar(car, 6, 'crash');
        this.game.fx.sparks(car.x, 0.8, car.z);
        this.game.audio.thud();
        this.game.cameraShake(0.3);
      }
      car.x = fixed.x; car.z = fixed.z;
      this.carSpeed *= 0.45;
      this.x = car.x; this.z = car.z;
    }
    const c = this.city.clampToCity(car.x, car.z);
    if (c.x !== car.x || c.z !== car.z) { car.x = c.x; car.z = c.z; this.carSpeed *= 0.5; }
    // Other cars: soft push + scrape damage.
    for (const other of this.game.vehicles.cars) {
      if (other === car || other.exploded) continue;
      const dx = car.x - other.x, dz = car.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        car.x += nx * push; car.z += nz * push;
        other.x -= nx * push * 0.6; other.z -= nz * push * 0.6;
        other.mesh.position.set(other.x, 0, other.z);
        const impact = Math.abs(this.carSpeed);
        if (impact > 6) {
          this.game.vehicles.damageCar(other, 8, 'crash');
          this.game.vehicles.damageCar(car, 4, 'crash');
          this.game.fx.sparks(car.x, 0.9, car.z);
          this.game.audio.thud();
          this.carSpeed *= 0.6;
        }
      }
    }
    // Pedestrians in the way.
    for (const ped of this.game.peds.peds) {
      if (ped.state === 'dead' || ped.state === 'fall') continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 2.3 && Math.abs(this.carSpeed) > 3) this.game.peds.runOver(ped, Math.abs(this.carSpeed));
      else if (d < 3.5 && Math.abs(this.carSpeed) > 1) this.game.peds.scare(ped.x, ped.z, 1);
    }
    car.speed = this.carSpeed;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = this.carSpeed * dt * 1.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    // Engine sound follows speed.
    this.game.audio.setEngine(Math.abs(this.carSpeed) / CAR_TOP_SPEED, true);
    // Camera follows the car (behind it: offset is +forward when camYaw == heading).
    this.camYaw = angleLerp(this.camYaw, car.heading, dt * 2.2);
  }

  updateCamera(dt) {
    const cam = this.game.camera;
    const speedNorm = this.inCar ? Math.abs(this.carSpeed) / CAR_TOP_SPEED : 0;
    const dist = this.inCar ? 10.5 : 6.8;
    const height = this.inCar ? 3.4 : 2.6;
    // Camera sits behind the yaw direction, looking at the player.
    const cx = this.x + Math.sin(this.camYaw) * dist;
    const cz = this.z + Math.cos(this.camYaw) * dist;
    const cy = height + this.camPitch * 4;
    cam.position.x = lerp(cam.position.x, cx, 1 - Math.pow(0.0001, dt));
    cam.position.y = lerp(cam.position.y, cy, 1 - Math.pow(0.0001, dt));
    cam.position.z = lerp(cam.position.z, cz, 1 - Math.pow(0.0001, dt));
    const lookY = this.inCar ? 1.4 : 1.5;
    cam.lookAt(this.x, lookY, this.z);
    // FOV kick with speed + shake.
    const targetFov = 62 + speedNorm * 9;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov = lerp(cam.fov, targetFov, dt * 4);
      cam.updateProjectionMatrix();
    }
    if (this.game.shakeAmp > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.game.shakeAmp;
      cam.position.y += (Math.random() - 0.5) * this.game.shakeAmp * 0.6;
      cam.position.z += (Math.random() - 0.5) * this.game.shakeAmp;
    }
  }

  updateHeadlight() {
    const on = this.inCar && this.city.isNight && this.car;
    this.headlight.intensity = on ? 700 : 0;
    if (on) {
      const fx = -Math.sin(this.car.heading), fz = -Math.cos(this.car.heading);
      this.headlight.position.set(this.car.x + fx * 2, 1.1, this.car.z + fz * 2);
      this.headlight.target.position.set(this.car.x + fx * 24, 0, this.car.z + fz * 24);
      this.car.mesh.userData.headMat.emissiveIntensity = 1.6;
    } else if (this.car) {
      this.car.mesh.userData.headMat.emissiveIntensity = 0.25;
    }
  }
}
