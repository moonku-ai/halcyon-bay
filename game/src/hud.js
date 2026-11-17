// Halcyon Bay — the whole HUD: wanted stars, health and cash, a live 2D
// minimap, mission objective, speed, crosshair, damage vignette, toasts, the
// mission briefing, and the title / pause / WASTED / BUSTED screens.
// Written from scratch for this entry.
import { el, fmtMoney, fmtDist, fmtTime } from './util.js';
import { ROADS, CITY_HALF } from './city.js';
import { MISSIONS } from './missions.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.mapT = 0;
    this.lastCash = -1;
    this.lastHealth = -1;
    this.lastStars = -1;
    this.buildChrome();
    this.buildScreens();
  }

  buildChrome() {
    const hud = this.root;
    const tl = el('div', 'hud-tl', hud);
    this.cashEl = el('div', 'cash', tl);
    this.cashEl.textContent = '$0';
    const hpWrap = el('div', 'hp-wrap', tl);
    el('span', 'hp-label', hpWrap).textContent = 'HEALTH';
    this.hpBar = el('div', 'hp-bar', hpWrap);
    this.hpFill = el('div', 'hp-fill', this.hpBar);
    this.carBar = el('div', 'hp-bar car-bar', hpWrap);
    this.carFill = el('div', 'hp-fill car-fill', this.carBar);
    this.wantedEl = el('div', 'wanted', hud);
    const obj = el('div', 'objective', hud);
    this.objTitle = el('div', 'obj-title', obj);
    this.objText = el('div', 'obj-text', obj);
    this.objDist = el('div', 'obj-dist', obj);
    this.speedEl = el('div', 'speed', hud);
    this.mapWrap = el('div', 'map-wrap', hud);
    this.map = document.createElement('canvas');
    this.map.width = 200; this.map.height = 200;
    this.mapCtx = this.map.getContext('2d', { desynchronized: true });
    this.mapWrap.appendChild(this.map);
    el('div', 'map-label', this.mapWrap).textContent = 'HALCYON BAY';
    this.cross = el('div', 'crosshair', hud);
    this.cross.innerHTML = '<span></span>';
    this.vignette = el('div', 'vignette', hud);
    this.hintEl = el('div', 'hint', hud);
    this.hintT = 0;
    this.toastWrap = el('div', 'toasts', hud);
    this.bannerEl = el('div', 'banner', hud);
    this.bannerTitle = el('div', 'banner-title', this.bannerEl);
    this.bannerSub = el('div', 'banner-sub', this.bannerEl);
    this.bannerEl.style.display = 'none';
    const brief = el('div', 'briefing', hud);
    brief.style.display = 'none';
    this.briefEl = brief;
    el('div', 'brief-tag', brief).textContent = 'NEW MISSION';
    this.briefTitle = el('div', 'brief-title', brief);
    this.briefGiver = el('div', 'brief-giver', brief);
    this.briefText = el('div', 'brief-text', brief);
    this.briefReward = el('div', 'brief-reward', brief);
    el('div', 'brief-keys', brief).textContent = 'ENTER — accept mission      ESC — later';
  }

  buildScreens() {
    // Title screen.
    const title = el('div', 'screen title-screen', this.root);
    title.id = 'title-screen';
    el('div', 'game-logo', title).textContent = 'HALCYON BAY';
    el('div', 'game-tag', title).textContent = 'An open-world crime story — drive it, steal it, survive it.';
    el('div', 'game-story', title).textContent =
      'Mara Voss is back in Halcyon Bay. Five jobs stand between her and a clean slate — ' +
      'and the whole HBPD stands between her and the money.';
    const btns = el('div', 'btn-col', title);
    this.newBtn = el('button', 'btn primary', btns);
    this.newBtn.textContent = '▶  NEW GAME';
    this.continueBtn = el('button', 'btn', btns);
    this.continueBtn.textContent = '↻  CONTINUE';
    this.howBtn = el('button', 'btn', btns);
    this.howBtn.textContent = '?  HOW TO PLAY';
    const controls = el('div', 'controls-grid', title);
    controls.innerHTML =
      '<div><b>W A S D</b> — move / drive</div><div><b>Mouse</b> — look &amp; aim (click to shoot)</div>' +
      '<div><b>E</b> — enter / steal car</div><div><b>Shift</b> — sprint &nbsp; <b>Space</b> — handbrake</div>' +
      '<div><b>Esc / P</b> — pause</div><div><b>M</b> — mute &nbsp; <b>H</b> — help</div>';
    el('div', 'disclaimer', title).textContent =
      'A fan-made original game. Not affiliated with Rockstar Games or Grand Theft Auto.';
    // Pause screen.
    const pause = el('div', 'screen pause-screen', this.root);
    pause.id = 'pause-screen';
    pause.style.display = 'none';
    el('div', 'screen-title', pause).textContent = 'PAUSED';
    const pBtns = el('div', 'btn-col', pause);
    this.resumeBtn = el('button', 'btn primary', pBtns);
    this.resumeBtn.textContent = '▶  RESUME';
    this.pauseHowBtn = el('button', 'btn', pBtns);
    this.pauseHowBtn.textContent = '?  HOW TO PLAY';
    this.quitBtn = el('button', 'btn', pBtns);
    this.quitBtn.textContent = '■  SAVE & QUIT TO TITLE';
    const mTitle = el('div', 'mission-list-title', pause);
    mTitle.textContent = 'MISSIONS — click to replay a finished job';
    this.missionList = el('div', 'mission-list', pause);
    // Wasted / busted.
    const wasted = el('div', 'screen wasted-screen', this.root);
    wasted.id = 'wasted-screen';
    wasted.style.display = 'none';
    el('div', 'screen-title big-red', wasted).textContent = 'WASTED';
    el('div', 'screen-sub', wasted).textContent = 'Mara is down. The hospital bill stings.';
    this.wastedBtn = el('button', 'btn primary', wasted);
    this.wastedBtn.textContent = '↻  RESPAWN AT HOSPITAL  ($150)';
    const busted = el('div', 'screen busted-screen', this.root);
    busted.id = 'busted-screen';
    busted.style.display = 'none';
    el('div', 'screen-title big-blue', busted).textContent = 'BUSTED';
    el('div', 'screen-sub', busted).textContent = 'The HBPD has you. Bail is not cheap.';
    this.bustedBtn = el('button', 'btn primary', busted);
    this.bustedBtn.textContent = '↻  RELEASED — PAY $200';
    // How to play.
    const how = el('div', 'screen howto-screen', this.root);
    how.id = 'howto-screen';
    how.style.display = 'none';
    el('div', 'screen-title', how).textContent = 'HOW TO PLAY';
    const body = el('div', 'howto-body', how);
    body.innerHTML =
      '<p><b>On foot:</b> WASD to move, Shift to sprint, mouse to look, click (or F) to shoot. ' +
      'Walk up to any car and press <b>E</b> to drive it — parked cars are free, traffic cars and ' +
      'police cruisers are not.</p>' +
      '<p><b>Driving:</b> W accelerates, S brakes and reverses, A/D steer, Space is the handbrake. ' +
      'Mind the pedestrians: the HBPD notices.</p>' +
      '<p><b>Wanted:</b> stars rise when you break the law. Police cruisers chase you; at five stars ' +
      'the helicopter joins. Lose the heat by laying low — or finish the job and let the dust settle.</p>' +
      '<p><b>Missions:</b> follow the yellow beacon and the minimap marker. Five jobs, one story. ' +
      'Green briefcases hidden around the city pay $250 each.</p>' +
      '<p><b>Save:</b> progress saves automatically. Continue from the title screen.</p>';
    this.howCloseBtn = el('button', 'btn primary', how);
    this.howCloseBtn.textContent = 'GOT IT';
    this.screens = { title, pause, wasted, busted, how };
  }

  showScreen(name) {
    for (const [k, s] of Object.entries(this.screens)) s.style.display = k === name ? 'flex' : 'none';
    this.root.classList.toggle('in-menu', name !== null);
  }

  hideScreens() { this.showScreen(null); }

  showBriefing(m) {
    this.briefTitle.textContent = m.title;
    this.briefGiver.textContent = 'From ' + m.giver;
    this.briefText.textContent = m.brief;
    this.briefReward.textContent = 'REWARD  ' + fmtMoney(m.reward);
    this.briefEl.style.display = 'block';
  }

  hideBriefing() { this.briefEl.style.display = 'none'; }

  showObjective(title, text) {
    this.objTitle.textContent = title || '';
    this.objText.textContent = text || '';
    this.objDist.textContent = '';
  }

  showBanner(title, sub) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.style.display = 'block';
    this.bannerT = 4;
  }

  hideBanner() { this.bannerEl.style.display = 'none'; this.bannerT = 0; }

  toast(msg) {
    const t = el('div', 'toast', this.toastWrap);
    t.textContent = msg;
    setTimeout(() => { t.classList.add('fade'); setTimeout(() => t.remove(), 600); }, 3400);
    while (this.toastWrap.children.length > 3) this.toastWrap.firstChild.remove();
  }

  showHint(msg, seconds) {
    this.hintEl.textContent = msg;
    this.hintEl.style.opacity = '1';
    this.hintT = seconds || 2.5;
  }

  flashDamage() {
    this.vignette.style.opacity = '0.85';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 120);
  }

  flashCash() {
    this.cashEl.classList.add('flash');
    setTimeout(() => this.cashEl.classList.remove('flash'), 500);
  }

  refreshMissionList(completed, startFn) {
    this.missionList.innerHTML = '';
    for (const m of MISSIONS) {
      const done = completed.has(m.id);
      const row = el('div', 'mission-row' + (done ? ' done' : ''), this.missionList);
      row.innerHTML = `<b>${m.id}. ${m.title}</b><span>${done ? '✓ DONE' : fmtMoney(m.reward)}</span>`;
      if (done) row.addEventListener('click', () => startFn(MISSIONS.indexOf(m)));
    }
  }

  update(dt, game) {
    const p = game.player;
    // Cash / health / stars, only touch the DOM when they change.
    if (game.cash !== this.lastCash) {
      this.cashEl.textContent = fmtMoney(game.cash);
      this.lastCash = game.cash;
    }
    const hp = Math.round(p.health);
    if (hp !== this.lastHealth) {
      this.hpFill.style.width = hp + '%';
      this.hpFill.style.background = hp > 50 ? '#3ec24a' : hp > 25 ? '#e0a83b' : '#d83b3b';
      this.lastHealth = hp;
    }
    if (game.wanted !== this.lastStars) {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < game.wanted ? '★' : '☆';
      this.wantedEl.textContent = stars;
      this.wantedEl.classList.toggle('hot', game.wanted >= 3);
      this.lastStars = game.wanted;
    }
    // Car health bar while driving.
    if (p.inCar && p.car) {
      this.carBar.style.display = 'block';
      this.carFill.style.width = Math.max(0, p.car.health) + '%';
    } else this.carBar.style.display = 'none';
    // Speed.
    if (p.inCar) {
      this.speedEl.textContent = Math.round(Math.abs(p.carSpeed) * 3.6) + ' km/h';
      this.speedEl.style.display = 'block';
    } else this.speedEl.style.display = 'none';
    // Crosshair on foot only.
    this.cross.style.display = (!p.inCar && game.state === 'play') ? 'block' : 'none';
    // Objective distance + timer.
    const s = game.missions.currentStep();
    if (s && game.missions.active) {
      const d = game.missions.objectiveDistance();
      let extra = fmtDist(d);
      if (s.time) extra += '   ⏱ ' + fmtTime(Math.max(0, game.missions.stepTimer));
      if (game.missions.holdT > 0 && s.type === 'hold') extra += '   HOLDING…';
      this.objDist.textContent = extra;
    } else if (game.missions.active) this.objDist.textContent = '';
    // Banner auto-hide.
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.hideBanner();
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.style.opacity = '0';
    }
    // Minimap at ~12 fps.
    this.mapT += dt;
    if (this.mapT > 0.08) { this.mapT = 0; this.drawMinimap(game); }
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 200;
    const view = 260; // world units across the map
    const scale = S / view;
    const p = game.player;
    const toX = (x) => S / 2 + (x - p.x) * scale;
    const toZ = (z) => S / 2 + (z - p.z) * scale;
    ctx.fillStyle = '#1b222c';
    ctx.fillRect(0, 0, S, S);
    // Water at the south.
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(0, toZ(196), S, S - toZ(196));
    // Blocks.
    ctx.fillStyle = '#313945';
    for (let bx = 0; bx < 7; bx++) {
      for (let bz = 0; bz < 7; bz++) {
        ctx.fillRect(toX(ROADS[bx] + 6), toZ(ROADS[bz] + 6),
          (ROADS[bx + 1] - ROADS[bx] - 12) * scale, (ROADS[bz + 1] - ROADS[bz] - 12) * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#8b939f';
    ctx.lineWidth = 12 * scale;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(toX(-CITY_HALF), toZ(r)); ctx.lineTo(toX(CITY_HALF), toZ(r)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(r), toZ(-CITY_HALF)); ctx.lineTo(toX(r), toZ(CITY_HALF)); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toX(x), toZ(z), r, 0, Math.PI * 2); ctx.fill();
    };
    // Stashes.
    for (const s of p.stashes) if (!s.taken) dot(s.x, s.z, '#35c24a', 2.5);
    // Traffic.
    for (const c of game.vehicles.cars) {
      if (c.exploded || c.isPlayerCar) continue;
      dot(c.x, c.z, c.kind === 'police' ? '#ff4040' : '#9aa2ad', c.kind === 'police' ? 3.5 : 2);
    }
    // Mission marker (pulsing).
    const mk = game.missions.markerForMinimap();
    if (mk) {
      const r = 4 + Math.sin(game.elapsed * 4) * 1.5;
      ctx.strokeStyle = '#ffd21f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(toX(mk.x), toZ(mk.z), r + 2, 0, Math.PI * 2); ctx.stroke();
      dot(mk.x, mk.z, '#ffd21f', 3.5);
    }
    // Player arrow (centre, pointing up = facing).
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 6, 14);
  }
}
