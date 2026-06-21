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
    position: fixed; top: 16px; left: 16px; z-index: 30;
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
  @media (max-width: 640px) {
    .${NS}-picker { top: 10px; left: 10px; min-width: 150px; padding: 6px 8px; }
    .${NS}-opt .${NS}-name { font-size: 12px; }
  }
  `;
  document.head.appendChild(el('style', null, css));
}

/**
 * Build the aircraft model picker.
 * @param {Array<{key,label,role,jet}>} models
 * @param {() => string} getCurrent
 * @param {(key:string) => void} onSelect
 * @returns {{ refresh: () => void, root: HTMLElement }}
 */
export function initModelPicker(models, getCurrent, onSelect) {
  injectStyles();
  const root = el('div', `${NS}-picker`);
  root.appendChild(el('div', `${NS}-title`, '◢ AIRCRAFT'));
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
