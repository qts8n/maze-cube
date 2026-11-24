import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DIRS, FACES, RADIUS, WALL_WIDTH, ballPosition, generateMaze, initialBall, reachedGoal, stepBall } from '../src/maze.js';

function paths(maze) {
  const previous = new Map([[maze.start.id, null]]);
  const queue = [maze.start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dir, edge] of c.neighbors.entries()) {
      if (!(c.open & (1 << dir)) || previous.has(edge.id)) continue;
      previous.set(edge.id, { id: c.id, dir });
      queue.push(maze.cells[edge.id]);
    }
  }
  return previous;
}

test('randomized mazes are connected trees with reciprocal passages across all six faces', () => {
  for (let seed = 0; seed < 180; seed++) {
    const maze = generateMaze(seed);
    let passages = 0;
    for (const c of maze.cells) {
      for (const [dir, edge] of c.neighbors.entries()) {
        const other = maze.cells[edge.id];
        assert.equal(other.neighbors[edge.back].id, c.id);
        assert.equal(!!(c.open & 1 << dir), !!(other.open & 1 << edge.back));
        if (c.open & 1 << dir) passages++;
      }
    }
    assert.equal(passages / 2, maze.cells.length - 1);
    assert.equal(paths(maze).size, maze.cells.length);
    assert.notEqual(maze.start.face, maze.goal.face);
    assert.equal(maze.doors.length, 10);
  }
});

test('the ball cannot tunnel through walls under sustained gravity', () => {
  const maze = generateMaze(0xabcde), dt = 1/120;
  for (const c of maze.cells) {
    for (const [dir, [dx,dy]] of DIRS.entries()) {
      if (c.open & 1 << dir) continue;
      const ball = {face:c.face, x:c.x+.5, y:c.y+.5, vx:dx*5.8, vy:dy*5.8};
      const face = FACES[c.face];
      const gravity = face.u.clone().multiplyScalar(dx*12.4).addScaledVector(face.v,dy*12.4);
      for (let i=0;i<80;i++) stepBall(ball,maze,gravity,dt);
      assert.equal(ball.face, c.face);
      assert.ok(Math.abs(dx*(ball.x-c.x-.5)+dy*(ball.y-c.y-.5)) <= .5-RADIUS-WALL_WIDTH/2+.00001);
    }
  }
});

test('a physically simulated ball can follow the solution through folded seams to the goal', () => {
  for (const seed of [1, 8, 491, 817, 9920, 90876]) {
    const maze = generateMaze(seed), previous = paths(maze), route = [];
    let id = maze.goal.id;
    while (id !== maze.start.id) {
      const prev = previous.get(id);
      route.unshift({ from: maze.cells[prev.id], to: maze.cells[id], dir: prev.dir });
      id = prev.id;
    }
    const ball = initialBall(maze);
    assert.equal(reachedGoal(ball,maze), false);
    let crossed = false;
    for (const {from,to,dir} of route) {
      let arrived = false;
      for (let i=0;i<480;i++) {
        const [dx,dy] = DIRS[dir];
        const atFace = ball.face === to.face;
        const x = atFace ? to.x + .5 : from.x + .5 + dx;
        const y = atFace ? to.y + .5 : from.y + .5 + dy;
        // Bounded downhill acceleration and braking from successive tilts.
        const acc = new Vector3(28*(x-ball.x)-8*ball.vx,28*(y-ball.y)-8*ball.vy,0).clampLength(0,12.4);
        const f = FACES[ball.face];
        const gravity = f.u.clone().multiplyScalar(acc.x).addScaledVector(f.v,acc.y);
        const lastFace = ball.face, lastPos=ballPosition(ball,maze.size);
        stepBall(ball,maze,gravity,1/120);
        if (lastFace!==ball.face) {
          assert.ok(lastPos.distanceTo(ballPosition(ball,maze.size)) < .10);
          crossed = true;
        }
        if (ball.face===to.face && Math.hypot(ball.x-to.x-.5,ball.y-to.y-.5)<.04 && Math.hypot(ball.vx,ball.vy)<.2) {
          arrived=true; break;
        }
      }
      assert.ok(arrived, 'Seed '+seed+' stopped before cell '+to.id);
    }
    assert.ok(crossed);
    assert.ok(reachedGoal(ball,maze));
  }
});
