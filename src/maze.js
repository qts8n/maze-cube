import { Vector3 } from 'three';

const vec = (x, y, z) => new Vector3(x, y, z);
export const FACES = [
  { name: 'Top',   n: vec(0, 1, 0),  u: vec(1, 0, 0),  v: vec(0, 0, -1) },
  { name: 'Front', n: vec(0, 0, 1),  u: vec(1, 0, 0),  v: vec(0, 1, 0) },
  { name: 'Right', n: vec(1, 0, 0),  u: vec(0, 0, -1), v: vec(0, 1, 0) },
  { name: 'Back',  n: vec(0, 0, -1), u: vec(-1, 0, 0), v: vec(0, 1, 0) },
  { name: 'Left',  n: vec(-1, 0, 0), u: vec(0, 0, 1),  v: vec(0, 1, 0) },
  { name: 'Base',  n: vec(0, -1, 0), u: vec(1, 0, 0),  v: vec(0, 0, 1) },
];
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const RADIUS = 0.31;
export const WALL_WIDTH = 0.115;
export const WALL_HEIGHT = 0.38;

export function facePoint(face, x, y, size, lift = 0) {
  const { n, u, v } = FACES[face];
  return n.clone().multiplyScalar(size / 2 + lift)
    .addScaledVector(u, x - size / 2).addScaledVector(v, y - size / 2);
}

// Fold a point and its tangent velocity through a cube edge by a quarter turn.
export function crossEdge(face, direction, x, y, vx, vy, size) {
  const old = FACES[face];
  const [dx, dy] = DIRS[direction];
  const outward = old.u.clone().multiplyScalar(dx).addScaledVector(old.v, dy);
  const index = FACES.findIndex(f => f.n.equals(outward));
  const next = FACES[index];
  const excess = Math.max(0, x - size, y - size, -x, -y);
  const point = facePoint(face, x, y, size)
    .addScaledVector(outward, -excess).addScaledVector(old.n, -excess);
  const speed = dx * vx + dy * vy;
  const vel = old.u.clone().multiplyScalar(vx).addScaledVector(old.v, vy)
    .addScaledVector(outward, -speed).addScaledVector(old.n, -speed);
  return { face: index, x: point.dot(next.u) + size / 2, y: point.dot(next.v) + size / 2,
    vx: vel.dot(next.u), vy: vel.dot(next.v) };
}

function randomSource(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, a | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateMaze(seed, size = 12) {
  const random = randomSource(seed);
  const pick = list => list[Math.floor(random() * list.length)];
  const area = size * size;
  const cellId = (f, x, y) => f * area + y * size + x;
  const cells = Array.from({ length: area * 6 }, (_, id) => ({
    id, face: Math.floor(id / area), x: id % size, y: Math.floor(id / size) % size,
    open: 0, neighbors: [],
  }));
  for (const c of cells) {
    for (const [dir, [dx, dy]] of DIRS.entries()) {
      let x = c.x + dx, y = c.y + dy, f = c.face, back = (dir + 2) % 4;
      if (x < 0 || y < 0 || x >= size || y >= size) {
        const p = crossEdge(f, dir, x + 0.5, y + 0.5, dx, dy, size);
        f = p.face;
        x = Math.floor(p.x);
        y = Math.floor(p.y);
        back = DIRS.findIndex(([a, b]) => a === -p.vx && b === -p.vy);
      }
      c.neighbors.push({ id: cellId(f, x, y), back });
    }
  }
  function carve(cell, dir) {
    const edge = cell.neighbors[dir];
    cell.open |= 1 << dir;
    cells[edge.id].open |= 1 << edge.back;
  }
  // Each face gets a perfect maze. An additional tree on the face graph joins
  // them through five clearly visible doors, keeping the entire surface solvable.
  const visited = new Uint8Array(cells.length);
  for (let face = 0; face < 6; face++) {
    const first = cells[face * area + Math.floor(random() * area)];
    const stack = [first];
    visited[first.id] = 1;
    let last = -1;
    while (stack.length) {
      const c = stack.at(-1);
      const choices = [0, 1, 2, 3].filter(d => {
        const next = cells[c.neighbors[d].id];
        return next.face === face && !visited[next.id];
      });
      if (!choices.length) { stack.pop(); last = -1; continue; }
      const d = choices.includes(last) && random() < 0.12 ? last : pick(choices);
      const next = cells[c.neighbors[d].id];
      carve(c, d);
      visited[next.id] = 1;
      stack.push(next);
      last = d;
    }
  }
  const linked = new Set([0]);
  const stack = [0];
  const doors = [];
  while (linked.size < 6) {
    const f = stack.at(-1);
    const options = [];
    for (const c of cells.slice(f * area, (f + 1) * area)) {
      for (const [dir, edge] of c.neighbors.entries()) {
        if (!linked.has(cells[edge.id].face) &&
          (c.x === 0 || c.x === size - 1) !== (c.y === 0 || c.y === size - 1)) {
          options.push({ c, dir, edge });
        }
      }
    }
    if (!options.length) { stack.pop(); continue; }
    const { c, dir, edge } = pick(options);
    carve(c, dir);
    const next = cells[edge.id];
    doors.push({ c, dir }, { c: next, dir: edge.back });
    linked.add(next.face);
    stack.push(next.face);
  }
  const start = cells[cellId(0, 1 + Math.floor(random() * (size - 2)), 1 + Math.floor(random() * (size - 2)))];
  const dist = new Int16Array(cells.length).fill(-1);
  dist[start.id] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    c.neighbors.forEach((edge, d) => {
      if (c.open & (1 << d) && dist[edge.id] === -1) {
        dist[edge.id] = dist[c.id] + 1;
        queue.push(cells[edge.id]);
      }
    });
  }
  const candidates = cells.filter(c => (c.face === 1 || c.face === 2) &&
    c.x > 0 && c.x < size - 1 && c.y > 0 && c.y < size - 1);
  const goal = candidates.reduce((a, b) => dist[a.id] > dist[b.id] ? a : b);
  const walls = FACES.map(() => []);
  for (const c of cells) {
    const { x, y } = c;
    const sides = [[x+1,y,x+1,y+1], [x,y+1,x+1,y+1], [x,y,x,y+1], [x,y,x+1,y]];
    for (let d = 0; d < 4; d++) {
      if (!(c.open & (1 << d)) && (d < 2 || d === 2 && x === 0 || d === 3 && y === 0)) {
        walls[c.face].push(sides[d]);
      }
    }
  }
  return { seed, size, cells, walls, doors, start, goal };
}

