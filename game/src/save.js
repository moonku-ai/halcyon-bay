// Halcyon Bay — save / load through localStorage. One slot, automatic saves
// after missions and every twenty seconds of play.
// Written from scratch for this entry.
const KEY = 'halcyon-bay-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function saveGame(game) {
  try {
    const data = {
      v: 1,
      cash: game.cash,
      health: game.player.health,
      completed: [...game.missions.completed],
      player: { x: game.player.x, z: game.player.z, heading: game.player.heading },
      timeOfDay: game.city.timeOfDay,
      weapon: game.player.weapon,
      stashes: game.player.stashes.map((s, i) => (s.taken ? i : -1)).filter((i) => i >= 0),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame(game) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return false;
    game.cash = d.cash || 0;
    game.player.health = d.health || 100;
    game.missions.completed = new Set(d.completed || []);
    if (d.player) game.player.reset(d.player.x, d.player.z, d.player.heading);
    if (d.timeOfDay != null) game.setTimeOfDay(d.timeOfDay);
    if (d.weapon) game.player.weapon = d.weapon;
    for (const i of d.stashes || []) {
      const s = game.player.stashes[i];
      if (s) { s.taken = true; game.scene.remove(s.mesh); }
    }
    return true;
  } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}
