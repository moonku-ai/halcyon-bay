// Halcyon Bay — five story missions for Mara Voss, ex-getaway driver:
// pickups, timed drives, a bank job with a shootout, a midnight run under a
// four-star wanted level, and a harbour finale under five stars with the
// helicopter overhead. Each step drives the beacon, the HUD and the minimap.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';
import { SPOTS } from './city.js';
import { fmtDist } from './util.js';

export const MISSIONS = [
  {
    id: 1, title: 'Welcome Back', giver: 'Dex',
    brief: 'Dex: "Mara. You are back in Halcyon Bay, and the city missed you. Iris is waiting at Marina Plaza — pick her up and drive her to the safehouse. Easy money. Do not make me regret this."',
    reward: 800,
    steps: [
      { type: 'goto', x: SPOTS.marinaPlaza.x, z: SPOTS.marinaPlaza.z, r: 7, text: 'Meet Iris at Marina Plaza' },
      { type: 'drive', x: SPOTS.safehouse.x, z: SPOTS.safehouse.z, r: 8, time: 150, text: 'Drive Iris to the safehouse' },
    ],
  },
  {
    id: 2, title: 'Hot Package', giver: 'Iris',
    brief: 'Iris: "A package needs to reach Old Town, and the HBPD knows it is moving. Take it. Do not stop for anyone. If they pull alongside, you were never here."',
    reward: 1500,
    wanted: 1,
    steps: [
      { type: 'drive', x: SPOTS.oldTownDrop.x, z: SPOTS.oldTownDrop.z, r: 8, time: 120, text: 'Deliver the package to Old Town' },
    ],
  },
  {
    id: 3, title: 'The Meridian Job', giver: 'Dex',
    brief: 'Dex: "Meridian Bank. Four guards, one vault, eight seconds of nerve. Iris cracked the door — you just have to hold the room. Take the rifle. Come back rich or do not come back."',
    reward: 6000,
    wanted: 3,
    rifle: true,
    steps: [
      // NOTE (coordinator fix): the bank building's collider spans x[-17,17],
      // z[-13,13] around (0,0), so the closest a player can ever stand to the
      // bank door is ~13.7 units away — the old r=10/r=9 triggers could never
      // fire and the mission was unfinishable. Radii widened past 13.7.
      { type: 'goto', x: SPOTS.bank.x, z: SPOTS.bank.z, r: 16, text: 'Reach Meridian Bank' },
      { type: 'shoot', x: SPOTS.bank.x, z: SPOTS.bank.z, count: 4, text: 'Take out the bank guards (0/4)' },
      { type: 'hold', x: SPOTS.bank.x, z: SPOTS.bank.z, r: 16, seconds: 8, text: 'Hold the vault room' },
      // Hideout sits at a downtown block centre, inside that block's building
      // collider (closest approach ~12.7) — r=9 could never fire either.
      { type: 'escape', x: SPOTS.hideout.x, z: SPOTS.hideout.z, r: 16, text: 'Escape to the hideout' },
    ],
  },
  {
    id: 4, title: 'Midnight Run', giver: 'Sal',
    brief: 'Sal: "A car is sitting in Rook Yard with its engine warm and its plates wrong. Bring it to the docks before midnight turns. Four stars on you the whole way — that is the job."',
    reward: 4000,
    wanted: 4,
    night: true,
    steps: [
      { type: 'goto', x: SPOTS.industrialYard.x, z: SPOTS.industrialYard.z, r: 9, text: 'Reach Rook Yard and take the car' },
      { type: 'drive', x: SPOTS.docks.x, z: SPOTS.docks.z, r: 9, time: 150, text: 'Deliver the hot car to the docks' },
    ],
  },
  {
    id: 5, title: 'Harbor Lights', giver: 'Sal & Dex',
    brief: 'Sal: "The crew that burned us is waiting at the docks, and tonight we settle it. Six of them. Then you run for the lighthouse with every cruiser in the city behind you — and the helicopter. Finish this, Mara, and Halcyon Bay is yours."',
    reward: 25000,
    wanted: 5,
    night: true,
    steps: [
      { type: 'goto', x: SPOTS.docks.x, z: SPOTS.docks.z, r: 12, text: 'Reach the Halcyon Docks' },
      { type: 'shoot', x: SPOTS.docks.x, z: SPOTS.docks.z, count: 6, text: 'Take out the rival crew (0/6)' },
      { type: 'escape', x: SPOTS.lighthouse.x, z: SPOTS.lighthouse.z - 14, r: 10, text: 'Escape to Lighthouse Point' },
    ],
  },
];

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.current = -1; // index into MISSIONS, -1 = none active
    this.stepIndex = 0;
    this.active = false;
    this.completed = new Set();
    this.stepTimer = 0;
    this.holdT = 0;
    this.kills = 0;
    this.fighters = [];
    this.briefing = null; // mission waiting for the player to accept
    this.failedMission = null;
    // Objective beacon: a glowing pillar + a pulsing ring on the ground.
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 26, 14, 1, true);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(geo, this.beaconMat);
    this.beacon.position.y = 13;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.15;
    this.beacon.visible = false;
    this.ring.visible = false;
    this.scene.add(this.beacon, this.ring);
  }

  currentMission() { return this.current >= 0 ? MISSIONS[this.current] : null; }
  currentStep() {
    const m = this.currentMission();
    return m ? m.steps[this.stepIndex] : null;
  }

  objectivePos() {
    const s = this.currentStep();
    return s ? { x: s.x, z: s.z } : null;
  }

  objectiveText() {
    const s = this.currentStep();
    if (!s) return '';
    if (s.type === 'shoot') return s.text.replace(/\(\d+\/\d+\)/, `(${this.kills}/${s.count})`);
    return s.text;
  }

  objectiveDistance() {
    const s = this.currentStep();
    if (!s) return 0;
    const p = this.game.player;
    return Math.hypot(p.x - s.x, p.z - s.z);
  }

  offerBriefing(index) {
    const m = MISSIONS[index];
    if (!m || this.completed.has(m.id)) return;
    this.briefing = m;
    this.game.hud.showBriefing(m);
    this.game.audio.blip(520, 0.15, 'triangle', 0.15);
  }

  acceptBriefing() {
    if (!this.briefing) return;
    const index = MISSIONS.indexOf(this.briefing);
    this.briefing = null;
    this.game.hud.hideBriefing();
    this.startMission(index);
  }

  startMission(index) {
    const m = MISSIONS[index];
    this.current = index;
    this.stepIndex = 0;
    this.active = true;
    this.kills = 0;
    this.holdT = 0;
    this.clearFighters();
    if (m.night) this.game.setTimeOfDay(22);
    else if (this.game.city.timeOfDay >= 20 || this.game.city.timeOfDay < 6) this.game.setTimeOfDay(13);
    if (m.wanted) this.game.setWanted(m.wanted);
    if (m.rifle) { this.game.player.weapon = 'rifle'; this.game.toast('Rifle acquired — hold Click to fire'); }
    this.setupStep();
    this.game.hud.showObjective(m.title, this.objectiveText());
    this.game.audio.blip(660, 0.12, 'triangle', 0.15);
    this.game.audio.blip(880, 0.18, 'triangle', 0.15, 0.12);
  }

  setupStep() {
    const s = this.currentStep();
    if (!s) return;
    this.stepTimer = s.time || 0;
    this.holdT = 0;
    this.beacon.visible = true;
    this.ring.visible = true;
    this.beacon.position.set(s.x, 13, s.z);
    this.ring.position.set(s.x, 0.15, s.z);
    if (s.type === 'shoot') {
      this.kills = 0;
      // Guards stand in an arc facing the player, out on the street —
      // never inside the building the objective sits on.
      const p = this.game.player;
      const toward = Math.atan2(p.x - s.x, p.z - s.z);
      this.fighters = this.game.peds.spawnAt(s.x, s.z, true, s.count, 20, toward);
      for (const f of this.fighters) { f.state = 'fight'; f.health = 60; }
    }
    this.game.hud.showObjective(this.currentMission().title, this.objectiveText());
  }

  advanceStep() {
    const m = this.currentMission();
    this.stepIndex++;
    if (this.stepIndex >= m.steps.length) this.completeMission();
    else this.setupStep();
  }

  completeMission() {
    const m = this.currentMission();
    this.active = false;
    this.completed.add(m.id);
    this.beacon.visible = false;
    this.ring.visible = false;
    this.clearFighters();
    this.game.cash += m.reward;
    this.game.audio.missionDone();
    this.game.audio.cash();
    this.game.hud.showObjective('', '');
    this.game.toast(`Mission complete: ${m.title} — +$${m.reward.toLocaleString('en-US')}`);
    this.game.setWanted(0);
    this.game.saveGame();
    if (this.current + 1 < MISSIONS.length) {
      this.offerBriefing(this.current + 1);
    } else {
      this.game.hud.showBanner('STORY COMPLETE', 'Halcyon Bay is yours, Mara. Free roam — replay any mission from the pause menu.');
      this.current = -1;
    }
  }

  failMission(reason) {
    const m = this.currentMission();
    if (!m) return;
    this.active = false;
    this.beacon.visible = false;
    this.ring.visible = false;
    this.clearFighters();
    this.game.audio.missionFail();
    this.game.hud.showBanner('MISSION FAILED', reason + ' — press Enter to retry.');
    this.failedMission = m;
    this.current = -1;
    this.game.saveGame();
  }

  retryFailed() {
    if (!this.failedMission) return;
    const m = this.failedMission;
    this.failedMission = null;
    this.game.hud.hideBanner();
    this.game.state = 'play';
    this.game.hud.hideScreens();
    // Patch Mara up: without this she restarts the mission at 0 HP and the
    // regen in player.update (which needs health > 0) can never revive her.
    this.game.player.health = this.game.player.maxHealth;
    this.startMission(MISSIONS.indexOf(m));
  }

  onFighterDown(ped) {
    const s = this.currentStep();
    if (!this.active || !s || s.type !== 'shoot') return;
    this.kills++;
    this.game.hud.showObjective(this.currentMission().title, this.objectiveText());
    if (this.kills >= s.count) this.advanceStep();
  }

  clearFighters() {
    for (const f of this.fighters) {
      if (f.state !== 'dead') {
        f.state = 'walk';
        f.armed = false;
        f.target = this.game.city.randomSidewalkPoint(this.game.rng);
      }
    }
    this.fighters = [];
  }

  update(dt) {
    if (!this.active) return;
    const m = this.currentMission();
    const s = this.currentStep();
    if (!s) return;
    const p = this.game.player;
    // Pulse the beacon.
    const pulse = 1 + Math.sin(this.game.elapsed * 3) * 0.12;
    this.ring.scale.setScalar(pulse);
    this.beaconMat.opacity = 0.12 + Math.sin(this.game.elapsed * 3) * 0.05;
    // Mission timers.
    if (s.time) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.failMission('Out of time on: ' + s.text);
        return;
      }
    }
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (s.type === 'goto' || s.type === 'escape') {
      if (d < s.r) {
        this.game.audio.pickup();
        this.advanceStep();
      }
    } else if (s.type === 'drive') {
      if (d < s.r) {
        if (p.inCar) { this.game.audio.pickup(); this.advanceStep(); }
        else this.game.hud.showHint('Get in a car to finish the drive!');
      }
    } else if (s.type === 'hold') {
      if (d < s.r) {
        this.holdT += dt;
        this.game.hud.showObjective(m.title, `${s.text} — ${Math.ceil(s.seconds - this.holdT)}s`);
        if (this.holdT >= s.seconds) this.advanceStep();
      } else {
        this.holdT = 0;
        this.game.hud.showObjective(m.title, s.text);
      }
    }
    // Mission wanted floor: the heat never cools below the mission's level.
    if (m.wanted && this.game.wanted < m.wanted) this.game.setWanted(m.wanted);
    if (s.type === 'shoot') this.game.hud.showObjective(m.title, this.objectiveText());
  }

  markerForMinimap() {
    const s = this.currentStep();
    return this.active && s ? { x: s.x, z: s.z } : null;
  }
}

export function missionObjectiveLabel(missions) {
  const m = missions.currentMission();
  if (!m) return null;
  return { title: m.title, text: missions.objectiveText(), dist: fmtDist(missions.objectiveDistance()) };
}