export function initialBall(maze) {
  return { face: maze.start.face, x: maze.start.x + 0.5, y: maze.start.y + 0.5, vx: 0, vy: 0 };
}

// Position-based contact correction plus a small restitution impulse. At the
// fixed timestep the maximum travel is well below the ball's contact radius.
export function stepBall(ball, maze, gravity, dt) {
  const face = FACES[ball.face];
  const drag = Math.exp(-1.3 * dt);
  ball.vx = (ball.vx + gravity.dot(face.u) * dt) * drag;
  ball.vy = (ball.vy + gravity.dot(face.v) * dt) * drag;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > 5.8) { ball.vx *= 5.8 / speed; ball.vy *= 5.8 / speed; }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const contact = RADIUS + WALL_WIDTH / 2;
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const [x1, y1, x2, y2] of maze.walls[ball.face]) {
      const dx = ball.x - Math.max(x1, Math.min(x2, ball.x));
      const dy = ball.y - Math.max(y1, Math.min(y2, ball.y));
      const distance2 = dx * dx + dy * dy;
      if (distance2 >= contact * contact || distance2 < 1e-12) continue;
      const distance = Math.sqrt(distance2);
      const nx = dx / distance, ny = dy / distance;
      ball.x += nx * (contact - distance);
      ball.y += ny * (contact - distance);
      const incoming = ball.vx * nx + ball.vy * ny;
      if (incoming < 0) {
        impact = Math.max(impact, -incoming);
        ball.vx -= 1.16 * incoming * nx;
        ball.vy -= 1.16 * incoming * ny;
      }
    }
  }
  const s = maze.size;
  const edge = ball.x > s ? 0 : ball.y > s ? 1 : ball.x < 0 ? 2 : ball.y < 0 ? 3 : -1;
  if (edge !== -1) Object.assign(ball, crossEdge(ball.face, edge, ball.x, ball.y, ball.vx, ball.vy, s));
  return impact;
}

export function ballPosition(ball, size) {
  const distances = [size - ball.x, size - ball.y, ball.x, ball.y];
  const d = Math.min(...distances);
  const p = facePoint(ball.face, ball.x, ball.y, size);
  const basis = FACES[ball.face];
  if (d >= RADIUS) return p.addScaledVector(basis.n, RADIUS);
  const [dx, dy] = DIRS[distances.indexOf(d)];
  const angle = (1 - d / RADIUS) * Math.PI / 4;
  return p.addScaledVector(basis.n, RADIUS * Math.cos(angle))
    .addScaledVector(basis.u, dx * RADIUS * Math.sin(angle))
    .addScaledVector(basis.v, dy * RADIUS * Math.sin(angle));
}

export function reachedGoal(ball, maze) {
  return ball.face === maze.goal.face && Math.hypot(ball.x - maze.goal.x - 0.5, ball.y - maze.goal.y - 0.5) < 0.34;
}
