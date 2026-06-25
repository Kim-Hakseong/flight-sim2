// Interactive UI overlays (DOM, pointer-events enabled — the HUD itself is
// pointer-events:none). M24: aircraft model picker. Later milestones add the
// intro/controls popup and mobile touch controls here.

const NS = 'fs-ui';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .${NS}-picker {
    position: fixed; top: 50px; left: 16px; z-index: 30;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    border: 1px solid rgba(120,200,255,0.5);
    background: linear-gradient(180deg, rgba(8,18,28,0.82), rgba(6,12,20,0.82));
    box-shadow: 0 0 16px rgba(60,150,230,0.25), inset 0 0 12px rgba(40,110,180,0.12);
    color: #cfe8ff; padding: 8px 10px; min-width: 178px;
    backdrop-filter: blur(3px);
  }
  .${NS}-picker .${NS}-title {
    font-size: 10px; letter-spacing: 2px; color: #7fd4ff; opacity: 0.85;
    margin-bottom: 6px; text-transform: uppercase;
  }
  .${NS}-opt {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 8px; padding: 5px 8px; margin: 2px 0; cursor: pointer;
    border: 1px solid transparent; border-radius: 2px;
    transition: background 0.12s, border-color 0.12s;
  }
  .${NS}-opt:hover { background: rgba(80,170,255,0.12); }
  .${NS}-opt.sel {
    background: rgba(60,150,230,0.22); border-color: rgba(120,200,255,0.7);
    box-shadow: inset 0 0 8px rgba(80,170,255,0.25);
  }
  .${NS}-opt .${NS}-name { font-size: 13px; font-weight: 700; color: #eaf6ff; }
  .${NS}-opt.sel .${NS}-name { color: #9fe0ff; text-shadow: 0 0 8px rgba(120,200,255,0.7); }
  .${NS}-opt .${NS}-role { font-size: 9px; opacity: 0.6; letter-spacing: 0.5px; }
  @media (max-width: 940px) {
    .${NS}-picker { top: 38px; left: 10px; min-width: 150px; padding: 6px 8px; }
    .${NS}-opt .${NS}-name { font-size: 12px; }
  }
  `;
  document.head.appendChild(el('style', null, css));
}

export const isTouchDevice = (typeof window !== 'undefined') &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0);

/**
 * Build the aircraft model picker.
 * @param {Array<{key,label,role,jet}>} models
 * @param {() => string} getCurrent
 * @param {(key:string) => void} onSelect
 * @returns {{ refresh: () => void, root: HTMLElement }}
 */
export function initModelPicker(models, getCurrent, onSelect, opts = {}) {
  injectStyles();
  const root = el('div', `${NS}-picker`);
  if (opts.top != null) root.style.top = opts.top + 'px';
  root.appendChild(el('div', `${NS}-title`, opts.title || '◢ AIRCRAFT'));
  const optEls = new Map();
  for (const m of models) {
    const o = el('div', `${NS}-opt`);
    o.appendChild(el('span', `${NS}-name`, m.label));
    o.appendChild(el('span', `${NS}-role`, m.role || (m.jet ? 'JET' : '')));
    o.addEventListener('click', () => { onSelect(m.key); refresh(); });
    root.appendChild(o);
    optEls.set(m.key, o);
  }
  function refresh() {
    const cur = getCurrent();
    for (const [key, o] of optEls) o.classList.toggle('sel', key === cur);
  }
  refresh();
  document.body.appendChild(root);
  return { refresh, root };
}

// ---------------------------------------------------------------------------
// Intro / controls popup (M25). Shown on entry; explains controls and offers a
// one-tap AUTO demo (ideal for mobile / first-time visitors).
// ---------------------------------------------------------------------------
let introStylesInjected = false;
function injectIntroStyles() {
  if (introStylesInjected) return;
  introStylesInjected = true;
  const cyan = 'rgba(120,200,255,';
  const css = `
  .${NS}-modal {
    position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(ellipse at center, rgba(4,10,18,0.78), rgba(2,6,12,0.92));
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #cfe8ff;
    backdrop-filter: blur(4px); opacity: 1; transition: opacity 0.25s;
  }
  .${NS}-modal.${NS}-hide { opacity: 0; pointer-events: none; }
  .${NS}-card {
    width: min(640px, 92vw); max-height: 88vh; overflow-y: auto;
    border: 1px solid ${cyan}0.5); border-radius: 4px;
    background: linear-gradient(180deg, rgba(10,20,32,0.96), rgba(6,14,24,0.96));
    box-shadow: 0 0 40px ${cyan}0.22), inset 0 0 24px rgba(40,110,180,0.1);
    padding: 22px 24px;
  }
  .${NS}-card h1 { margin: 0 0 2px; font-size: 22px; letter-spacing: 1px; color: #eaf6ff; }
  .${NS}-card h1 .${NS}-accent { color: #7fd4ff; text-shadow: 0 0 12px ${cyan}0.6); }
  .${NS}-sub { font-size: 11px; opacity: 0.7; letter-spacing: 1px; margin-bottom: 16px; }
  .${NS}-sec { font-size: 10px; letter-spacing: 2px; color: #7fd4ff; opacity: 0.85; margin: 16px 0 8px; text-transform: uppercase; }
  .${NS}-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; font-size: 12px; }
  .${NS}-keys .k { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px solid rgba(120,200,255,0.08); }
  .${NS}-keys .k b { color: #9fe0ff; font-weight: 700; }
  .${NS}-keys .k span { opacity: 0.8; }
  .${NS}-btns { display: flex; gap: 12px; margin-top: 22px; flex-wrap: wrap; }
  .${NS}-btn {
    flex: 1 1 180px; padding: 14px 16px; cursor: pointer; text-align: center;
    border: 1px solid ${cyan}0.5); border-radius: 3px; font-size: 14px; font-weight: 700;
    letter-spacing: 1px; color: #eaf6ff; background: rgba(40,90,150,0.18);
    transition: background 0.14s, box-shadow 0.14s, transform 0.05s;
  }
  .${NS}-btn:hover { background: rgba(60,140,220,0.3); box-shadow: 0 0 16px ${cyan}0.3); }
  .${NS}-btn:active { transform: translateY(1px); }
  .${NS}-btn.${NS}-primary { background: linear-gradient(180deg, rgba(60,150,230,0.45), rgba(40,110,190,0.35)); border-color: ${cyan}0.85); }
  .${NS}-btn .${NS}-bsub { display: block; font-size: 10px; font-weight: 400; opacity: 0.7; margin-top: 3px; letter-spacing: 0; }
  .${NS}-seg { display: flex; gap: 8px; }
  .${NS}-segbtn {
    flex: 1 1 0; padding: 10px 8px; cursor: pointer; text-align: center;
    border: 1px solid ${cyan}0.4); border-radius: 3px; background: rgba(40,90,150,0.12);
    transition: background 0.14s, box-shadow 0.14s, border-color 0.14s;
  }
  .${NS}-segbtn:hover { background: rgba(60,140,220,0.25); }
  .${NS}-segbtn.sel {
    background: linear-gradient(180deg, rgba(60,150,230,0.45), rgba(40,110,190,0.32));
    border-color: ${cyan}0.85); box-shadow: 0 0 14px ${cyan}0.3);
  }
  .${NS}-segname { display: block; font-size: 14px; font-weight: 700; color: #eaf6ff; letter-spacing: 1px; }
  .${NS}-segbtn.sel .${NS}-segname { color: #9fe0ff; text-shadow: 0 0 8px ${cyan}0.7); }
  .${NS}-segsub { display: block; font-size: 9px; opacity: 0.6; margin-top: 3px; }
  .${NS}-foot { margin-top: 14px; font-size: 10px; opacity: 0.55; text-align: center; }
  .${NS}-help-btn {
    position: fixed; bottom: 14px; right: 14px; z-index: 31; width: 34px; height: 34px;
    border: 1px solid ${cyan}0.5); border-radius: 50%; background: rgba(8,18,28,0.8);
    color: #9fe0ff; font: 700 16px ui-monospace, monospace; cursor: pointer;
    display: flex; align-items: center; justify-content: center; pointer-events: auto;
  }
  .${NS}-help-btn:hover { background: rgba(60,140,220,0.3); }
  `;
  document.head.appendChild(el('style', null, css));
}

const KEY_ROWS = [
  ['W / S', '피치 (기수 상/하)'], ['A / D', '롤 (좌/우 뱅크)'],
  ['Q / E', '요 (방향타 좌/우)'], ['↑ / ↓', '스로틀 증/감'],
  ['M', 'AUTO 미션 시작'], ['N', 'AUTO 해제'],
  ['V', '카메라 전환'], ['R', '리셋'], ['P', '일시정지'],
  ['B', '엔지니어링 ↔ 시네마틱 뷰'],
];

/**
 * Show the intro/controls modal.
 * @param {{ onDemo: ()=>void, onManual?: ()=>void, touch: boolean }} hooks
 */
export function initIntro(hooks) {
  injectIntroStyles();
  const modal = el('div', `${NS}-modal`);
  const card = el('div', `${NS}-card`);

  card.appendChild(el('h1', null, `<span class="${NS}-accent">◢</span> FLIGHT-SIM <span class="${NS}-accent">HILS</span>`));
  card.appendChild(el('div', `${NS}-sub`, '국방·항공 HILS 비행 시뮬레이터 — 결정론적 6-DOF · 센서/항법 · 바람 자동착륙'));

  if (hooks.touch) {
    card.appendChild(el('div', `${NS}-sec`, '터치 조작'));
    card.appendChild(el('div', null,
      '<div style="font-size:12px;line-height:1.7;opacity:0.85">' +
      '좌측 <b style="color:#9fe0ff">조이스틱</b> = 피치/롤 · 우측 <b style="color:#9fe0ff">스로틀</b> 슬라이더 · ' +
      '하단 <b style="color:#9fe0ff">버튼</b>으로 요·카메라·AUTO.<br>' +
      '키 입력이 부담되면 <b style="color:#9fe0ff">AUTO 시연</b>으로 자율 비행을 감상하세요.</div>'));
  }

  card.appendChild(el('div', `${NS}-sec`, '키보드'));
  const keys = el('div', `${NS}-keys`);
  for (const [k, d] of KEY_ROWS) {
    const row = el('div', 'k');
    row.appendChild(el('b', null, k));
    row.appendChild(el('span', null, d));
    keys.appendChild(row);
  }
  card.appendChild(keys);

  // Control sensitivity selector (M44): three coarse buttons, mouse-DPI style.
  if (hooks.sensitivity && hooks.sensitivity.levels) {
    card.appendChild(el('div', `${NS}-sec`, '조종 민감도 (마우스 DPI 처럼)'));
    const seg = el('div', `${NS}-seg`);
    const segEls = new Map();
    const refreshSeg = () => {
      const cur = hooks.sensitivity.get();
      for (const [k, b] of segEls) b.classList.toggle('sel', k === cur);
    };
    for (const lv of hooks.sensitivity.levels) {
      const b = el('div', `${NS}-segbtn`);
      b.appendChild(el('span', `${NS}-segname`, lv.label));
      b.appendChild(el('span', `${NS}-segsub`, lv.sub));
      b.addEventListener('click', () => { hooks.sensitivity.set(lv.key); refreshSeg(); });
      seg.appendChild(b);
      segEls.set(lv.key, b);
    }
    refreshSeg();
    card.appendChild(seg);
  }

  const btns = el('div', `${NS}-btns`);
  const demoBtn = el('div', `${NS}-btn ${NS}-primary`,
    `▶ AUTO 시연 시작<span class="${NS}-bsub">이륙→순항→크로스윈드 자동착륙</span>`);
  demoBtn.addEventListener('click', () => { close(); hooks.onDemo && hooks.onDemo(); });
  const manualBtn = el('div', `${NS}-btn`,
    `✈ 수동 비행<span class="${NS}-bsub">직접 조종</span>`);
  manualBtn.addEventListener('click', () => { close(); hooks.onManual && hooks.onManual(); });
  btns.appendChild(demoBtn); btns.appendChild(manualBtn);
  card.appendChild(btns);
  card.appendChild(el('div', `${NS}-foot`, '좌상단에서 기체 선택 · 우하단 ? 로 도움말 다시 보기'));

  modal.appendChild(card);
  document.body.appendChild(modal);

  function close() { modal.classList.add(`${NS}-hide`); }
  function open() { modal.classList.remove(`${NS}-hide`); }

  // persistent help button to reopen
  const helpBtn = el('div', `${NS}-help-btn`, '?');
  helpBtn.title = '조작 도움말';
  helpBtn.addEventListener('click', open);
  document.body.appendChild(helpBtn);

  return { open, close };
}

// ---------------------------------------------------------------------------
// Mobile touch controls (M25): virtual joystick (pitch/roll), throttle slider,
// and action buttons. Writes directly into the keyboard control state object.
// ---------------------------------------------------------------------------
let touchStylesInjected = false;
function injectTouchStyles() {
  if (touchStylesInjected) return;
  touchStylesInjected = true;
  const c = 'rgba(120,200,255,';
  const css = `
  .${NS}-touch { position: fixed; inset: 0; z-index: 25; pointer-events: none; touch-action: none; }
  .${NS}-touch.${NS}-hidden { display: none; }
  .${NS}-touch .pe { pointer-events: auto; touch-action: none; }
  .${NS}-toggle {
    position: fixed; bottom: 14px; right: 56px; z-index: 31; height: 34px; padding: 0 12px;
    border: 1px solid rgba(120,200,255,0.5); border-radius: 17px; background: rgba(8,18,28,0.8);
    color: #9fe0ff; font: 700 12px ui-monospace, monospace; letter-spacing: 0.5px; cursor: pointer;
    display: flex; align-items: center; gap: 6px; pointer-events: auto; user-select: none;
  }
  .${NS}-toggle:hover { background: rgba(60,140,220,0.3); }
  .${NS}-toggle.on { background: rgba(60,150,230,0.45); border-color: rgba(120,200,255,0.9); color: #eaf6ff; }
  .${NS}-stick {
    position: absolute; left: 22px; bottom: 26px; width: 132px; height: 132px;
    border-radius: 50%; border: 1px solid ${c}0.45);
    background: radial-gradient(circle, rgba(20,40,60,0.35), rgba(10,20,32,0.5));
    box-shadow: inset 0 0 18px ${c}0.15);
  }
  .${NS}-stick .knob {
    position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px;
    border-radius: 50%; border: 1px solid ${c}0.7);
    background: radial-gradient(circle at 40% 35%, rgba(120,200,255,0.5), rgba(30,70,110,0.6));
    box-shadow: 0 0 14px ${c}0.4);
  }
  .${NS}-stick .xh { position:absolute; left:50%; top:50%; width:1px; height:1px; }
  .${NS}-throttle {
    position: absolute; right: 24px; bottom: 26px; width: 56px; height: 180px;
    border: 1px solid ${c}0.45); border-radius: 28px; overflow: hidden;
    background: rgba(10,20,32,0.5);
  }
  .${NS}-throttle .fill { position:absolute; left:0; right:0; bottom:0; height:0%;
    background: linear-gradient(0deg, rgba(60,150,230,0.55), rgba(120,200,255,0.35)); }
  .${NS}-throttle .lbl { position:absolute; left:0; right:0; top:6px; text-align:center;
    font: 700 10px ui-monospace, monospace; color:#9fe0ff; letter-spacing:1px; }
  .${NS}-throttle .val { position:absolute; left:0; right:0; bottom:6px; text-align:center;
    font: 700 13px ui-monospace, monospace; color:#eaf6ff; }
  .${NS}-tbtns { position: absolute; right: 22px; bottom: 220px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
  .${NS}-tbtnrow { display: flex; gap: 8px; }
  .${NS}-tbtn {
    min-width: 48px; padding: 9px 11px; text-align: center; cursor: pointer;
    border: 1px solid ${c}0.45); border-radius: 4px; background: rgba(10,22,34,0.7);
    color: #cfe8ff; font: 700 12px ui-monospace, monospace; letter-spacing: 0.5px;
  }
  .${NS}-tbtn.act { background: rgba(60,140,220,0.4); box-shadow: 0 0 12px ${c}0.4); }
  .${NS}-tbtn.auto { border-color: rgba(110,255,150,0.6); color: #9fffb0; }
  `;
  document.head.appendChild(el('style', null, css));
}

/**
 * Build mobile touch controls bound to the keyboard control `state`.
 * @param {object} state control state (pitch/roll/yaw/throttle + on* hooks)
 * @param {{ onCamera:()=>void, onDemo:()=>void, onPause:()=>void }} hooks
 */
export function initTouchControls(state, hooks, startVisible = true) {
  injectTouchStyles();
  const root = el('div', `${NS}-touch`);

  // --- virtual joystick (pitch/roll) ---
  const stick = el('div', `${NS}-stick pe`);
  const knob = el('div', 'knob');
  stick.appendChild(knob);
  root.appendChild(stick);
  let stickId = null;
  const R = 52; // px travel
  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.roll = Math.max(-1, Math.min(1, dx / R));
    state.pitch = Math.max(-1, Math.min(1, -dy / R)); // up on screen = nose up
  }
  function stickMove(e) {
    const t = [...e.touches || [], ...(e.pointerId != null ? [e] : [])].find((x) => x.identifier === stickId || stickId === 'mouse');
    const pt = e.touches ? [...e.touches].find((x) => x.identifier === stickId) : e;
    if (!pt) return;
    const r = stick.getBoundingClientRect();
    let dx = pt.clientX - (r.left + r.width / 2);
    let dy = pt.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    setKnob(dx, dy);
  }
  function stickEnd() { stickId = null; setKnob(0, 0); }
  stick.addEventListener('pointerdown', (e) => { stickId = 'mouse'; stick.setPointerCapture(e.pointerId); stickMove(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (stickId) stickMove(e); });
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);

  // --- throttle slider ---
  const thr = el('div', `${NS}-throttle pe`);
  const fill = el('div', 'fill');
  const val = el('div', 'val', '0%');
  thr.appendChild(el('div', 'lbl', 'THR'));
  thr.appendChild(fill); thr.appendChild(val);
  root.appendChild(thr);
  function setThr(clientY) {
    const r = thr.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    state.throttle = v;
    fill.style.height = `${(v * 100).toFixed(0)}%`;
    val.textContent = `${Math.round(v * 100)}%`;
  }
  let thrActive = false;
  thr.addEventListener('pointerdown', (e) => { thrActive = true; thr.setPointerCapture(e.pointerId); setThr(e.clientY); e.preventDefault(); });
  thr.addEventListener('pointermove', (e) => { if (thrActive) setThr(e.clientY); });
  thr.addEventListener('pointerup', () => { thrActive = false; });
  thr.addEventListener('pointercancel', () => { thrActive = false; });

  // --- action buttons ---
  const tbtns = el('div', `${NS}-tbtns`);
  const yawRow = el('div', `${NS}-tbtnrow`);
  const yawL = el('div', `${NS}-tbtn pe`, '◀ YAW');
  const yawR = el('div', `${NS}-tbtn pe`, 'YAW ▶');
  const holdYaw = (btn, v) => {
    btn.addEventListener('pointerdown', (e) => { state.yaw = v; btn.classList.add('act'); e.preventDefault(); });
    const clr = () => { state.yaw = 0; btn.classList.remove('act'); };
    btn.addEventListener('pointerup', clr); btn.addEventListener('pointercancel', clr); btn.addEventListener('pointerleave', clr);
  };
  holdYaw(yawL, -1); holdYaw(yawR, 1);
  yawRow.appendChild(yawL); yawRow.appendChild(yawR);

  const row2 = el('div', `${NS}-tbtnrow`);
  const camBtn = el('div', `${NS}-tbtn pe`, 'CAM');
  camBtn.addEventListener('pointerdown', (e) => { hooks.onCamera && hooks.onCamera(); e.preventDefault(); });
  const pauseBtn = el('div', `${NS}-tbtn pe`, 'II');
  pauseBtn.addEventListener('pointerdown', (e) => { hooks.onPause && hooks.onPause(); e.preventDefault(); });
  const autoBtn = el('div', `${NS}-tbtn auto pe`, 'AUTO');
  autoBtn.addEventListener('pointerdown', (e) => { hooks.onDemo && hooks.onDemo(); e.preventDefault(); });
  const resetBtn = el('div', `${NS}-tbtn pe`, '↻ RST');
  resetBtn.addEventListener('pointerdown', (e) => { hooks.onReset && hooks.onReset(); e.preventDefault(); });
  row2.appendChild(resetBtn); row2.appendChild(camBtn); row2.appendChild(pauseBtn); row2.appendChild(autoBtn);

  tbtns.appendChild(yawRow); tbtns.appendChild(row2);
  root.appendChild(tbtns);

  document.body.appendChild(root);

  // Visibility + a toggle button so the on-screen controls can be turned on/off.
  let visible = startVisible;
  function apply() {
    root.classList.toggle(`${NS}-hidden`, !visible);
    if (!visible) { state.pitch = 0; state.roll = 0; state.yaw = 0; } // release axes when hidden
  }
  const toggleBtn = el('div', `${NS}-toggle`, '🕹 <span>조작</span>');
  toggleBtn.title = '터치 컨트롤 켜기/끄기';
  function setVisible(v) { visible = v; toggleBtn.classList.toggle('on', v); apply(); hooks.onToggle && hooks.onToggle(v); }
  toggleBtn.addEventListener('click', () => setVisible(!visible));
  document.body.appendChild(toggleBtn);
  setVisible(startVisible);

  return { root, setVisible, isVisible: () => visible };
}
