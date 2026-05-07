// Scenario / course system. A course is a sequence of objectives the pilot
// hits in order; each hit adds points based on accuracy + time. Pure module —
// HUD reads the active state and renders.

const COURSES = [
  {
    id: 'pattern',
    name: 'Pattern',
    description: 'Climb out, fly a rectangular pattern, return.',
    objectives: [
      { type: 'altitude', alt: 200,                              name: 'Climb to 200 m',    points: 100 },
      { type: 'gate',  x: 0,    z: -800, alt: 200, radius: 150,  name: 'Crosswind turn',   points: 100 },
      { type: 'gate',  x: 1200, z: -800, alt: 200, radius: 150,  name: 'Downwind 1',       points: 100 },
      { type: 'gate',  x: 1200, z: 800,  alt: 200, radius: 150,  name: 'Downwind 2',       points: 100 },
      { type: 'gate',  x: 0,    z: 800,  alt: 150, radius: 150,  name: 'Base turn',        points: 100 },
      { type: 'gate',  x: 0,    z: 0,    alt: 50,  radius: 200,  name: 'Final approach',   points: 150 },
    ],
  },
  {
    id: 'slalom',
    name: 'Slalom',
    description: 'Weave through 5 gates, low altitude.',
    objectives: [
      { type: 'gate', x:  300, z: -200, alt: 100, radius: 100, name: 'Gate 1', points: 100 },
      { type: 'gate', x: -300, z: -600, alt: 100, radius: 100, name: 'Gate 2', points: 100 },
      { type: 'gate', x:  300, z:-1000, alt: 100, radius: 100, name: 'Gate 3', points: 100 },
      { type: 'gate', x: -300, z:-1400, alt: 100, radius: 100, name: 'Gate 4', points: 100 },
      { type: 'gate', x:    0, z:-1800, alt: 100, radius: 100, name: 'Gate 5', points: 200 },
    ],
  },
  {
    id: 'climb-test',
    name: 'Climb Test',
    description: 'How fast can you reach 1000 m?',
    objectives: [
      { type: 'altitude', alt: 500,  name: 'Half there',     points: 100 },
      { type: 'altitude', alt: 1000, name: 'Service ceiling', points: 250 },
    ],
  },
];

let active = null; // { courseId, idx, score, startMs, hits }

export function listCourses() {
  return COURSES.map((c, i) => ({ index: i, id: c.id, name: c.name, description: c.description }));
}

export function startCourse(idx) {
  if (idx < 0 || idx >= COURSES.length) return null;
  active = {
    courseId: COURSES[idx].id,
    idx: 0,
    score: 0,
    startMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    hits: [],
    completed: false,
  };
  return active;
}

export function abortCourse() { active = null; }
export function isActive() { return !!active && !active.completed; }
export function getActive() { return active; }

export function getCurrentObjective() {
  if (!active || active.completed) return null;
  const course = COURSES.find(c => c.id === active.courseId);
  return course ? course.objectives[active.idx] : null;
}

/**
 * Tick the scenario. Caller passes minimal sim state. We advance objectives
 * when the aircraft reaches them and accumulate score with a bonus that
 * decays with elapsed time and grows with arrival accuracy.
 */
export function tickScenario(simState, nowMs) {
  if (!active || active.completed) return active;
  const course = COURSES.find(c => c.id === active.courseId);
  if (!course) return active;
  const obj = course.objectives[active.idx];

  let hit = false;
  let accuracy = 0;
  if (obj.type === 'altitude') {
    if (simState.altitude >= obj.alt) {
      hit = true;
      accuracy = 1;
    }
  } else if (obj.type === 'gate') {
    const dx = obj.x - simState.x;
    const dz = obj.z - simState.z;
    const dy = obj.alt - simState.altitude;
    const horiz = Math.hypot(dx, dz);
    if (horiz < obj.radius && Math.abs(dy) < 60) {
      hit = true;
      accuracy = Math.max(0, 1 - horiz / obj.radius);
    }
  }
  if (hit) {
    const accuracyBonus = Math.round(obj.points * 0.5 * accuracy);
    active.score += obj.points + accuracyBonus;
    active.hits.push({ idx: active.idx, name: obj.name, atMs: nowMs - active.startMs });
    active.idx++;
    if (active.idx >= course.objectives.length) {
      active.completed = true;
      // Time bonus: cap at 5000 pts, decays to 0 by 10 minutes.
      const elapsed = (nowMs - active.startMs) / 1000;
      const timeBonus = Math.max(0, Math.round(5000 - elapsed * 8));
      active.score += timeBonus;
      active.timeBonus = timeBonus;
      active.totalSeconds = elapsed;
    }
  }
  return active;
}
