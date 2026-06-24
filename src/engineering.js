// Engineering / HILS flight-test bench console (M45).
//
// Why: the sim had drifted toward a "game" look (neon HUD, cinematic bloom,
// score/health bars). This module adds the other half — a data-dense, flat,
// oscilloscope-grade instrumentation panel like a real HILS ground station /
// flight-test bench: 6-DOF state vector, control-surface positions, nav/estimator
// status, fault injection, and rolling strip charts. Display-only; reads telemetry
// each frame and writes DOM + canvas. No glow, sharp 1px borders, monospace.
//
// COORDINATE: Three.js right-handed, +Y up, -Z forward.

const NS = 'eng';

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .${NS}-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 288px; z-index: 28;
    box-sizing: border-box; padding: 8px 10px 14px; overflow-y: auto;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px; line-height: 1.35; color: #aeb9c2;
    background: rgba(9,13,17,0.93); border-left: 1px solid #243039;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4); pointer-events: auto;
  }
  .${NS}-panel.${NS}-hidden { display: none; }
  .${NS}-hd { display: flex; justify-content: space-between; align-items: baseline;
    color: #6fb3d8; letter-spacing: 1px; font-size: 11px; font-weight: 700;
    border-bottom: 1px solid #243039; padding-bottom: 5px; margin-bottom: 6px; }
  .${NS}-hd .${NS}-clk { color: #7c8a94; font-weight: 400; font-size: 10px; }
  .${NS}-sec { color: #5d86a0; font-size: 9px; letter-spacing: 1.5px; margin: 11px 0 4px;
    border-bottom: 1px dotted #243039; padding-bottom: 2px; }
  .${NS}-grid { display: grid; grid-template-columns: 22px 1fr 22px 1fr; gap: 1px 6px; }
  .${NS}-grid .${NS}-k { color: #6c7882; }
  .${NS}-grid .${NS}-v { color: #d6e0e7; text-align: right; }
  .${NS}-grid .${NS}-v.warn { color: #e6a93c; }
  .${NS}-grid .${NS}-v.bad  { color: #e05a5a; }
  .${NS}-bar { display: grid; grid-template-columns: 30px 1fr 44px; gap: 6px; align-items: center; margin: 2px 0; }
  .${NS}-bar .${NS}-k { color: #6c7882; }
  .${NS}-bar .${NS}-track { position: relative; height: 9px; background: #11181e; border: 1px solid #243039; }
  .${NS}-bar .${NS}-mid { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #2f3d47; }
  .${NS}-bar .${NS}-fill { position: absolute; top: 0; bottom: 0; background: #4f93b8; }
  .${NS}-bar .${NS}-num { color: #d6e0e7; text-align: right; }
  .${NS}-row { display: flex; justify-content: space-between; }
  .${NS}-row .${NS}-v { color: #d6e0e7; }
  .${NS}-pill { display: inline-block; padding: 0 5px; border: 1px solid #2f3d47; font-size: 10px; }
  .${NS}-pill.ok   { color: #5fc08a; border-color: #2c4a3a; }
  .${NS}-pill.warn { color: #e6a93c; border-color: #4a3e22; }
  .${NS}-pill.bad  { color: #e05a5a; border-color: #4a2626; }
  .${NS}-faults { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px; }
  .${NS}-fbtn { cursor: pointer; text-align: center; padding: 4px 2px; font-size: 9px; letter-spacing: 0.5px;
    color: #c2ccd3; background: #141b21; border: 1px solid #2a3a44; }
  .${NS}-fbtn:hover { background: #1c2a33; border-color: #3c5566; color: #eaf2f7; }
  .${NS}-fbtn.${NS}-clr { grid-column: 1 / -1; color: #e6a93c; border-color: #4a3e22; }
  .${NS}-active { margin-top: 5px; font-size: 9px; color: #e6a93c; min-height: 12px; }
  .${NS}-chart { width: 100%; display: block; margin-top: 3px; background: #0b1116; border: 1px solid #243039; }
  .${NS}-ct { font-size: 9px; color: #5d86a0; margin-top: 8px; letter-spacing: 1px; }
  @media (max-width: 940px) {
    .${NS}-panel { width: 168px; font-size: 9px; padding: 5px 6px; }
    .${NS}-grid { grid-template-columns: 18px 1fr; }
    .${NS}-grid .${NS}-k:nth-child(4n+3), .${NS}-grid .${NS}-v:nth-child(4n) { display: none; }
  }
  `;
  document.head.appendChild(el('style', null, css));
}

// ---- rolling strip chart ----------------------------------------------------
class Strip {
  constructor(title, traces, yMin, yMax, n = 360) {
    this.title = title; this.traces = traces; this.yMin = yMin; this.yMax = yMax;
    this.n = n; this.buf = traces.map(() => new Float32Array(n)); this.head = 0; this.count = 0;
  }
  push(vals) {
    for (let i = 0; i < this.traces.length; i++) this.buf[i][this.head] = vals[i];
    this.head = (this.head + 1) % this.n;
    if (this.count < this.n) this.count++;
  }
  draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    // zero / mid gridlines
    ctx.strokeStyle = '#1b262d'; ctx.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75]) {
      const y = Math.round(h * f) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    const span = this.yMax - this.yMin || 1;
    const toY = (v) => h - ((Math.max(this.yMin, Math.min(this.yMax, v)) - this.yMin) / span) * h;
    for (let t = 0; t < this.traces.length; t++) {
      ctx.strokeStyle = this.traces[t].color; ctx.lineWidth = 1; ctx.beginPath();
      const buf = this.buf[t];
      for (let i = 0; i < this.count; i++) {
        const idx = (this.head - this.count + i + this.n * 2) % this.n;
        const x = (i / (this.n - 1)) * w;
        const y = toY(buf[idx]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

/**
 * Build the engineering console. Hooks:
 *   injectFault(target, spec) · clearFaults() · getFaults() -> object
 * Returns { update(d), setVisible(v), isVisible() }.
 */
export function initEngineering(hooks = {}) {
  injectStyles();
  const panel = el('div', `${NS}-panel`);

  const head = el('div', `${NS}-hd`);
  head.appendChild(el('span', null, 'HILS · FLIGHT-TEST BENCH'));
  const clk = el('span', `${NS}-clk`, 't 0.0s'); head.appendChild(clk);
  panel.appendChild(head);

  const cells = {};
  const addGrid = (rows) => {
    const g = el('div', `${NS}-grid`);
    for (const [k1, id1, k2, id2] of rows) {
      g.appendChild(el('span', `${NS}-k`, k1));
      const v1 = el('span', `${NS}-v`, '—'); v1.id = `${NS}-${id1}`; cells[id1] = v1; g.appendChild(v1);
      g.appendChild(el('span', `${NS}-k`, k2 || ''));
      const v2 = el('span', `${NS}-v`, k2 ? '—' : ''); if (id2) { v2.id = `${NS}-${id2}`; cells[id2] = v2; } g.appendChild(v2);
    }
    panel.appendChild(g);
  };

  panel.appendChild(el('div', `${NS}-sec`, 'STATE · POSITION [m] / VELOCITY [m/s]'));
  addGrid([
    ['x', 'px', 'u', 'vu'], ['y', 'py', 'v', 'vv'], ['z', 'pz', 'w', 'vw'],
    ['alt', 'alt', '|V|', 'spd'],
  ]);

  panel.appendChild(el('div', `${NS}-sec`, 'ATTITUDE [deg] / BODY RATES [deg/s]'));
  addGrid([
    ['φ', 'roll', 'p', 'p'], ['θ', 'pitch', 'q', 'q'], ['ψ', 'yaw', 'r', 'r'],
    ['α', 'aoa', 'β', 'beta'],
  ]);

  panel.appendChild(el('div', `${NS}-sec`, 'AERO / LOADS'));
  addGrid([
    ['q̄', 'qbar', 'n', 'gforce'], ['VS', 'vsi', 'M', 'mach'],
  ]);

  // control-surface bars
  panel.appendChild(el('div', `${NS}-sec`, 'CONTROL SURFACES [norm]'));
  const bars = {};
  const addBar = (key, label) => {
    const row = el('div', `${NS}-bar`);
    row.appendChild(el('span', `${NS}-k`, label));
    const track = el('div', `${NS}-track`);
    track.appendChild(el('div', `${NS}-mid`));
    const fill = el('div', `${NS}-fill`); track.appendChild(fill);
    row.appendChild(track);
    const num = el('span', `${NS}-num`, '0.00'); row.appendChild(num);
    panel.appendChild(row);
    bars[key] = { fill, num };
  };
  addBar('elevator', 'ELE'); addBar('aileron', 'AIL'); addBar('rudder', 'RUD');
  addBar('throttle', 'THR'); addBar('flaps', 'FLP');

  panel.appendChild(el('div', `${NS}-sec`, 'NAV / ESTIMATOR'));
  const navRow = el('div', `${NS}-row`);
  navRow.appendChild(el('span', `${NS}-k`, 'SOURCE'));
  const navSrc = el('span', `${NS}-v`, '—'); cells.navSrc = navSrc; navRow.appendChild(navSrc);
  panel.appendChild(navRow);
  addGrid([['NIS', 'nis', 'GPS·e', 'gpserr']]);
  const navStat = el('div', null); navStat.style.marginTop = '3px';
  const navPill = el('span', `${NS}-pill ok`, 'NAV OK'); navStat.appendChild(navPill); panel.appendChild(navStat);

  panel.appendChild(el('div', `${NS}-sec`, 'HILS · FAULT INJECTION'));
  const fwrap = el('div', `${NS}-faults`);
  const FAULTS = [
    ['ELE STUCK', () => hooks.injectFault && hooks.injectFault('elevator', { type: 'stuck' })],
    ['AIL OFFSET', () => hooks.injectFault && hooks.injectFault('aileron', { type: 'offset', value: 0.3 })],
    ['RUD FLOAT', () => hooks.injectFault && hooks.injectFault('rudder', { type: 'float' })],
    ['ELE SLOW', () => hooks.injectFault && hooks.injectFault('elevator', { type: 'slow', factor: 0.2 })],
    ['GPS BIAS', () => hooks.injectFault && hooks.injectFault('gpsX', { type: 'bias', value: 60 })],
    ['GPS FRZ', () => hooks.injectFault && hooks.injectFault('gpsX', { type: 'frozen' })],
    ['ASI DROP', () => hooks.injectFault && hooks.injectFault('airspeed', { type: 'dropout' })],
    ['PITCH FRZ', () => hooks.injectFault && hooks.injectFault('pitch', { type: 'frozen' })],
  ];
  for (const [label, fn] of FAULTS) {
    const b = el('div', `${NS}-fbtn`, label); b.addEventListener('click', fn); fwrap.appendChild(b);
  }
  const clr = el('div', `${NS}-fbtn ${NS}-clr`, 'CLEAR ALL FAULTS');
  clr.addEventListener('click', () => hooks.clearFaults && hooks.clearFaults());
  fwrap.appendChild(clr);
  panel.appendChild(fwrap);
  const active = el('div', `${NS}-active`, ''); panel.appendChild(active);

  // strip charts
  panel.appendChild(el('div', `${NS}-sec`, 'STRIP CHARTS'));
  const strips = [
    { s: new Strip('att', [{ color: '#e6a93c' }, { color: '#5fa8d0' }], -90, 90), label: 'φ θ [±90°]' },
    { s: new Strip('rate', [{ color: '#d05a5a' }, { color: '#5fc08a' }, { color: '#9a7fd0' }], -60, 60), label: 'p q r [±60°/s]' },
    { s: new Strip('srf', [{ color: '#5fa8d0' }, { color: '#e6a93c' }, { color: '#5fc08a' }], -1, 1), label: 'ele ail rud [±1]' },
  ];
  const canvases = [];
  for (const st of strips) {
    panel.appendChild(el('div', `${NS}-ct`, st.label));
    const cv = el('canvas', `${NS}-chart`);
    cv.width = 264; cv.height = 52;
    panel.appendChild(cv);
    canvases.push({ cv, ctx: cv.getContext('2d'), s: st.s });
  }

  document.body.appendChild(panel);

  const setV = (e, txt, cls) => { if (!e) return; e.textContent = txt; e.className = `${NS}-v${cls ? ' ' + cls : ''}`; };
  const setBar = (key, v, range) => {
    const b = bars[key]; if (!b) return;
    const cl = Math.max(-range, Math.min(range, v));
    const frac = cl / range; // -1..1 for ±range
    if (frac >= 0) { b.fill.style.left = '50%'; b.fill.style.width = (frac * 50) + '%'; }
    else { b.fill.style.left = (50 + frac * 50) + '%'; b.fill.style.width = (-frac * 50) + '%'; }
    b.num.textContent = v.toFixed(2);
  };

  function update(d) {
    if (panel.classList.contains(`${NS}-hidden`)) return;
    clk.textContent = `t ${d.t.toFixed(1)}s`;
    setV(cells.px, d.pos.x.toFixed(1)); setV(cells.py, d.pos.y.toFixed(1)); setV(cells.pz, d.pos.z.toFixed(1));
    setV(cells.vu, d.vel.x.toFixed(1)); setV(cells.vv, d.vel.y.toFixed(1)); setV(cells.vw, d.vel.z.toFixed(1));
    setV(cells.alt, d.alt.toFixed(1)); setV(cells.spd, d.spd.toFixed(1));
    setV(cells.roll, d.roll.toFixed(1)); setV(cells.pitch, d.pitch.toFixed(1)); setV(cells.yaw, d.yaw.toFixed(0));
    setV(cells.p, d.p.toFixed(1)); setV(cells.q, d.q.toFixed(1)); setV(cells.r, d.r.toFixed(1));
    setV(cells.aoa, d.aoa.toFixed(1), Math.abs(d.aoa) > 14 ? 'warn' : '');
    setV(cells.beta, d.beta.toFixed(1), Math.abs(d.beta) > 12 ? 'warn' : '');
    setV(cells.qbar, d.qbar.toFixed(0)); setV(cells.gforce, d.g.toFixed(2), Math.abs(d.g) > 4 ? 'warn' : '');
    setV(cells.vsi, d.vsi.toFixed(1)); setV(cells.mach, d.mach.toFixed(3));

    setBar('elevator', d.act.elevator, 1); setBar('aileron', d.act.aileron, 1); setBar('rudder', d.act.rudder, 1);
    setBar('throttle', d.act.throttle, 1); setBar('flaps', d.act.flaps, 1);

    setV(cells.navSrc, d.navSource.toUpperCase());
    setV(cells.nis, d.nis == null ? '—' : d.nis.toFixed(2), d.nis > 7.8 ? 'bad' : '');
    setV(cells.gpserr, d.gpsErr == null ? '—' : d.gpsErr.toFixed(1), d.gpsErr > 10 ? 'warn' : '');
    navPill.textContent = d.navDegraded ? 'NAV DEGRADED' : 'NAV OK';
    navPill.className = `${NS}-pill ${d.navDegraded ? 'bad' : 'ok'}`;

    const faults = d.faults || {};
    const list = Object.entries(faults).filter(([, f]) => f).map(([k, f]) => `${k}:${f.type}`);
    active.textContent = list.length ? '⚠ ' + list.join('  ') : '';

    // strip charts
    canvases[0].s.push([d.roll, d.pitch]);
    canvases[1].s.push([d.p, d.q, d.r]);
    canvases[2].s.push([d.act.elevator, d.act.aileron, d.act.rudder]);
    for (const c of canvases) c.s.draw(c.ctx, c.cv.width, c.cv.height);
  }

  function setVisible(v) { panel.classList.toggle(`${NS}-hidden`, !v); }
  function isVisible() { return !panel.classList.contains(`${NS}-hidden`); }

  return { update, setVisible, isVisible };
}
