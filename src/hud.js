// HUD: cache DOM nodes, push state each frame.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

const els = {};
let overlayCtx = null;
let overlay = null;

export function initHud() {
  const ids = [
    'v-speed','v-alt','v-aoa','v-vsi','v-hdg','v-thr','v-g','v-pitch','v-roll',
    'v-status','cell-status','hud-qgc','v-mode','v-wp','cell-mode','cell-wp',
    'dmg-fus','dmg-lwg','dmg-rwg','dmg-tail','dmg-eng',
    'hud-rec','hud-replay','hud-hitl','hud-pad','hud-mute',
    'hud-scenario','sc-name','sc-obj','sc-score','hud-mp','mp-count',
  ];
  for (const id of ids) els[id] = document.getElementById(id);

  overlay = document.getElementById('hud-overlay');
  if (overlay) {
    overlayCtx = overlay.getContext('2d');
  }
}

function setDmgBar(el, hp) {
  if (!el) return;
  const pct = Math.max(0, Math.min(1, hp));
  el.style.width = (pct * 100).toFixed(0) + '%';
  el.classList.toggle('warn',   pct < 0.6 && pct >= 0.25);
  el.classList.toggle('danger', pct < 0.25);
}

const RAD2DEG = 180 / Math.PI;

/** state: { speed, altitude, aoa(rad), vsi, headingDeg, throttle01, gForce, pitchRad, rollRad, status } */
export function updateHud(state) {
  els['v-speed'].textContent  = Math.round(state.speed).toString();
  els['v-alt'].textContent    = Math.round(state.altitude).toString();
  els['v-aoa'].textContent    = (state.aoa * RAD2DEG).toFixed(1);
  els['v-vsi'].textContent    = state.vsi.toFixed(1);
  els['v-hdg'].textContent    = padHdg(state.headingDeg);
  els['v-thr'].textContent    = Math.round(state.throttle01 * 100) + '%';
  els['v-g'].textContent      = state.gForce.toFixed(2);
  els['v-pitch'].textContent  = Math.round(state.pitchRad * RAD2DEG).toString();
  els['v-roll'].textContent   = Math.round(state.rollRad * RAD2DEG).toString();
  els['v-status'].textContent = state.status;
  els['cell-status'].classList.toggle('warn', state.status !== 'OK');

  if (els['v-mode']) {
    const auto = state.mode === 'AUTO';
    els['v-mode'].textContent = state.mode || 'MANUAL';
    els['cell-mode'].classList.toggle('auto', auto);
  }
  if (els['v-wp']) {
    if (state.missionSeq != null && state.missionLen > 0) {
      els['v-wp'].textContent = `${state.missionSeq + 1}/${state.missionLen}`;
      els['cell-wp'].classList.toggle('auto', true);
    } else if (state.missionLen > 0) {
      els['v-wp'].textContent = `0/${state.missionLen}`;
      els['cell-wp'].classList.toggle('auto', false);
    } else {
      els['v-wp'].textContent = '—';
      els['cell-wp'].classList.toggle('auto', false);
    }
  }

  if (els['hud-qgc']) {
    const on = !!state.qgcOnline;
    els['hud-qgc'].textContent = on ? 'QGC LINK' : 'QGC OFFLINE';
    els['hud-qgc'].classList.toggle('online', on);
    els['hud-qgc'].classList.toggle('offline', !on);
  }

  if (state.damage) {
    setDmgBar(els['dmg-fus'],  state.damage.fuselage);
    setDmgBar(els['dmg-lwg'],  state.damage.leftWing);
    setDmgBar(els['dmg-rwg'],  state.damage.rightWing);
    setDmgBar(els['dmg-tail'], state.damage.tail);
    setDmgBar(els['dmg-eng'],  state.damage.engine);
  }

  if (els['hud-rec'])    els['hud-rec'].classList.toggle('hidden',    !state.recording);
  if (els['hud-replay']) els['hud-replay'].classList.toggle('hidden', !state.replaying);
  if (els['hud-hitl'])   els['hud-hitl'].classList.toggle('hidden',   !state.hitl);
  if (els['hud-pad'])    els['hud-pad'].classList.toggle('hidden',    !state.padConnected);
  if (els['hud-mute'])   els['hud-mute'].classList.toggle('hidden',   !state.audioMuted);

  if (state.scenario) {
    const s = state.scenario;
    if (els['hud-scenario']) els['hud-scenario'].classList.remove('hidden');
    if (els['sc-name'])  els['sc-name'].textContent  = s.title;
    if (els['sc-obj'])   els['sc-obj'].textContent   = s.objective;
    if (els['sc-score']) els['sc-score'].textContent = `SCORE ${s.score}`;
  } else if (els['hud-scenario']) {
    els['hud-scenario'].classList.add('hidden');
  }

  if (state.multiplayer) {
    if (els['hud-mp']) {
      els['hud-mp'].classList.remove('hidden');
      if (els['mp-count']) els['mp-count'].textContent = state.multiplayer.peers;
    }
  } else if (els['hud-mp']) {
    els['hud-mp'].classList.add('hidden');
  }

  drawPitchLadder(state.pitchRad, state.rollRad);
  drawHeadingRose(state.headingDeg);
  drawSpeedAltTicks(state);
}

