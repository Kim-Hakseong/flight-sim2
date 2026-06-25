// HUD: cache DOM nodes, push state each frame.
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.

const els = {};
let overlayCtx = null;
let overlay = null;

export function initHud() {
  const ids = [
    'v-speed','v-alt','v-aoa','v-vsi','v-hdg','v-thr','v-g','v-pitch','v-roll',
    'v-status','cell-status','hud-qgc','hud-nav','v-mode','v-wp','cell-mode','cell-wp',
    'dmg-fus','dmg-lwg','dmg-rwg','dmg-tail','dmg-eng',
    'hud-rec','hud-replay','hud-hitl','hud-pad','hud-mute',
  ];
  for (const id of ids) els[id] = document.getElementById(id);

  overlay = document.getElementById('hud-overlay');
  if (overlay) {
    overlayCtx = overlay.getContext('2d');
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
  }
}

// HUD geometry (CSS px). Backing store is scaled by DPR for crisp lines.
let HUD_W = 0, HUD_H = 0, DPR = 1;
function resizeOverlay() {
  if (!overlay) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  HUD_W = window.innerWidth;
  HUD_H = window.innerHeight;
  overlay.width = Math.round(HUD_W * DPR);
  overlay.height = Math.round(HUD_H * DPR);
  overlay.style.width = HUD_W + 'px';
  overlay.style.height = HUD_H + 'px';
}

// HUD colour (F-16 green). One place to retint the whole symbology.
const HUD_GREEN = '#3dff9a';
const HUD_DIM = 'rgba(61,255,154,0.5)';

// Engineering view (M45): kills the neon glow so the HUD reads as flat flight-test
// symbology instead of a game overlay. Toggled from main.js.
let engMode = false;
export function setHudEngMode(v) { engMode = !!v; }

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

  if (els['hud-nav']) els['hud-nav'].classList.toggle('show', !!state.navDegraded);

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

  drawHUD(state);
}

