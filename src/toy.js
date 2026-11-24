import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACES, RADIUS, WALL_HEIGHT, WALL_WIDTH, ballPosition, facePoint } from './maze.js';

const floorColors = ['#2062aa', '#1458a2', '#164c96', '#18589e', '#18599f', '#194e90'];
const basisMatrix = f => new THREE.Matrix4().makeBasis(f.u, f.v, f.n);
function surfaceGeometry(geometry, face, x, y, size, lift) {
  return geometry.applyMatrix4(basisMatrix(FACES[face]).setPosition(facePoint(face, x, y, size, lift)));
}
function combine(group, geometries, material, shadow = false) {
  const merged = mergeGeometries(geometries);
  geometries.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

// Mold continuous runs so long partition walls have a single uninterrupted lip.
function wallRuns(walls) {
  const lines = new Map();
  for (const [x, y, x2, y2] of walls) {
    const horizontal = y === y2;
    const at = horizontal ? y : x;
    const key = (horizontal ? 'h' : 'v') + at;
    if (!lines.has(key)) lines.set(key, { horizontal, at, spans: [] });
    lines.get(key).spans.push([horizontal ? x : y, horizontal ? x2 : y2]);
  }
  const result = [];
  for (const { horizontal, at, spans } of lines.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    let [from, to] = spans[0];
    const add = () => result.push(horizontal ? [from, at, to, at] : [at, from, at, to]);
    for (const [start, end] of spans.slice(1)) {
      if (start === to) to = end;
      else { add(); from = start; to = end; }
    }
    add();
  }
  return result;
}

function floorTexture(maze, face, runs) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const step = 512 / maze.size;
  const py = y => 512 - y * step;
  ctx.fillStyle = floorColors[face];
  ctx.fillRect(0, 0, 512, 512);
  const glow = ctx.createLinearGradient(0, 0, 512, 512);
  glow.addColorStop(0, '#9ee5ff18');
  glow.addColorStop(.55, '#72bfff00');
  glow.addColorStop(1, '#06295339');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#c3e6ff12';
  for (let i = 1; i < maze.size; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, 512);
    ctx.moveTo(0, i * step); ctx.lineTo(512, i * step); ctx.stroke();
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#143758';
  ctx.shadowColor = '#09254dd9';
  ctx.shadowBlur = step * .16;
  ctx.shadowOffsetX = step * .06;
  ctx.shadowOffsetY = step * .07;
  ctx.lineWidth = step * .11;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of runs) {
    ctx.moveTo(x1 * step, py(y1)); ctx.lineTo(x2 * step, py(y2));
  }
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  // Paint subtle lane markings on both sides of every passable seam.
  for (const { c, dir } of maze.doors.filter(d => d.c.face === face)) {
    ctx.save();
    ctx.translate((c.x + .5) * step, py(c.y + .5));
    ctx.rotate(-dir * Math.PI / 2);
    ctx.strokeStyle = '#c5eaffb5';
    ctx.lineWidth = 1.8;
    for (const a of [.27, .37]) {
      ctx.beginPath(); ctx.moveTo((a - .07) * step, -.13 * step); ctx.lineTo(a * step, 0); ctx.lineTo((a - .07) * step, .13 * step); ctx.stroke();
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeToy(size) {
  const group = new THREE.Group();
  const h = size / 2;
  const core = new THREE.Mesh(new THREE.BoxGeometry(size - .006, size - .006, size - .006),
    new THREE.MeshStandardMaterial({ color: 0x155997, roughness: .42 }));
  group.add(core);
  const floors = FACES.map((_,f) => {
    const floor = new THREE.Mesh(surfaceGeometry(new THREE.PlaneGeometry(size, size), f, h, h, size, .003),
      new THREE.MeshStandardMaterial({ roughness: .53, metalness: .08 }));
    floor.receiveShadow = true;
    group.add(floor);
    return floor.material;
  });
  const plastic = new THREE.MeshStandardMaterial({
    color: 0x3689e7, vertexColors: true, roughness: .23, metalness: .16, envMapIntensity: .65,
  });
  // One fixed instance buffer per possible wall length is shared by every maze.
  const molds = Array.from({length:size}, (_,i) => {
    const length = i + 1;
    const geo = new RoundedBoxGeometry(length + WALL_WIDTH, WALL_WIDTH, WALL_HEIGHT, 1, .027);
    const normal = geo.attributes.normal, colors = [];
    for (let j = 0; j < normal.count; j++) {
      const t = Math.max(0, normal.getZ(j));
      colors.push(.48 + .5*t, .70 + .28*t, .94 + .06*t);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const capacity = Math.floor(6 * 2 * size * (size + 1) / length);
    const mesh = new THREE.InstancedMesh(geo, plastic, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.count = 0;
    group.add(mesh);
    return mesh;
  });

  const shellHalf = h + RADIUS * 2 + .045;
  const outer = shellHalf * 2;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xc8e5ff, transparent: true, opacity: .072, roughness: .1, metalness: .12,
    clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: .9, depthWrite: false,
  });
  const shell = new THREE.Mesh(new RoundedBoxGeometry(outer, outer, outer, 3, .12), glass);
  shell.renderOrder = 4;
  group.add(shell);

  // Clear rails with two fine polished edges catch light around the acrylic case.
  const rails = [], outlines = [], bosses = [];
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0xa0bdcf, roughness: .16,
    metalness: .40, transparent: true, opacity: .52, depthWrite: false, clearcoat: 1 });
  for (let axis = 0; axis < 3; axis++) {
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const A = (axis + 1) % 3, B = (axis + 2) % 3;
      const dims = [.115, .115, .115]; dims[axis] = outer - .18;
      const pos = [0, 0, 0]; pos[A] = a * (shellHalf - .065); pos[B] = b * (shellHalf - .065);
      rails.push(new RoundedBoxGeometry(...dims, 2, .042).translate(...pos));
      for (const offset of [-.039, .04]) {
        const p1 = pos.slice(), p2 = pos.slice();
        p1[axis] = -shellHalf + .14; p2[axis] = shellHalf - .14;
        p1[A] += a * offset; p2[A] += a * offset;
        p1[B] += b * .043; p2[B] += b * .043;
        outlines.push(...p1, ...p2);
      }
    }
  }
  // The six molded lips form the case's recessed clear panels.
  const lipShape = new THREE.Shape(), hole = new THREE.Path();
  function roundedSquare(path, half, radius) {
    const k = half - radius;
    path.moveTo(-k, -half); path.lineTo(k, -half);
    path.quadraticCurveTo(half, -half, half, -k); path.lineTo(half, k);
    path.quadraticCurveTo(half, half, k, half); path.lineTo(-k, half);
    path.quadraticCurveTo(-half, half, -half, k); path.lineTo(-half, -k);
    path.quadraticCurveTo(-half, -half, -k, -half);
  }
  roundedSquare(lipShape, shellHalf - .035, .12);
  roundedSquare(hole, shellHalf - .22, .13);
  lipShape.holes.push(hole);
  const lips = [];
  for (let f = 0; f < 6; f++) {
    const lip = new THREE.ExtrudeGeometry(lipShape, { depth: .035, bevelSize: .015, bevelThickness: .015, bevelSegments: 2, curveSegments: 5 });
    lips.push(surfaceGeometry(lip, f, h, h, size, shellHalf - h - .07));
  }
  const trim = combine(group, lips, new THREE.MeshPhysicalMaterial({
    color: 0x9db9d0, roughness: .13, metalness: .4, transparent: true, opacity: .29, depthWrite: false, clearcoat: 1
  }));
  trim.renderOrder = 5;
  const frame = combine(group, rails, frameMat);
  frame.renderOrder = 5;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(outlines, 3)),
    new THREE.LineBasicMaterial({ color: 0xe3f5ff, transparent: true, opacity: .52, depthWrite: false }));
  lines.renderOrder = 6;
  group.add(lines);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xb5c3d2, metalness: .9, roughness: .27 });
  for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [-1, 1]) {
    const p = new THREE.Vector3(x, y, z).multiplyScalar(shellHalf - .14);
    bosses.push(new RoundedBoxGeometry(.27, .27, .27, 2, .075).translate(p.x, p.y, p.z));
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(.068, .066, .032, 14), pinMat);
    rivet.position.copy(p); rivet.position.y = y * (shellHalf - .012);
    group.add(rivet);
  }
  const corners = combine(group, bosses, frameMat);
  corners.renderOrder = 5;

  const goal = new THREE.Group();
  group.add(goal);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc1ff63, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.29, .049, 12, 56), ringMat);
  const socket = new THREE.Mesh(new THREE.CircleGeometry(.294, 52),
    new THREE.MeshStandardMaterial({ color: 0x244936, metalness: .28, roughness: .41 }));
  const bullseye = new THREE.Mesh(new THREE.CircleGeometry(.068, 24),ringMat);
  ring.position.z = .028; socket.position.z = .019; bullseye.position.z = .022;
  goal.add(ring, socket, bullseye);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  const hc = haloCanvas.getContext('2d');
  const grad = hc.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'#adff480a'); grad.addColorStop(.5,'#b6ff5e35');
  grad.addColorStop(.65,'#b6ff5e75'); grad.addColorStop(.77,'#b6ff5e44'); grad.addColorStop(1,'#b6ff5e00');
  hc.fillStyle = grad; hc.fillRect(0,0,128,128);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(.96,.96),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent:true, depthWrite:false, toneMapped:false }));
  halo.position.z = .012;
  goal.add(halo);

  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 40, 28),
    new THREE.MeshStandardMaterial({ color: 0xf0f5ff, metalness: .98, roughness: .135, envMapIntensity: 1.15 }));
  ballMesh.castShadow = true;
  group.add(ballMesh);
  const turn = new THREE.Matrix4().makeRotationZ(Math.PI/2);
  function layout(maze) {
    for (const mesh of molds) mesh.count = 0;
    for (let f = 0; f < FACES.length; f++) {
      const runs = wallRuns(maze.walls[f]);
      floors[f].map?.dispose();
      floors[f].map = floorTexture(maze, f, runs);
      for (const [x1, y1, x2, y2] of runs) {
        const length = (x2-x1) + (y2-y1);
        const mesh = molds[length - 1];
        const pose = basisMatrix(FACES[f]);
        if (y1 !== y2) pose.multiply(turn);
        pose.setPosition(facePoint(f, (x1+x2)/2, (y1+y2)/2, size, WALL_HEIGHT/2));
        mesh.setMatrixAt(mesh.count++, pose);
      }
    }
    for (const mesh of molds) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.addUpdateRange(0, mesh.count*16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    const g = maze.goal;
    goal.quaternion.setFromRotationMatrix(basisMatrix(FACES[g.face]));
    goal.position.copy(facePoint(g.face, g.x+.5, g.y+.5, size));
  }
  return { size, group, ballMesh, layout };
}

