import './style.css';
import { Quaternion, Vector3 } from 'three';
import { generateMaze, initialBall, reachedGoal, stepBall } from './maze.js';
import { createView } from './toy.js';
import { initIcons } from './icons.js';

initIcons();
const surface = document.getElementById('surface');
const view = createView(surface);
const win = document.getElementById('win');
const announcement = document.getElementById('announcement');
const down = new Vector3(0, -12.4, 0);
const localGravity = new Vector3(), inverse = new Quaternion();
const keys = new Set(), pointers = new Map();
let maze, ball, playing = false, accumulator = 0, lastFrame = performance.now();
let pinch, suspended = false;

function clearInput() {
  keys.clear();
  for (const id of pointers.keys()) if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  pointers.clear(); pinch = undefined; surface.classList.remove('grabbing');
}
function restart() {
  clearInput();
  ball = initialBall(maze); accumulator = 0; playing = false; win.hidden = true;
  view.reset(); view.render(ball); lastFrame = performance.now();
}
function newMaze() {
  let seed;
  do { seed = crypto.getRandomValues(new Uint32Array(1))[0]; } while (maze?.seed === seed);
  maze = generateMaze(seed);
  view.load(maze);
  restart();
}
document.getElementById('new-maze').onclick = () => {
  newMaze(); announcement.textContent = 'New maze generated.'; surface.focus({preventScroll:true});
};
document.getElementById('restart').onclick = () => {
  restart(); announcement.textContent = 'Maze restarted.'; surface.focus({preventScroll:true});
};

function pairGesture() {
  const [a,b] = pointers.values();
  return { x: (a.x+b.x)/2, y: (a.y+b.y)/2, dist: Math.hypot(a.x-b.x,a.y-b.y) };
}
surface.addEventListener('contextmenu', e => e.preventDefault());
surface.addEventListener('pointerdown', e => {
  if ((e.button !== 0 && e.button !== 2) || pointers.size >= 2) return;
  e.preventDefault();
  surface.focus({preventScroll:true});
  surface.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,orbit:e.button===2 || e.shiftKey});
  if (pointers.size===2) pinch=pairGesture();
  surface.classList.add('grabbing');
});
surface.addEventListener('pointermove', e => {
  const pointer = pointers.get(e.pointerId);
  if (!pointer) return;
  const dx=e.clientX-pointer.x, dy=e.clientY-pointer.y;
  pointer.x=e.clientX; pointer.y=e.clientY;
  if (pointers.size===2) {
    const next=pairGesture();
    view.orbit((next.x-pinch.x)*.009, (next.y-pinch.y)*.009);
    if (pinch.dist > 4 && next.dist > 4) view.setZoom(view.getZoom()*next.dist/pinch.dist);
    pinch=next;
  } else if (pointer.orbit || e.shiftKey) view.orbit(dx*.009,dy*.009);
  else if ((dx || dy) && win.hidden) { playing = true; view.tilt(dx*.009,dy*.009); }
});
function release(e) {
  pointers.delete(e.pointerId); pinch=undefined;
  if (pointers.size===0) surface.classList.remove('grabbing');
  else for (const p of pointers.values()) p.orbit=true;
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) surface.addEventListener(event,release);
surface.addEventListener('wheel', e => { e.preventDefault(); view.setZoom(view.getZoom()*Math.exp(-e.deltaY*.0012)); }, {passive:false});
function keyboardTilt(amount) {
  const dx = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  const dy = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
  if (!dx && !dy) return;
  if (keys.has('Shift')) view.orbit(dx * amount, dy * amount);
  else if (win.hidden) { playing = true; view.tilt(dx * amount, dy * amount); }
}
const directions = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
window.addEventListener('keydown', e => {
  if (e.key === 'Shift') keys.add('Shift');
  if (!directions.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault(); keys.add(e.key);
  if (e.shiftKey) keys.add('Shift'); else keys.delete('Shift');
  if (!e.repeat) keyboardTilt(.025);
});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('blur', () => { clearInput(); suspended=true; });
window.addEventListener('focus', () => { suspended=false; lastFrame=performance.now(); });
document.addEventListener('visibilitychange', () => { clearInput(); lastFrame=performance.now(); });
newMaze();

function frame(now) {
  const dt = Math.max(0,(now-lastFrame)/1000); lastFrame = now;
  if (!document.hidden && !suspended) {
    if (keys.size) keyboardTilt(Math.min(dt,.055) * 1.50);
    if (playing) {
      accumulator += Math.min(.1,dt);
      localGravity.copy(down).applyQuaternion(inverse.copy(view.orientation).invert());
      while (accumulator >= 1/120) {
        stepBall(ball,maze,localGravity,1/120);
        accumulator -= 1/120;
        if (reachedGoal(ball,maze)) {
          playing=false; win.hidden=false; clearInput();
          announcement.textContent='Maze solved!'; break;
        }
      }
    }
  }
  view.render(ball);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