// ===========================================================================
// F-16-style HUD (M26): full-screen green symbology — boresight, flight-path
// marker, roll-rotated pitch ladder, bank scale, heading tape, airspeed &
// altitude boxes. Drawn in CSS px (ctx pre-scaled by DPR).
// ===========================================================================
function drawHUD(state) {
  if (!overlayCtx) return;
  const ctx = overlayCtx;
  const W = HUD_W, H = HUD_H;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Scale symbology with the smaller screen dimension (mobile friendly).
  const S = Math.max(0.62, Math.min(1.15, Math.min(W, H) / 720));
  const cx = W / 2, cy = H / 2;
  const pxPerDeg = 7 * S;           // pitch-ladder scale
  const pitchDeg = state.pitchRad * RAD2DEG;
  const roll = state.rollRad;
  const aoaDeg = (state.aoa || 0) * RAD2DEG;
  const betaDeg = (state.sideslip || 0) * RAD2DEG;

  ctx.lineWidth = 1.4 * S;
  ctx.strokeStyle = HUD_GREEN;
  ctx.fillStyle = HUD_GREEN;
  ctx.font = `${Math.round(13 * S)}px ui-monospace, Menlo, monospace`;
  ctx.shadowColor = engMode ? 'transparent' : 'rgba(61,255,154,0.5)';
  ctx.shadowBlur = engMode ? 0 : 4 * S;

  // ---- Pitch ladder (clipped to a central band, rolls with the aircraft) ----
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 240 * S, cy - 200 * S, 480 * S, 400 * S);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const yOff = pitchDeg * pxPerDeg;
  ctx.textBaseline = 'middle';
  for (let p = -90; p <= 90; p += 5) {
    const y = yOff - p * pxPerDeg;
    if (y < -210 * S || y > 210 * S) continue;
    if (p === 0) {
      // horizon line with a center gap
      ctx.beginPath();
      ctx.moveTo(-220 * S, y); ctx.lineTo(-26 * S, y);
      ctx.moveTo(26 * S, y); ctx.lineTo(220 * S, y);
      ctx.stroke();
      continue;
    }
    const major = p % 10 === 0;
    if (!major && Math.abs(p) > 30) continue;
    const half = (major ? 64 : 34) * S;
    const tick = (p > 0 ? 1 : -1) * 7 * S; // ticks point toward the horizon
    ctx.setLineDash(p < 0 ? [7 * S, 5 * S] : []);
    ctx.beginPath();
    ctx.moveTo(-half, y); ctx.lineTo(-26 * S, y);
    ctx.moveTo(26 * S, y); ctx.lineTo(half, y);
    ctx.stroke();
    // end caps
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-half, y); ctx.lineTo(-half, y + tick);
    ctx.moveTo(half, y); ctx.lineTo(half, y + tick);
    ctx.stroke();
    if (major) {
      ctx.textAlign = 'right';
      ctx.fillText(String(p), -half - 5 * S, y);
      ctx.textAlign = 'left';
      ctx.fillText(String(p), half + 5 * S, y);
    }
  }
  ctx.setLineDash([]);
  ctx.restore();

  // ---- Boresight (fixed gun cross / waterline) ----
  ctx.shadowBlur = engMode ? 0 : 5 * S;
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(cx - 34 * S, cy); ctx.lineTo(cx - 12 * S, cy);
  ctx.moveTo(cx + 12 * S, cy); ctx.lineTo(cx + 34 * S, cy);
  ctx.moveTo(cx - 12 * S, cy); ctx.lineTo(cx - 12 * S, cy + 7 * S);
  ctx.moveTo(cx + 12 * S, cy); ctx.lineTo(cx + 12 * S, cy + 7 * S);
  ctx.stroke();

  // ---- Flight-path marker (velocity vector): below boresight by AoA, offset by
  // sideslip. Rotated into the rolled frame so it sits on the velocity vector. ----
  const fpmF = roll;
  const fx = cx + (betaDeg * Math.cos(fpmF) - aoaDeg * Math.sin(fpmF)) * pxPerDeg;
  const fy = cy + (aoaDeg * Math.cos(fpmF) + betaDeg * Math.sin(fpmF)) * pxPerDeg;
  ctx.lineWidth = 1.6 * S;
  const r = 7 * S;
  ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fx - r, fy); ctx.lineTo(fx - r - 9 * S, fy);
  ctx.moveTo(fx + r, fy); ctx.lineTo(fx + r + 9 * S, fy);
  ctx.moveTo(fx, fy - r); ctx.lineTo(fx, fy - r - 7 * S);
  ctx.stroke();

  // ---- Bank scale (arc above center, fixed; pointer rolls) ----
  drawBankScale(ctx, cx, cy, S, roll);
  // ---- Heading tape (top) ----
  drawHeadingTape(ctx, cx, S, state.headingDeg, W);
  // ---- Airspeed (left) & Altitude (right) boxes with moving tapes ----
  drawVTape(ctx, cx - 250 * S, cy, S, state.speed, 'left', 5, 6 * S, 'IAS', state.aoa * RAD2DEG, 'AOA');
  drawVTape(ctx, cx + 250 * S, cy, S, state.altitude, 'right', 50, 0.7 * S, 'ALT', state.vsi, 'VS');

  ctx.shadowBlur = 0;
}