function disposeGroup(root) {
  const materials = new Set();
  root.traverse(obj => {
    if (obj.isInstancedMesh) obj.dispose();
    obj.geometry?.dispose();
    if (obj.material) materials.add(obj.material);
  });
  for (const material of materials) { material.map?.dispose(); material.dispose(); }
}

export function createView(host) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, .1, 160);
  const orientation = new THREE.Quaternion();
  const azimuthStart = .66, elevationStart = .57;
  let azimuth = azimuthStart, elevation = elevationStart, zoom = 1;
  let width = 1, height = 1, maze, model, renderer, fallback, dirty = true;
  const canvas = document.createElement('canvas');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    // Keep the game playable when a browser or remote desktop disables WebGL.
    fallback = new FlatView();
  }
  host.appendChild(renderer ? canvas : fallback.canvas);
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = new RoomEnvironment();
    // Dark studio flags give the chrome ball a clear reflection band.
    for (const position of [[0, 0, 7], [7, 1, -2]]) {
      const flag = new THREE.Mesh(new THREE.BoxGeometry(12, 4, .4), new THREE.MeshBasicMaterial({ color: 0x101820 }));
      flag.position.set(...position);
      flag.lookAt(0, position[1], 0);
      studio.add(flag);
    }
    const reflection = pmrem.fromScene(studio, .025);
    scene.environment = reflection.texture;
    scene.environmentIntensity = .63;
    studio.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xd9ebff, 0x3b5a80, .62));
    const key = new THREE.DirectionalLight(0xffffff, 2.55);
    key.position.set(-8, 18, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left:-12, right:12, top:12, bottom:-12, near:.5, far:48 });
    key.shadow.normalBias = .014; key.shadow.bias = -.00015;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb6ddff, .95);
    rim.position.set(5, 4, -6); scene.add(rim);
  }
  function updateCamera() {
    const fit = Math.max(1, .90 * height / width, height / Math.max(100, height - 112) * .95);
    const dist = ((maze?.size ?? 12) + 1.33) * 4.30 * fit / zoom;
    camera.near = Math.max(.1,dist - (maze?.size ?? 12) * 2);
    camera.far = dist + (maze?.size ?? 12) * 2;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(azimuth)*Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth)*Math.cos(elevation)).multiplyScalar(dist);
    camera.lookAt(0,-.035 * (maze?.size ?? 12),0);
    camera.updateMatrixWorld();
    dirty = true;
  }
  function sizeCanvas() {
    const bounds = host.getBoundingClientRect();
    width = Math.max(1,bounds.width); height = Math.max(1,bounds.height);
    if (renderer) renderer.setSize(width, height, false);
    else fallback.resize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCamera();
  }
  sizeCanvas();
  new ResizeObserver(sizeCanvas).observe(host);
  let prevPos = new THREE.Vector3(Infinity,Infinity,Infinity);
  const right = new THREE.Vector3(), horizontal = new THREE.Vector3(), axis = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  return {
    orientation,
    load(next) {
      maze = next;
      if (!renderer) return;
      if (model?.size !== maze.size) {
        if (model) { scene.remove(model.group); disposeGroup(model.group); }
        model = makeToy(maze.size);
        scene.add(model.group);
      }
      model.layout(maze);
    },
    reset() {
      orientation.identity(); azimuth = azimuthStart; elevation = elevationStart;
      this.setZoom(1); dirty = true;
    },
    tilt(dx, dy) {
      // Both screen directions tilt about horizontal axes, even when the camera
      // looks straight at a side. A horizontal drag therefore changes gravity.
      right.set(Math.cos(azimuth), 0, -Math.sin(azimuth));
      horizontal.set(Math.sin(azimuth), 0, Math.cos(azimuth));
      axis.copy(right).multiplyScalar(dy).addScaledVector(horizontal,-dx);
      const angle = axis.length();
      if (angle) orientation.premultiply(rotation.setFromAxisAngle(axis.normalize(), angle)).normalize();
      dirty = true;
    },
    orbit(dx, dy) {
      azimuth -= dx; elevation = THREE.MathUtils.clamp(elevation+dy, -1.49,1.49);
      updateCamera();
    },
    getZoom() { return zoom; },
    setZoom(value) { zoom = THREE.MathUtils.clamp(value,.65,1.6); updateCamera(); },
    render(ball) {
      const p = ballPosition(ball, maze.size);
      if (!dirty && p.distanceToSquared(prevPos) < 1e-12) return;
      if (renderer) {
        model.group.quaternion.copy(orientation); model.ballMesh.position.copy(p);
        renderer.render(scene,camera);
      } else { fallback.render(maze, ball, orientation, camera); }
      prevPos.copy(p); dirty = false;
    },
  };
}

