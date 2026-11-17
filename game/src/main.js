// Halcyon Bay — bootstrap and game loop: renderer, lights and shadows, input,
// the wanted system, save flow, state machine (title / play / pause / wasted /
// busted) and the debug handle the playtest scripts read.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';
import { City, SPOTS } from './city.js';
import { VehicleWorld } from './vehicles.js';
import { PedestrianWorld } from './pedestrians.js';
import { CombatFX, Combat } from './combat.js';
import { Player } from './player.js';
import { MissionSystem, MISSIONS } from './missions.js';
import { HUD } from './hud.js';
import { SoundEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { stageShot } from './shots.js';
import { mulberry32, hashSeed, lerp } from './util.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotName = params.get('shot');
const perfLow = params.get('perf') === 'low';

// --- Renderer, scene, camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(perfLow ? 1 : Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = !perfLow;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc3ea);
scene.fog = new THREE.Fog(0xa8c8e0, 130, 480);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(-52, 4, 162);

const sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -130;
sun.shadow.camera.right = 130;
sun.shadow.camera.top = 130;
sun.shadow.camera.bottom = -130;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xbdd8f0, 0x3a3f2e, 0.6);
scene.add(hemi);

// --- The game object every system shares ---
const game = {
  seed, rng: mulberry32(seed),
  scene, camera, renderer, sun, hemi,
  city: null, fx: null, combat: null, vehicles: null, peds: null,
  player: null, missions: null, hud: null, audio: new SoundEngine(),
  state: 'title',
  elapsed: 0,
  cash: 500,
  wanted: 0,
  wantedPts: 0,
  lastCrimeT: -99,
  shakeAmp: 0,
  shotMode: false,
  autosaveT: 0,
  input: { keys: new Set(), mouseDX: 0, mouseDY: 0, shootHeld: false },
};

game.city = new City(scene, seed);
game.fx = new CombatFX(scene);
game.combat = new Combat(game);
game.vehicles = new VehicleWorld(game);
game.peds = new PedestrianWorld(game);
game.player = new Player(game);
game.missions = new MissionSystem(game);
game.hud = new HUD(game);

game.setTimeOfDay = (hours) => {
  game.city.setTimeOfDay(hours, game.sun, game.hemi, game.scene);
};

game.toast = (msg) => game.hud.toast(msg);

game.cameraShake = (amp) => { game.shakeAmp = Math.max(game.shakeAmp, amp); };

game.setWanted = (level) => {
  game.wanted = Math.max(0, Math.min(5, level));
  game.wantedPts = game.wanted * 100;
  game.lastCrimeT = game.elapsed;
};

game.addWanted = (pts, reason) => {
  if (game.state !== 'play') return;
  const before = game.wanted;
  game.wantedPts = Math.min(500, game.wantedPts + pts);
  game.lastCrimeT = game.elapsed;
  game.wanted = Math.min(5, Math.floor(game.wantedPts / 100));
  if (game.wanted > before) {
    game.toast(`Wanted level ${game.wanted} — HBPD responding${game.wanted >= 5 ? ' — helicopter overhead!' : ''}`);
    game.audio.blip(440, 0.2, 'square', 0.1);
  }
};

game.saveGame = () => saveGame(game);

game.wasted = (cause) => {
  if (game.state !== 'play') return;
  game.state = 'wasted';
  if (game.missions.active) game.missions.failMission('Mara went down');
  game.audio.setEngine(0, false);
  game.audio.setSiren(false);
  game.audio.missionFail();
  game.hud.showScreen('wasted');
  if (document.pointerLockElement) document.exitPointerLock();
  game.saveGame();
};

game.busted = () => {
  if (game.state !== 'play') return;
  game.state = 'busted';
  if (game.missions.active) game.missions.failMission('Busted by the HBPD');
  game.audio.setEngine(0, false);
  game.audio.setSiren(false);
  game.hud.showScreen('busted');
  if (document.pointerLockElement) document.exitPointerLock();
  game.saveGame();
};

game.respawn = (kind) => {
  const fine = kind === 'wasted' ? 150 : 200;
  game.cash = Math.max(0, game.cash - fine);
  const spot = kind === 'wasted' ? SPOTS.hospital : SPOTS.policeStation;
  game.player.reset(spot.x, spot.z, 0);
  game.player.health = game.player.maxHealth;
  game.setWanted(0);
  game.state = 'play';
  game.hud.hideScreens();
  game.toast(kind === 'wasted' ? `Patched up at General Hospital (−$${fine})` : `Released from HBPD Central (−$${fine})`);
  game.saveGame();
};