function drawBankScale(ctx, cx, cy, S, roll) {
  const R = 190 * S;
  ctx.save();
  ctx.strokeStyle = HUD_GREEN; ctx.fillStyle = HUD_GREEN; ctx.lineWidth = 1.4 * S;
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = -Math.PI / 2 + a * Math.PI / 180;
    const x1 = cx + Math.cos(ang) * R, y1 = cy + Math.sin(ang) * R;
    const len = (a % 30 === 0 ? 12 : 7) * S;
    const x2 = cx + Math.cos(ang) * (R - len), y2 = cy + Math.sin(ang) * (R - len);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // rolling pointer (triangle) at the top, rotates with bank
  const pa = -Math.PI / 2 - roll;
  const px = cx + Math.cos(pa) * (R - 14 * S), py = cy + Math.sin(pa) * (R - 14 * S);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - 6 * S * Math.cos(pa - 0.5), py - 6 * S * Math.sin(pa - 0.5));
  ctx.lineTo(px - 6 * S * Math.cos(pa + 0.5), py - 6 * S * Math.sin(pa + 0.5));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawHeadingTape(ctx, cx, S, headingDeg, W) {
  const y = 16 * S;
  const pxPerDeg = 4 * S, visible = 50;
  ctx.save();
  ctx.strokeStyle = HUD_GREEN; ctx.fillStyle = HUD_GREEN; ctx.lineWidth = 1.3 * S;
  ctx.font = `${Math.round(11 * S)}px ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let off = -visible; off <= visible; off += 5) {
    const hd = ((Math.round(headingDeg) + off) % 360 + 360) % 360;
    if (hd % 5 !== 0) continue;
    const x = cx + off * pxPerDeg;
    const major = hd % 30 === 0;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (major ? 11 : 6) * S); ctx.stroke();
    if (major) {
      const lbl = hd === 0 ? 'N' : hd === 90 ? 'E' : hd === 180 ? 'S' : hd === 270 ? 'W' : String(hd / 10).padStart(2, '0');
      ctx.fillText(lbl, x, y + 14 * S);
    }
  }
  // caret + boxed heading
  ctx.beginPath();
  ctx.moveTo(cx, y - 3 * S); ctx.lineTo(cx - 6 * S, y - 11 * S); ctx.lineTo(cx + 6 * S, y - 11 * S);
  ctx.closePath(); ctx.fill();
  const hd = padHdg(headingDeg);
  ctx.font = `bold ${Math.round(14 * S)}px ui-monospace, monospace`;
  const tw = 40 * S;
  ctx.strokeRect(cx - tw / 2, y - 30 * S, tw, 16 * S);
  ctx.fillText(hd, cx, y - 28 * S);
  ctx.restore();
}

function drawVTape(ctx, x, cy, S, value, side, step, pxPerUnit, label, sub, subLabel) {
  ctx.save();
  ctx.strokeStyle = HUD_GREEN; ctx.fillStyle = HUD_GREEN; ctx.lineWidth = 1.3 * S;
  ctx.font = `${Math.round(11 * S)}px ui-monospace, monospace`;
  const dir = side === 'left' ? -1 : 1;
  const tickX = x;
  const half = 130 * S;
  ctx.textBaseline = 'middle';
  ctx.textAlign = side === 'left' ? 'right' : 'left';
  const v0 = Math.round(value);
  for (let off = -Math.ceil(half / pxPerUnit); off <= Math.ceil(half / pxPerUnit); off++) {
    const v = v0 + off;
    if (v < 0 || v % step !== 0) continue;
    const y = cy - (v - value) * pxPerUnit;
    if (y < cy - half || y > cy + half) continue;
    const major = v % (step * 2) === 0;
    ctx.beginPath(); ctx.moveTo(tickX, y); ctx.lineTo(tickX + dir * (major ? 9 : 5) * S, y); ctx.stroke();
    if (major) ctx.fillText(String(v), tickX - dir * 4 * S, y);
  }
  // current-value box (boxed readout at center)
  const bw = 56 * S, bh = 20 * S;
  const bx = side === 'left' ? x - bw - 4 * S : x + 4 * S;
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.rect(bx, cy - bh / 2, bw, bh);
  // pointer notch toward the tape
  const nx = side === 'left' ? bx + bw : bx;
  ctx.moveTo(nx, cy - 5 * S); ctx.lineTo(nx + dir * 6 * S, cy); ctx.lineTo(nx, cy + 5 * S);
  ctx.stroke();
  ctx.font = `bold ${Math.round(15 * S)}px ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(value)), bx + bw / 2, cy);
  // label above, sub value below
  ctx.font = `${Math.round(10 * S)}px ui-monospace, monospace`;
  ctx.fillStyle = HUD_DIM;
  ctx.fillText(label, bx + bw / 2, cy - bh / 2 - 8 * S);
  ctx.fillStyle = HUD_GREEN;
  ctx.fillText(`${subLabel} ${sub.toFixed(1)}`, bx + bw / 2, cy + bh / 2 + 9 * S);
  ctx.restore();
}
function padHdg(deg) {
  let d = Math.round(((deg % 360) + 360) % 360);
  if (d === 360) d = 0;
  return d.toString().padStart(3, '0');
}

