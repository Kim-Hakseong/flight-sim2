// Collision: pure functions + a simple obstacle registry.
// COORDINATE: world-frame +Y up. Obstacles are static (buildings, mountains).

// ---------- Pure shape tests ----------

/**
 * Sphere ↔ axis-aligned bounding box (AABB).
 * Box: { cx, cy, cz, hx, hy, hz }  (cx..cz = center, hx..hz = half-extents)
 * Returns null if no overlap, or { depth, nx, ny, nz, px, py, pz } otherwise.
 *   nx,ny,nz — unit normal pushing the sphere out of the box.
 *   depth    — penetration depth along that normal.
 *   px,py,pz — closest point on the box surface (rough impact point).
 */
export function sphereVsBox(p, radius, box) {
  // Closest point on the box to the sphere center.
  const dx = clamp(p.x, box.cx - box.hx, box.cx + box.hx);
  const dy = clamp(p.y, box.cy - box.hy, box.cy + box.hy);
  const dz = clamp(p.z, box.cz - box.hz, box.cz + box.hz);
  let vx = p.x - dx, vy = p.y - dy, vz = p.z - dz;
  let dist2 = vx * vx + vy * vy + vz * vz;

  if (dist2 > radius * radius) return null;

  if (dist2 > 1e-9) {
    const dist = Math.sqrt(dist2);
    return {
      depth: radius - dist,
      nx: vx / dist, ny: vy / dist, nz: vz / dist,
      px: dx, py: dy, pz: dz,
    };
  }
  // Sphere center is inside the box: push out along the shallowest face.
  const overlapX = box.hx - Math.abs(p.x - box.cx);
  const overlapY = box.hy - Math.abs(p.y - box.cy);
  const overlapZ = box.hz - Math.abs(p.z - box.cz);
  if (overlapX < overlapY && overlapX < overlapZ) {
    const sgn = p.x >= box.cx ? 1 : -1;
    return { depth: overlapX + radius, nx: sgn, ny: 0, nz: 0, px: p.x, py: p.y, pz: p.z };
  } else if (overlapY < overlapZ) {
    const sgn = p.y >= box.cy ? 1 : -1;
    return { depth: overlapY + radius, nx: 0, ny: sgn, nz: 0, px: p.x, py: p.y, pz: p.z };
  } else {
    const sgn = p.z >= box.cz ? 1 : -1;
    return { depth: overlapZ + radius, nx: 0, ny: 0, nz: sgn, px: p.x, py: p.y, pz: p.z };
  }
}

/**
 * Sphere ↔ vertical cone (mountain-shaped: base at cy, apex at cy + height,
 * radius linearly decreasing from `radius` to 0).
 * This is an approximation: it tests against the cone's bounding profile
 * (a circle radius at every Y), not the slant surface mathematically — which
 * is good enough for "did the plane hit the mountain" decisions.
 */
export function sphereVsCone(p, radius, cone) {
  const dy = p.y - cone.cy;
  if (dy < -radius)               return null; // below ground
  if (dy > cone.height + radius)  return null; // above apex

  const t = clamp(dy / cone.height, 0, 1);
  const localR = cone.radius * (1 - t);
  const hx = p.x - cone.cx;
  const hz = p.z - cone.cz;
  const horiz = Math.hypot(hx, hz);
  if (horiz > localR + radius) return null;

  // Approximate normal: outward radial direction in XZ.
  const nLen = horiz > 1e-6 ? horiz : 1;
  return {
    depth: (localR + radius) - horiz,
    nx: hx / nLen, ny: 0, nz: hz / nLen,
    px: cone.cx + (hx / nLen) * localR,
    py: p.y,
    pz: cone.cz + (hz / nLen) * localR,
  };
}

/**
 * Decide which aircraft component took the hit, based on the impact point in
 * the aircraft's body frame.
 *   body +X = right wing, +Y = top, -Z = nose forward.
 *
 * Heuristic zones:
 *   |localX| > 1.5            → leftWing / rightWing (sign of X)
 *   localZ < -4.0             → engine (very nose)
 *   localZ <  0               → fuselage (front half)
 *   localZ >  2.5             → tail
 *   else                       → fuselage
 */
export function classifyHit({ localX, localY, localZ }) {
  if (localZ < -4.0 && Math.abs(localX) < 1.5) return 'engine';
  if (Math.abs(localX) > 1.5) return localX > 0 ? 'rightWing' : 'leftWing';
  if (localZ > 2.5)  return 'tail';
  return 'fuselage';
}

// ---------- Obstacle registry ----------

export function createColliders() {
  return { boxes: [], cones: [] };
}

export function addBox(reg, box)  { reg.boxes.push(box); }
export function addCone(reg, cone) { reg.cones.push(cone); }

/**
 * Test the aircraft sphere against every obstacle. Returns the deepest hit
 * found (or null). For typical scenes (~100 objects) the linear scan is fine;
 * if it ever shows up in profiles, swap in a uniform grid.
 */
export function checkAircraft(reg, p, radius) {
  let best = null;
  for (const b of reg.boxes) {
    const h = sphereVsBox(p, radius, b);
    if (h && (!best || h.depth > best.depth)) best = h;
  }
  for (const c of reg.cones) {
    const h = sphereVsCone(p, radius, c);
    if (h && (!best || h.depth > best.depth)) best = h;
  }
  return best;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