game.newGame = () => {
  clearSave();
  game.cash = 500;
  game.missions.completed = new Set();
  game.missions.current = -1;
  game.missions.active = false;
  game.missions.failedMission = null;
  game.missions.briefing = null;
  game.player.weapon = 'pistol';
  game.player.reset(SPOTS.marinaPlaza.x, SPOTS.marinaPlaza.z + 6, 0);
  game.setTimeOfDay(13);
  game.setWanted(0);
  game.state = 'play';
  game.hud.hideScreens();
  game.hud.hideBriefing();
  game.missions.offerBriefing(0);
  game.saveGame();
};

game.continueGame = () => {
  if (!loadGame(game)) { game.newGame(); return; }
  game.state = 'play';
  game.hud.hideScreens();
  game.hud.hideBriefing();
  const next = MISSIONS.findIndex((m) => !game.missions.completed.has(m.id));
  if (next >= 0) game.missions.offerBriefing(next);
  else game.toast('Story complete — free roam. Replay missions from the pause menu.');
};

game.togglePause = () => {
  if (game.state === 'play') {
    game.state = 'pause';
    game.hud.refreshMissionList(game.missions.completed, (i) => {
      game.hud.hideScreens();
      game.state = 'play';
      game.missions.startMission(i);
    });
    game.hud.showScreen('pause');
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (game.state === 'pause') {
    game.state = 'play';
    game.hud.hideScreens();
  }
};

game.quitToTitle = () => {
  game.saveGame();
  game.state = 'title';
  game.hud.hideBriefing();
  game.hud.continueBtn.style.display = hasSave() ? 'block' : 'none';
  game.hud.showScreen('title');
  game.audio.setEngine(0, false);
  game.audio.setSiren(false);
};

let howFrom = 'title';
game.showHowTo = (from) => {
  howFrom = from;
  if (from === 'pause' && game.state === 'play') game.state = 'pause';
  game.hud.showScreen('how');
};
game.closeHowTo = () => game.hud.showScreen(howFrom === 'pause' ? 'pause' : 'title');

// --- Input ---
const canvas = renderer.domElement;
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  game.input.keys.add(e.code);
  if (e.code === 'Enter') {
    // Do not let a focused button also fire its click on Enter.
    e.preventDefault();
    if (game.missions.briefing) game.missions.acceptBriefing();
    else if (game.missions.failedMission) game.missions.retryFailed();
    else if (game.state === 'wasted') game.respawn('wasted');
    else if (game.state === 'busted') game.respawn('busted');
    else if (game.state === 'title') game.newGame();
    else if (game.state === 'pause') game.togglePause();
  }
  if (e.code === 'KeyE' && game.state === 'play') {
    if (game.player.inCar) game.player.exitCar();
    else game.player.tryEnterCar();
  }
  if (e.code === 'KeyF' && game.state === 'play') game.input.shootHeld = true;
  if ((e.code === 'Escape' || e.code === 'KeyP') && (game.state === 'play' || game.state === 'pause')) {
    if (game.missions.briefing && game.state === 'play') {
      game.missions.briefing = null;
      game.hud.hideBriefing();
      game.toast('Mission postponed — restart it from the pause menu.');
    } else game.togglePause();
  }
  if (e.code === 'KeyM') {
    game.audio.setMuted(!game.audio.muted);
    game.toast(game.audio.muted ? 'Sound muted (M to unmute)' : 'Sound on');
  }
  if (e.code === 'KeyH' && game.state === 'play') game.showHowTo('pause');
});
addEventListener('keyup', (e) => {
  game.input.keys.delete(e.code);
  if (e.code === 'KeyF') game.input.shootHeld = false;
});
let dragging = false;
let lastMX = 0, lastMY = 0;
canvas.addEventListener('mousedown', (e) => {
  game.audio.init();
  dragging = true;
  lastMX = e.clientX; lastMY = e.clientY;
  if (e.button === 0 && game.state === 'play') game.input.shootHeld = true;
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
});
addEventListener('mouseup', (e) => {
  dragging = false;
  if (e.button === 0) game.input.shootHeld = false;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    game.input.mouseDX += e.movementX;
    game.input.mouseDY += e.movementY;
  } else if (dragging) {
    game.input.mouseDX += e.clientX - lastMX;
    game.input.mouseDY += e.clientY - lastMY;
    lastMX = e.clientX; lastMY = e.clientY;
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// First gesture unlocks audio.
addEventListener('pointerdown', () => game.audio.init(), { once: true });
addEventListener('keydown', () => game.audio.init(), { once: true });

// --- Buttons (blur after click so Enter/Space never re-fires them) ---
const click = (el, fn) => el.addEventListener('click', () => { el.blur(); fn(); });
click(game.hud.newBtn, () => { game.audio.init(); game.newGame(); });
click(game.hud.continueBtn, () => { game.audio.init(); game.continueGame(); });
click(game.hud.howBtn, () => game.showHowTo('title'));
click(game.hud.resumeBtn, () => game.togglePause());
click(game.hud.pauseHowBtn, () => game.showHowTo('pause'));
click(game.hud.quitBtn, () => game.quitToTitle());
click(game.hud.wastedBtn, () => game.respawn('wasted'));
click(game.hud.bustedBtn, () => game.respawn('busted'));
click(game.hud.howCloseBtn, () => game.closeHowTo());

// --- Wanted decay ---
function decayWanted(dt) {
  if (game.wantedPts <= 0) return;
  if (game.elapsed - game.lastCrimeT < 9) return;
  const m = game.missions.currentMission();
  const floor = game.missions.active && m && m.wanted ? m.wanted * 100 : 0;
  const before = game.wanted;
  game.wantedPts = Math.max(floor, game.wantedPts - 12 * dt);
  game.wanted = Math.min(5, Math.floor(game.wantedPts / 100));
  if (before > 0 && game.wanted === 0) game.toast('You lost the heat.');
}

// --- Sun follows the player so shadows stay local ---
function updateSun() {
  const p = game.player;
  const d = game.city.sunDir || new THREE.Vector3(0.5, 0.8, 0.25);
  sun.position.set(p.x + d.x * 260, p.y + d.y * 260, p.z + d.z * 260);
  sun.target.position.set(p.x, 0, p.z);
  sun.target.updateMatrixWorld();
}

// --- Main loop ---
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.elapsed += dt;
  game.shakeAmp = Math.max(0, game.shakeAmp - dt * 2.4);
  if (game.state === 'play') {
    game.player.update(dt);
    game.vehicles.update(dt);
    game.peds.update(dt);
    game.missions.update(dt);
    game.fx.update(dt);
    decayWanted(dt);
    game.autosaveT += dt;
    if (game.autosaveT > 20) { game.autosaveT = 0; game.saveGame(); }
  } else if (game.state === 'title') {
    game.vehicles.update(dt);
    game.peds.update(dt);
    game.fx.update(dt);
    // Cinematic establishing shot: high over the bay, slow pan across the skyline.
    const t = game.elapsed * 0.05;
    const cx = -70 + Math.sin(t) * 26;
    const cz = 218 + Math.cos(t * 0.7) * 8;
    camera.position.x = lerp(camera.position.x, cx, 1 - Math.pow(0.01, dt));
    camera.position.y = lerp(camera.position.y, 26, 1 - Math.pow(0.01, dt));
    camera.position.z = lerp(camera.position.z, cz, 1 - Math.pow(0.01, dt));
    camera.lookAt(0, 14, -40);
    if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = lerp(camera.fov, 55, dt * 2); camera.updateProjectionMatrix(); }
  } else {
    game.fx.update(dt);
  }
  updateSun();
  game.hud.update(dt, game);
  renderer.render(scene, camera);
}