// A projected canvas view uses the same face bases, camera and physics when
// WebGL2 is unavailable. Far-to-near sorting keeps the solid toy readable.
class FlatView {
  constructor() { this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d'); }
  resize(w,h) {
    const dpr = Math.min(devicePixelRatio, 2);
    this.w=w; this.h=h; this.canvas.width=w*dpr; this.canvas.height=h*dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  render(maze, ball, q, cam) {
    const ctx=this.ctx, w=this.w, h=this.h, size=maze.size, layers=[];
    ctx.clearRect(0,0,w,h);
    const project = p => {
      const world=p.clone().applyQuaternion(q), uv=world.clone().project(cam);
      return [(.5+uv.x/2)*w,(.5-uv.y/2)*h,world.distanceToSquared(cam.position)];
    };
    const path = (pts, color, stroke) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0],p[1]);
      ctx.closePath();
      if (color) { ctx.fillStyle=color; ctx.fill(); }
      if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=.8; ctx.stroke(); }
    };
    const light = new THREE.Vector3(-.4,.9,.55).normalize();
    const paint = (base, normal, bias) => {
      const strength = bias + .32 * Math.max(0, normal.clone().applyQuaternion(q).dot(light));
      return 'rgb('+base.map(c=>Math.round(c*strength)).join(',')+')';
    };
    for (let f=0; f<6; f++) {
      const F=FACES[f], n=F.n.clone().applyQuaternion(q);
      if (n.dot(cam.position) < size/2) continue;
      const P=(x,y,z)=>project(facePoint(f,x,y,size,z));
      const faces=[];
      const floor=[P(0,0,0),P(size,0,0),P(size,size,0),P(0,size,0)];
      const depth = floor.reduce((s,p)=>s+p[2],0)/4;
      const put=(points,color,stroke)=>faces.push({depth:points.reduce((s,p)=>s+p[2],0)/points.length, draw:()=>path(points,color,stroke)});
      for (const [x1,y1,x2,y2] of wallRuns(maze.walls[f])) {
        const t=WALL_WIDTH/2;
        const corners=[[x1-t,y1-t],[x2+t,y1-t],[x2+t,y2+t],[x1-t,y2+t]];
        const low=corners.map(([x,y])=>P(x,y,0)), high=corners.map(([x,y])=>P(x,y,WALL_HEIGHT));
        for (let i=0;i<4;i++) {
          const j=(i+1)%4, side=[F.v.clone().negate(),F.u,F.v,F.u.clone().negate()][i];
          if (side.clone().applyQuaternion(q).dot(cam.position)>0) put([low[i],low[j],high[j],high[i]],paint([58,134,211],side,.74));
        }
        put(high,paint([108,178,246],F.n,.9),'#a7d5fb70');
      }
      const ring=maze.goal;
      const drawFloor=()=>{
        path(floor,paint([35,111,184],F.n,.82));
        if (ring.face === f) {
          const loop=r=>Array.from({length:48},(_,i)=>P(ring.x+.5+r*Math.cos(i*Math.PI/24), ring.y+.5+r*Math.sin(i*Math.PI/24),.022));
          ctx.shadowColor='#baff52';ctx.shadowBlur=5; path(loop(.34),'#beff6e');ctx.shadowBlur=0;path(loop(.24),paint([42,113,173],F.n,.87));
        }
      };
      if (ball.face===f) {
        const bp=ballPosition(ball,size), p=project(bp);
        const right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
        const pr=project(bp.clone().add(right.applyQuaternion(q.clone().invert()).multiplyScalar(RADIUS)));
        const r=Math.max(2,Math.hypot(pr[0]-p[0],pr[1]-p[1]));
        faces.push({depth:p[2],draw:()=>{
          const grad=ctx.createRadialGradient(p[0]-r*.28,p[1]-r*.48,r*.04,p[0],p[1],r);
          for(const [t,c] of [[0,'#fff'],[.23,'#eaf6ff'],[.45,'#a3b7cc'],[.59,'#5b6b80'],[.74,'#364656'],[.9,'#c7dae9'],[1,'#627a8b']]) grad.addColorStop(t,c);
          ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p[0],p[1],r,0,2*Math.PI);ctx.fill();
        }});
      }
      layers.push({depth, draw:()=>{drawFloor(); faces.sort((a,b)=>b.depth-a.depth).forEach(s=>s.draw());}});
    }
    layers.sort((a,b)=>b.depth-a.depth).forEach(s=>s.draw());
    const half=size/2+RADIUS*2+.045;
    for (let f=0; f<6; f++) {
      if (FACES[f].n.clone().applyQuaternion(q).dot(cam.position) < half) continue;
      const corners=[[0,0],[2*half,0],[2*half,2*half],[0,2*half]].map(([x,y])=>project(facePoint(f,x,y,half*2)));
      path(corners,'#b2ddff09','#d2e9ffaa');
    }
  }
}