function drawHeadingRose(headingDeg) {
  if (!overlayCtx) return;
  const w = overlay.width;
  const ctx = overlayCtx;
  const y = 18;

  ctx.save();
  ctx.strokeStyle = '#ffb000';
  ctx.fillStyle = '#ffb000';
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Visible arc: ±60° around current heading. 1° = 3px.
  const pxPerDeg = 3;
  const visible = 60;
  const cx = w / 2;
  for (let off = -visible; off <= visible; off += 5) {
    const tickHdg = ((Math.round(headingDeg) + off) + 360) % 360;
    const x = cx + off * pxPerDeg;
    const isMajor = tickHdg % 30 === 0;
    const isMinor = tickHdg % 10 === 0;
    if (!isMinor) continue;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (isMajor ? 9 : 5));
    ctx.stroke();
    if (isMajor) {
      const label =
        tickHdg === 0   ? 'N' :
        tickHdg === 90  ? 'E' :
        tickHdg === 180 ? 'S' :
        tickHdg === 270 ? 'W' :
        String(tickHdg / 10).padStart(2, '0');
      ctx.fillText(label, x, y + 18);
    }
  }
  // Center indicator (current heading).
  ctx.beginPath();
  ctx.moveTo(cx, y - 6);
  ctx.lineTo(cx - 5, y - 14);
  ctx.lineTo(cx + 5, y - 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpeedAltTicks(state) {
  if (!overlayCtx) return;
  const w = overlay.width, h = overlay.height;
  const ctx = overlayCtx;

  ctx.save();
  ctx.strokeStyle = '#ffb000';
  ctx.fillStyle = '#ffb000';
  ctx.lineWidth = 1;
  ctx.font = '9px ui-monospace, Menlo, monospace';

  // Speed tape (left center) — 5 m/s ticks, 1 m/s = 4 px.
  const pxPerUnit = 4;
  const cy = h / 2;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const tapeX = 24;
  for (let off = -40; off <= 40; off += 5) {
    const v = Math.round(state.speed) + off;
    if (v < 0) continue;
    const y = cy - off * pxPerUnit;
    if (y < 8 || y > h - 8) continue;
    const isMajor = v % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(tapeX, y);
    ctx.lineTo(tapeX + (isMajor ? 8 : 4), y);
    ctx.stroke();
    if (isMajor) ctx.fillText(String(v), tapeX - 2, y);
  }

  // Altitude tape (right center) — 25 m ticks, 1 m = 0.6 px.
  ctx.textAlign = 'left';
  const pxPerAlt = 0.6;
  const altTapeX = w - 24;
  const altCenter = Math.round(state.altitude);
  for (let off = -250; off <= 250; off += 25) {
    const v = altCenter + off;
    if (v < 0) continue;
    const y = cy - off * pxPerAlt;
    if (y < 8 || y > h - 8) continue;
    const isMajor = v % 100 === 0;
    ctx.beginPath();
    ctx.moveTo(altTapeX, y);
    ctx.lineTo(altTapeX - (isMajor ? 8 : 4), y);
    ctx.stroke();
    if (isMajor) ctx.fillText(String(v), altTapeX + 2, y);
  }
  ctx.restore();
}

function padHdg(deg) {
  let d = Math.round(((deg % 360) + 360) % 360);
  if (d === 360) d = 0;
  return d.toString().padStart(3, '0');
}

function drawPitchLadder(pitchRad, rollRad) {
  if (!overlayCtx) return;
  const w = overlay.width, h = overlay.height;
  const ctx = overlayCtx;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-rollRad); // roll the ladder opposite the aircraft

  // Pitch lines every 10°. 1° = ~5px.
  const pxPerDeg = 5;
  const pitchDeg = pitchRad * RAD2DEG;
  const yOffset = pitchDeg * pxPerDeg; // positive pitch => horizon below center

  ctx.strokeStyle = '#ffb000';
  ctx.fillStyle = '#ffb000';
  ctx.lineWidth = 1.5;
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let p = -60; p <= 60; p += 10) {
    const y = yOffset - p * pxPerDeg;
    if (y < -h / 2 - 20 || y > h / 2 + 20) continue;
    const len = p === 0 ? 200 : (p % 30 === 0 ? 110 : 70);

    ctx.beginPath();
    if (p === 0) {
      ctx.moveTo(-len / 2, y);
      ctx.lineTo(len / 2, y);
    } else if (p > 0) {
      ctx.moveTo(-len / 2, y);
      ctx.lineTo(len / 2, y);
    } else {
      // dashed for negative pitch
      ctx.setLineDash([6, 4]);
      ctx.moveTo(-len / 2, y);
      ctx.lineTo(len / 2, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (p !== 0) {
      ctx.fillText(p.toString(), -len / 2 - 4, y);
      ctx.textAlign = 'left';
      ctx.fillText(p.toString(), len / 2 + 4, y);
      ctx.textAlign = 'right';
    }
  }

  ctx.restore();

  // Fixed crosshair (boresight) — does NOT roll.
  ctx.strokeStyle = '#ffb000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 30, h / 2); ctx.lineTo(w / 2 - 8, h / 2);
  ctx.moveTo(w / 2 + 8, h / 2);  ctx.lineTo(w / 2 + 30, h / 2);
  ctx.moveTo(w / 2, h / 2 - 30); ctx.lineTo(w / 2, h / 2 - 8);
  ctx.moveTo(w / 2, h / 2 + 8);  ctx.lineTo(w / 2, h / 2 + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffb000';
  ctx.fill();
}