// --- Start ---
game.setTimeOfDay(13);
game.hud.continueBtn.style.display = hasSave() ? 'block' : 'none';
if (shotName) {
  stageShot(shotName, game);
} else {
  game.state = 'title';
  game.hud.showScreen('title');
}
animate();

// Debug handle for playtests: window.__hb.state() is a plain summary.
window.__hb = game;
window.__hbState = () => ({
  state: game.state,
  wanted: game.wanted,
  cash: game.cash,
  health: Math.round(game.player.health),
  inCar: game.player.inCar,
  carSpeed: Math.round(Math.abs(game.player.carSpeed || 0) * 3.6),
  mission: game.missions.currentMission()?.title || null,
  missionActive: game.missions.active,
  missionStep: game.missions.currentStep()?.text || null,
  missionStepTimer: Math.round(game.missions.stepTimer || 0),
  completed: [...game.missions.completed],
  briefing: game.missions.briefing?.title || null,
  failedMission: game.missions.failedMission?.title || null,
  x: Math.round(game.player.x),
  z: Math.round(game.player.z),
  traffic: game.vehicles.cars.length,
  police: game.vehicles.police.length,
  heli: !!game.vehicles.heli,
  peds: game.peds.peds.length,
  timeOfDay: game.city.timeOfDay,
});
