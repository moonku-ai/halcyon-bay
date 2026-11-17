// Halcyon Bay — staged screenshots behind ?shot=title|drive|chase|mission.
// Each scene sets up the real game (same seed, same rules) and lets it run, so
// the frame is what a short session really looks like.
// Written from scratch for this entry.
import { SPOTS } from './city.js';

function putPlayerInCar(game, x, z, heading) {
  // Prefer a parked car so the shot starts from a standstill on a road.
  let car = game.vehicles.nearestCar(x, z, 1e9, ['parked']);
  if (!car) car = game.vehicles.nearestCar(x, z, 1e9, ['traffic', 'taxi']);
  if (!car) return null;
  // Sit in the right-hand lane, not on the centre line.
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  const rx = -fz, rz = fx;
  car.x = x + rx * 3; car.z = z + rz * 3; car.heading = heading;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = heading;
  car.speed = 0;
  game.player.x = car.x; game.player.z = car.z;
  game.player.enterCar(car);
  return car;
}

function holdDrive(game) {
  game.input.keys.add('KeyW');
  game.shotMode = true;
}

// Step the live simulation forward without rendering, so a staged scene is
// already in motion on the first frame (and stays deterministic at any fps).
function fastForward(game, seconds) {
  const step = 1 / 60;
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    game.elapsed += step;
    game.player.update(step);
    game.vehicles.update(step);
    game.peds.update(step);
    game.missions.update(step);
    game.fx.update(step);
  }
}

export function stageShot(name, game) {
  const player = game.player;
  game.shotMode = true;
  game.state = 'play';
  game.hud.hideScreens();
  if (name === 'drive') {
    game.setTimeOfDay(13);
    putPlayerInCar(game, -26, 110, 0);
    holdDrive(game);
    fastForward(game, 4);
  } else if (name === 'chase') {
    game.setTimeOfDay(22);
    putPlayerInCar(game, 26, 120, 0);
    game.setWanted(3);
    holdDrive(game);
    fastForward(game, 2.5);
    // Two cruisers ahead in the player's lane, light bars flashing, holding
    // their line so the frame shows the chase ahead of the player.
    const p = game.player;
    game.vehicles.police.forEach((car, i) => {
      if (i > 1) return;
      car.x = 29 - i * 5;
      car.z = p.z - 34 - i * 24;
      car.heading = 0;
      car.speed = 26;
      car.cruise = 26;
      car.scripted = true;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    });
    fastForward(game, 1.2);
  } else if (name === 'mission') {
    game.setTimeOfDay(17.75);
    game.missions.startMission(2); // The Meridian Job
    // Jump straight to the shootout step so the frame shows the gunfight.
    game.missions.stepIndex = 1;
    game.missions.setupStep();
    // Stand south of the bank, facing the guards, weapon live.
    player.reset(SPOTS.bank.x + 10, SPOTS.bank.z + 26, Math.atan2(-10, -26));
    player.camYaw = Math.atan2(10, 26);
    player.heading = Math.atan2(-10, -26);
    game.input.shootHeld = true;
    // The guards are already fighting; make sure the player can see them.
    game.camera.position.set(player.x + 4, 3.2, player.z + 8);
    fastForward(game, 1.5);
  } else {
    // Title: golden hour over Marina Plaza, camera drifting across the bay.
    game.setTimeOfDay(17.75);
    player.reset(SPOTS.marinaPlaza.x, SPOTS.marinaPlaza.z + 6, 0);
    player.camYaw = 0.4;
    game.state = 'title';
    game.hud.showScreen('title');
  }
}
