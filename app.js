(() => {
"use strict";
/* ============ Mannequin rig ============
   World units, y up, floor at y=0. Legs/torso angles are measured from straight UP
   (positive tips forward, toward +x). Arm angles are measured from straight DOWN
   (positive swings forward). The near-side ankle is the root. */
const L = {shin:44, thigh:46, torso:58, neck:7, head:10, ua:30, fa:28};
const R = Math.PI/180;
const up = a => [Math.sin(a*R), Math.cos(a*R)];
const dn = a => [Math.sin(a*R), -Math.cos(a*R)];
const add = (p,v,k=1) => [p[0]+v[0]*k, p[1]+v[1]*k];
const sub = (a,b) => [a[0]-b[0], a[1]-b[1]];
const len = v => Math.hypot(v[0], v[1]);
const unit = v => { const l = len(v)||1; return [v[0]/l, v[1]/l]; };
function ik(S, T, l1, l2, sign){
  let d = sub(T,S), dist = len(d);
  const max = l1+l2-0.01; if (dist > max) dist = max; if (dist < 1) dist = 1;
  const u = unit(d);
  const a = (l1*l1 - l2*l2 + dist*dist)/(2*dist);
  const h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const mid = add(S,u,a);
  const joint = add(mid, [-u[1], u[0]], h*sign);
  const end = add(S,u,dist);
  return [joint, end];
}
function solve(p){
  const ank = [p.rx, p.ay];
  const knee = add(ank, up(p.s), L.shin);
  const hip = add(knee, up(p.t), L.thigh);
  const td = up(p.b);
  const sh = add(hip, td, L.torso);
  const neckTop = add(sh, td, L.neck);
  const head = add(sh, td, L.neck + L.head);
  const [knee2, ank2] = ik(hip, p.ff, L.thigh, L.shin, 1);
  const arm = (A) => {
    if (A.t) { const [e,h] = ik(sh, A.t, L.ua, L.fa, A.k ?? -1); return [e,h]; }
    const e = add(sh, dn(A.u), L.ua); return [e, add(e, dn(A.l), L.fa)];
  };
  const [el, ha] = arm(p.na), [el2, ha2] = arm(p.fa);
  return {ank, knee, hip, sh, neckTop, head, td, knee2, ank2, el, ha, el2, ha2};
}
function normalize(k){
  const p = Object.assign({s:0,t:0,b:0,rx:0,ay:0,fv:[13,0],bell:'none',back:false}, k);
  if (!p.ff) p.ff = [p.rx, p.ay];
  if (!p.ffv) p.ffv = p.fv.slice();
  if (!p.na) p.na = {u:0,l:0};
  if (!p.fa) p.fa = JSON.parse(JSON.stringify(p.na));
  return p;
}
function lerp(A,B,x){
  if (typeof A === 'number') return A + (B-A)*x;
  if (Array.isArray(A)) return A.map((v,i)=>lerp(v,B[i],x));
  if (A && typeof A === 'object'){ const o={}; for (const k in A) o[k] = (k in B) ? lerp(A[k],B[k],x) : A[k]; return o; }
  return x < 0.5 ? A : B;
}
const ease = x => (1-Math.cos(Math.PI*x))/2;

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

class Mannequin{
  constructor(host, label){
    const svg = el('svg', {viewBox:'-135 -22 270 262', class:'mq', role:'img', 'aria-label': label||'Mannequin demonstrating the move'});
    const g = el('g', {transform:'translate(0 218) scale(1 -1)'}, svg);
    el('line', {x1:-135,y1:0,x2:135,y2:0,class:'floor'}, g);
    this.shadow = el('ellipse', {cx:0,cy:-1,rx:40,ry:3.5,class:'shadow'}, g);
    const line = (cls, w) => el('line', {class:cls, 'stroke-width':w}, g);
    this.bellBack = el('g', {}, g);
    this.fU = line('far',9); this.fL = line('far',8);
    this.fT = line('far',12); this.fS = line('far',10); this.fF = line('far',6);
    this.abd = line('near',15); this.chest = line('near',23);
    this.neck = line('near',6);
    this.headC = el('circle', {r:L.head, class:'body'}, g);
    this.nose = el('circle', {r:3.2, class:'body'}, g);
    this.pelvis = el('circle', {r:9, class:'body'}, g);
    this.nT = line('near',12); this.nS = line('near',10); this.nF = line('near',6);
    this.jK = el('circle',{r:3.4,class:'jt'},g); this.jA = el('circle',{r:2.6,class:'jt'},g); this.jH = el('circle',{r:3.4,class:'jt'},g);
    this.bellFront = el('g', {}, g);
    this.bell = el('g', {}, this.bellFront);
    el('circle', {cx:0, cy:0, r:10.5, class:'bellb'}, this.bell);
    el('path', {d:'M-6.5 7 L-7 13.5 Q0 19.5 7 13.5 L6.5 7', class:'bellh'}, this.bell);
    el('path', {d:'M-6 -3 Q-6.5 3 -3 6.5', class:'bellhi'}, this.bell);
    this.nU = line('near',9); this.nL = line('near',8);
    this.jE = el('circle',{r:3,class:'jt'},g); this.jS = el('circle',{r:3.4,class:'jt'},g);
    this.hand = el('circle',{r:4,class:'body'},g);
    this.hand2 = el('circle',{r:3.6,class:'body'},g);
    this.hand2.style.fill = 'var(--wood-far)';
    g.insertBefore(this.hand2, this.fT);
    host.appendChild(svg);
    this.svg = svg; this.ex = null; this.t0 = performance.now(); this.speed = 1;
  }
  set(ex, speed=1){ if (this.ex !== ex){ this.ex = ex; this.t0 = performance.now(); } this.speed = speed; }
  frame(now){
    const ex = this.ex; if (!ex) return;
    const K = ex.nk, n = K.length;
    let p;
    if (n === 1 || reduceMotion) p = K[0];
    else {
      const cyc = ((now - this.t0)/1000*this.speed / ex.tempo) % 1;
      const pos = cyc * n; const i = Math.floor(pos) % n; const x = ease(pos - Math.floor(pos));
      p = lerp(K[i], K[(i+1)%n], x);
    }
    this.draw(p, n===1 ? K[0] : null);
  }
  draw(p){
    const J = solve(p);
    const L2 = (e,a,b) => { e.setAttribute('x1',a[0].toFixed(1)); e.setAttribute('y1',a[1].toFixed(1)); e.setAttribute('x2',b[0].toFixed(1)); e.setAttribute('y2',b[1].toFixed(1)); };
    const C = (e,a) => { e.setAttribute('cx',a[0].toFixed(1)); e.setAttribute('cy',a[1].toFixed(1)); };
    L2(this.fU, J.sh, J.el2); L2(this.fL, J.el2, J.ha2); C(this.hand2, J.ha2);
    L2(this.fT, J.hip, J.knee2); L2(this.fS, J.knee2, J.ank2); L2(this.fF, J.ank2, add(J.ank2, p.ffv));
    L2(this.abd, J.hip, add(J.hip, J.td, L.torso*0.5));
    L2(this.chest, add(J.hip, J.td, L.torso*0.52), add(J.hip, J.td, L.torso*0.9));
    L2(this.neck, J.sh, J.neckTop);
    C(this.headC, J.head); C(this.pelvis, J.hip);
    const fwd = [J.td[1], -J.td[0]];
    C(this.nose, add(add(J.head, fwd, 8), J.td, -1));
    L2(this.nT, J.hip, J.knee); L2(this.nS, J.knee, J.ank); L2(this.nF, J.ank, add(J.ank, p.fv));
    C(this.jK, J.knee); C(this.jA, J.ank); C(this.jH, J.hip);
    L2(this.nU, J.sh, J.el); L2(this.nL, J.el, J.ha); C(this.jE, J.el); C(this.jS, J.sh); C(this.hand, J.ha);
    this.shadow.setAttribute('cx', ((J.ank[0]+J.hip[0]+J.sh[0])/3).toFixed(1));
    // kettlebell
    const bi = bellInfo(p, J);
    if (!bi){ this.bell.style.display = 'none'; return; }
    this.bell.style.display = '';
    const c = bi.c, upv = bi.upv;
    const ang = Math.atan2(upv[1], upv[0])/R - 90;
    this.bell.setAttribute('transform', `translate(${c[0].toFixed(1)} ${c[1].toFixed(1)}) rotate(${ang.toFixed(1)})`);
    const want = p.back ? this.bellBack : this.bellFront;
    if (this.bell.parentNode !== want) want.appendChild(this.bell);
  }
}
function bellInfo(p, J){
  const b = p.bell; if (b === 'none') return null;
  const hand = J.ha, fd = unit(sub(J.ha, J.el));
  let c;
  if (b === 'hang') c = add(hand, [0.5,-13]);
  else if (b === 'along') c = add(hand, fd, 14);
  else if (b === 'rack') c = add(add(hand, fd, -10), [5, 0]);
  else if (b === 'hip') c = add(J.hip, [3, 16]);
  else c = [p.bx ?? 20, 10.5];
  let upv = (b === 'hip' || b === 'floor') ? [0,1] : unit(sub(hand, c));
  if (b === 'rack') upv = fd;
  return {c, upv};
}
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============ Exercises ============ */
const goblet = {u:8, l:130};
const lie = {rx:25, s:15.3, t:-133, b:-90};
const EX = {
  swing:{name:'Two-Hand Swing', tag:'Hinge · power', tempo:1.7, keys:[
      {s:14,t:-58,b:62, na:{u:-25,l:-30}, bell:'along'},
      {s:0,t:0,b:-4, na:{u:92,l:92}, bell:'along'}],
    cues:['Hike the bell back high between your thighs','Snap the hips forward — arms just guide it','Bell floats to chest height, glutes squeezed, ribs down']},
  deadlift:{name:'Kettlebell Deadlift', tag:'Hinge · strength', tempo:3.2, keys:[
      {na:{u:0,l:0}, bell:'hang'},
      {s:20,t:-60,b:78, na:{u:-18,l:-18}, bell:'hang'}],
    cues:['Bell between your feet, push hips back first','Flat back, chest proud, slight knee bend','Stand tall by driving through your heels']},
  goblet:{name:'Goblet Squat', tag:'Legs', tempo:3.2, keys:[
      {na:goblet, bell:'hang'},
      {s:38,t:-80,b:30, na:{u:25,l:160}, bell:'hang'}],
    cues:['Hold the bell by the horns at your chest','Sit between your heels, elbows inside knees','Keep chest up and heels planted']},
  lunge:{name:'Goblet Reverse Lunge', tag:'Legs · single side', tempo:3.4, sided:true, keys:[
      {na:goblet, bell:'hang'},
      {s:8,t:-80,b:4, ff:[-74,8], ffv:[7,-8], na:goblet, bell:'hang'}],
    cues:['Step back and lower the back knee toward the floor','Front shin stays near vertical','Push through the front heel to return; switch legs halfway']},
  row:{name:'Bent-Over Row', tag:'Back · single arm', tempo:2.4, sided:true, keys:[
      {s:15,t:-45,b:72, na:{u:-4,l:-4}, fa:{t:[22,52]}, bell:'hang'},
      {s:15,t:-45,b:72, na:{u:-72,l:-6}, fa:{t:[22,52]}, bell:'hang'}],
    cues:['Brace a hand on your thigh, back flat','Pull the elbow back toward your hip','Lower under control; switch arms halfway']},
  press:{name:'Overhead Press', tag:'Shoulders · single arm', tempo:2.8, sided:true, keys:[
      {na:{u:15,l:170}, fa:{u:3,l:3}, bell:'rack'},
      {na:{u:176,l:178}, fa:{u:3,l:3}, bell:'rack'}],
    cues:['Start in the rack: bell resting on your forearm','Squeeze glutes and press straight up by your ear','Lock out, then lower back to the rack; switch halfway']},
  thruster:{name:'Squat to Press', tag:'Full body', tempo:3.6, keys:[
      {na:{u:12,l:160}, bell:'rack'},
      {s:36,t:-78,b:28, na:{u:30,l:170}, bell:'rack'},
      {na:{u:176,l:178}, bell:'rack'}],
    cues:['Hold the bell in both hands at the chest','Squat down, then drive up fast','Use the leg drive to press overhead']},
  highpull:{name:'Sumo High Pull', tag:'Upper back · power', tempo:2.2, keys:[
      {s:20,t:-45,b:40, na:{u:0,l:0}, bell:'hang'},
      {s:0,t:0,b:-3, na:{u:100,l:-45}, bell:'hang'}],
    cues:['Wide stance, bell between feet','Stand up hard and pull elbows high and wide','Bell stays close to your body']},
  pushup:{name:'Push-Up', tag:'Chest · bodyweight', tempo:2.4, keys:[
      {rx:-72,ay:6,fv:[4,-6],s:68,t:68,b:68, na:{t:[64,2]}},
      {rx:-72,ay:6,fv:[4,-6],s:82,t:82,b:82, na:{t:[64,2]}}],
    cues:['Hands under shoulders, body in one line','Elbows angle back about 45°','Drop to knees if form breaks down']},
  floorpress:{name:'Floor Press', tag:'Chest · single arm', tempo:2.6, sided:true, keys:[
      {...lie, na:{u:86,l:180}, fa:{u:84,l:84}, bell:'rack'},
      {...lie, na:{u:180,l:180}, fa:{u:84,l:84}, bell:'rack'}],
    cues:['Lie on your back, knees bent','Upper arm rests on the floor at the bottom','Press straight up over your shoulder; switch halfway']},
  bridge:{name:'Weighted Glute Bridge', tag:'Glutes', tempo:2.6, keys:[
      {...lie, na:{u:84,l:84}, bell:'hip'},
      {rx:25, s:27,t:-105.7,b:-105.7, na:{u:84,l:84}, bell:'hip'}],
    cues:['Rest the bell on your hips, hold it steady','Drive through heels, lift hips to a straight line','Pause and squeeze at the top']},
  pullover:{name:'Lying Pullover', tag:'Lats · core', tempo:3.2, keys:[
      {...lie, na:{u:176,l:176}, bell:'along'},
      {...lie, na:{u:258,l:258}, bell:'along'}],
    cues:['Hold the bell by the horns over your chest','Lower it slowly behind your head, arms long','Keep your low back pressed to the floor']},
  plank:{name:'Forearm Plank', tag:'Core · hold', tempo:4, keys:[
      {rx:-72,ay:6,fv:[4,-6],s:79,t:79,b:79, na:{u:0,l:90}},
      {rx:-72,ay:6,fv:[4,-6],s:78.2,t:78.2,b:78.8, na:{u:0,l:90}}],
    cues:['Elbows under shoulders','Squeeze glutes and brace like bracing for a punch','Breathe — do not let hips sag']},
  curl:{name:'Horn Curl', tag:'Biceps', tempo:2.6, keys:[
      {na:{u:0,l:0}, bell:'hang'},
      {na:{u:8,l:150}, bell:'hang'}],
    cues:['Hold the horns, elbows pinned to your sides','Curl up without swinging your back','Lower slowly for three counts']},
  tricep:{name:'Overhead Extension', tag:'Triceps', tempo:2.8, keys:[
      {na:{u:168,l:325}, bell:'along', back:true},
      {na:{u:170,l:172}, bell:'along'}],
    cues:['Hold the bell by the horns overhead','Lower it behind your head, elbows pointing up','Extend to the top, ribs stay down']},
  // warm-up and cool-down (bodyweight)
  bwsquat:{name:'Bodyweight Squat', tag:'Warm-up', tempo:2.6, keys:[
      {na:{u:80,l:85}},
      {s:38,t:-80,b:30, na:{u:95,l:95}}],
    cues:['Arms forward for balance','Sit back and down, easy depth','Smooth and controlled']},
  hinge:{name:'Good Morning', tag:'Warm-up', tempo:2.8, keys:[
      {na:{u:20,l:160}},
      {s:10,t:-30,b:75, na:{u:95,l:-100}}],
    cues:['Hands across your chest','Push hips back with soft knees','Feel the stretch in your hamstrings']},
  armswing:{name:'Arm Raises', tag:'Warm-up', tempo:2.4, keys:[
      {na:{u:0,l:0}},
      {na:{u:178,l:178}}],
    cues:['Raise both arms overhead','Reach tall, then lower','Loosen the shoulders']},
  hipstretch:{name:'Hip Flexor Stretch', tag:'Cool-down', tempo:5, keys:[
      {s:8,t:-80,b:4, ff:[-74,8], ffv:[7,-8], na:{u:20,l:20}},
      {s:12,t:-78,b:2, ff:[-74,8], ffv:[7,-8], na:{u:20,l:20}}],
    cues:['Back knee down, tuck your hips under','Lean gently forward','Switch legs halfway']},
  fold:{name:'Forward Fold', tag:'Cool-down', tempo:5, keys:[
      {s:8,t:-18,b:118, na:{u:-20,l:-20}},
      {s:8,t:-18,b:122, na:{u:-22,l:-22}}],
    cues:['Soft knees, let your head hang','Breathe slowly','Roll up one vertebra at a time']}
};
for (const id in EX){ EX[id].id = id; EX[id].nk = EX[id].keys.map(normalize); }
EX.hipstretch.sided = true;

/* ============ 3D coach ============
   The 2D rig above is solved in the body's side plane; here each joint gets a
   sideways (z) position so the figure becomes a full 3D body. Near side = right = +z. */
// [right elbow z, right hand z, left elbow z, left hand z, grip]
const ZC = {
  swing:[12,4.5,-12,-4.5,'two'], deadlift:[14,5,-14,-5,'two'], goblet:[13,5,-13,-5,'two'], lunge:[13,5,-13,-5,'two'],
  row:[17,15,-15,-11,'one'], press:[19,15,-17,-17,'one'], thruster:[13,5,-13,-5,'two'], highpull:[24,5,-24,-5,'two'],
  pushup:[23,20,-23,-20], floorpress:[19,15,-19,-20,'one'], bridge:[19,21,-19,-21], pullover:[10,5,-10,-5,'two'],
  plank:[14,11,-14,-11], curl:[15,5,-15,-5,'two'], tricep:[10,4.5,-10,-4.5,'two'], bwsquat:[16,13,-16,-13],
  hinge:[17,-5,-17,5], armswing:[18,18,-18,-18], hipstretch:[18,17,-18,-17], fold:[15,9,-15,-9]
};
const SKINS = ['#F1CBA8','#D9A47C','#B07A55','#8A5A3B','#5E3C28'];
const STYLES = {
  athlete:{label:'Athlete', dot:'#2F6DAA'},
  mannequin:{label:'Wood mannequin', dot:'#C89865'},
  robot:{label:'Robot', dot:'#A9B2BC'},
  dummy:{label:'Crash dummy', dot:'#E8B81E'}
};
function styleRoles(id, skin){
  const S = skin || SKINS[2];
  const base = (c, o={}) => Object.assign({c, m:0, r:.62, e:null}, o);
  if (id === 'mannequin'){
    const w = base('#C89865', {r:.5}), j = base('#8A5E36', {r:.45});
    return {head:w, neck:w, chest:w, abd:w, pelvis:w, thigh:w, shin:w, foot:w, upper:w, fore:w, hand:w,
      jHip:j, jKnee:j, jAnkle:j, jSh:j, jEl:j, vis:{}};
  }
  if (id === 'robot'){
    const m = base('#B9C1CA', {m:.35, r:.32}), d = base('#6B747D', {m:.35, r:.38}), g = base('#F0BD22', {e:'#F0BD22', r:.4});
    return {head:base('#D5DBE1',{m:.35,r:.28}), neck:d, chest:d, abd:m, pelvis:d, thigh:m, shin:m, foot:d, upper:m, fore:m, hand:d,
      jHip:g, jKnee:g, jAnkle:g, jSh:g, jEl:g, visor:base('#5FD3FF',{e:'#3FC4FF'}), vis:{visor:1}};
  }
  if (id === 'dummy'){
    const y = base('#E8B81E', {r:.5}), k = base('#1E2227', {r:.5});
    return {head:y, neck:k, chest:y, abd:k, pelvis:y, thigh:y, shin:y, foot:k, upper:y, fore:y, hand:k,
      jHip:k, jKnee:k, jAnkle:k, jSh:k, jEl:k, marker:base('#ffffff'), vis:{marker:1}};
  }
  const sk = base(S, {r:.55}), shirt = base('#2F6DAA', {r:.8}), shorts = base('#23272C', {r:.85});
  return {head:sk, neck:sk, chest:shirt, abd:shirt, pelvis:shorts, thigh:shorts, shin:sk, foot:base('#ECEDEF',{r:.6}),
    upper:sk, fore:sk, hand:sk, jHip:shorts, jKnee:sk, jAnkle:base('#FAFAFA',{r:.9}), jSh:shirt, jEl:sk,
    hair:base('#2A1D15',{r:.9}), eye:base('#15181B',{r:.3}), vis:{hair:1, eye:1, nose:1}};
}
const GL_OK = (() => { try { const c = document.createElement('canvas'); return !!(window.THREE && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch(e){ return false; } })();
let G = null;
function initGL(){
  if (G) return G;
  const T = THREE;
  const renderer = new T.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(1); renderer.setSize(900, 900, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x8f8272, 0.8));
  const key = new T.DirectionalLight(0xffffff, 0.95);
  key.position.set(140, 300, 200); key.castShadow = true; key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera, {left:-190, right:190, top:190, bottom:-190, near:20, far:900});
  key.shadow.bias = -0.0004; key.shadow.normalBias = 1.2; key.shadow.radius = 4;
  scene.add(key); scene.add(key.target);
  const rim = new T.DirectionalLight(0xcfdcff, 0.4); rim.position.set(-220, 140, -180); scene.add(rim);
  const floorMat = new T.MeshStandardMaterial({color:0xbbbbbb, roughness:1, transparent:true, opacity:.6});
  const floor = new T.Mesh(new T.CircleGeometry(160, 72), floorMat);
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  const camera = new T.PerspectiveCamera(30, 1, 10, 3000);
  const fig = buildFigure(T, scene);
  G = {T, renderer, scene, camera, fig, floorMat, key, w:900, h:900, style:null};
  syncFloor();
  return G;
}
function syncFloor(){ if (!G) return; const c = getComputedStyle(document.documentElement).getPropertyValue('--floor').trim(); if (c) G.floorMat.color.set(c); }
function buildFigure(T, scene){
  const root = new T.Group(); root.position.y = 2.5; scene.add(root);
  const taper = new T.CylinderGeometry(1, 0.74, 1, 22);
  const cyl = new T.CylinderGeometry(1, 1, 1, 18);
  const sph = new T.SphereGeometry(1, 28, 18);
  const box = new T.BoxGeometry(1, 1, 1);
  const mats = {}; const M = r => mats[r] || (mats[r] = new T.MeshStandardMaterial({color:0xffffff}));
  const P = {};
  const mk = (name, geo, role, parent=root) => { const m = new T.Mesh(geo, M(role)); m.castShadow = true; m.receiveShadow = true; parent.add(m); P[name] = m; return m; };
  const torso = new T.Group(); root.add(torso); P.torso = torso;
  mk('pelvis', sph, 'pelvis', torso).scale.set(10, 9.5, 14);
  const prof = [[0,3],[8.5,4],[10.2,8],[9.6,16],[9.2,22],[10.4,30],[12,38],[12.6,45],[11.8,51],[9,55.5],[5,57.5],[0,58]].map(([r,y]) => new T.Vector2(r, y));
  const chest = mk('chest', new T.LatheGeometry(prof, 36), 'chest', torso); chest.scale.set(0.82, 1, 1.32);
  const abd = mk('abd', sph, 'abd', torso); abd.scale.set(7.6, 10, 11.5); abd.position.y = 14;
  mk('neck', cyl, 'neck');
  const head = new T.Group(); root.add(head); P.headG = head;
  mk('head', sph, 'head', head).scale.set(9.6, 11, 8.8);
  const hair = mk('hair', new T.SphereGeometry(1, 28, 14, 0, Math.PI*2, 0, 1.3), 'hair', head); hair.scale.set(10.4, 11.8, 9.6); hair.rotation.z = 0.32;
  const e1 = mk('eyeR', sph, 'eye', head); e1.scale.setScalar(1.15); e1.position.set(8.3, 2.2, 3.3);
  const e2 = mk('eyeL', sph, 'eye', head); e2.scale.setScalar(1.15); e2.position.set(8.3, 2.2, -3.3);
  const nose = mk('nose', sph, 'head', head); nose.scale.set(1.6, 2.2, 1.3); nose.position.set(9.4, -1, 0);
  const visor = mk('visor', sph, 'visor', head); visor.scale.set(4.2, 3.2, 7.4); visor.position.set(6.3, 2, 0);
  // crash-test marker texture
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  x.fillStyle = '#E8B81E'; x.beginPath(); x.arc(32,32,31,0,Math.PI*2); x.fill();
  x.fillStyle = '#15181B'; [[0,.5],[1,1.5]].forEach(([a,b]) => { x.beginPath(); x.moveTo(32,32); x.arc(32,32,31,a*Math.PI,b*Math.PI); x.fill(); });
  x.lineWidth = 3; x.strokeStyle = '#15181B'; x.beginPath(); x.arc(32,32,30,0,Math.PI*2); x.stroke();
  const tex = new T.CanvasTexture(cv); 
  const markMat = new T.MeshStandardMaterial({map:tex, roughness:.6, transparent:true}); mats.marker = markMat;
  const circ = new T.CircleGeometry(4.6, 28);
  const m1 = mk('markR', circ, 'marker', head); m1.position.set(0, 1.5, 8.85);
  const m2 = mk('markL', circ, 'marker', head); m2.position.set(0, 1.5, -8.85); m2.rotation.y = Math.PI;
  for (const s of ['R','L']){
    mk('thigh'+s, taper, 'thigh'); mk('shin'+s, taper, 'shin'); mk('foot'+s, box, 'foot');
    mk('upper'+s, taper, 'upper'); mk('fore'+s, taper, 'fore');
    mk('hand'+s, sph, 'hand').scale.set(4.4, 4.2, 3.6);
    mk('jHip'+s, sph, 'jHip').scale.setScalar(7.2); mk('jKnee'+s, sph, 'jKnee').scale.setScalar(5.4);
    mk('jAnkle'+s, sph, 'jAnkle').scale.setScalar(4.1); mk('jSh'+s, sph, 'jSh').scale.setScalar(6);
    mk('jEl'+s, sph, 'jEl').scale.setScalar(4.3);
  }
  // kettlebell
  const bell = new T.Group(); root.add(bell); P.bell = bell;
  const iron = new T.MeshStandardMaterial({color:0x2A2F35, metalness:.55, roughness:.42});
  const bb = new T.Mesh(new T.SphereGeometry(10.5, 32, 22), iron); bb.scale.y = .96; bb.castShadow = true; bell.add(bb);
  const base = new T.Mesh(new T.CylinderGeometry(6.5, 6.5, 1.5, 24), iron); base.position.y = -9.6; bell.add(base);
  const handle = new T.Mesh(new T.TorusGeometry(7.4, 1.65, 12, 30, Math.PI), iron); handle.position.y = 7; handle.castShadow = true; bell.add(handle);
  return {root, P, mats};
}
function applyStyle(id, skin){
  const key = id + skin; if (!G || G.style === key) return; G.style = key;
  const roles = styleRoles(id, skin), P = G.fig.P;
  for (const r in G.fig.mats){
    if (r === 'marker') continue;
    const d = roles[r]; const m = G.fig.mats[r]; if (!d) continue;
    m.color.set(d.c); m.metalness = d.m; m.roughness = d.r;
    if (d.e){ m.emissive.set(d.e); m.emissiveIntensity = .85; } else m.emissive.set(0x000000);
  }
  const vis = roles.vis;
  P.hair.visible = !!vis.hair; P.eyeR.visible = P.eyeL.visible = !!vis.eye; P.nose.visible = !!vis.nose;
  P.visor.visible = !!vis.visor; P.markR.visible = P.markL.visible = !!vis.marker;
  P.jShR.scale.setScalar(id === 'athlete' ? 6.6 : 6); P.jShL.scale.copy(P.jShR.scale);
}
function poseFigure(p, ex){
  const T = G.T, P = G.fig.P, J = solve(p), z = ZC[ex.id] || [17,17,-17,-17];
  const Yv = new T.Vector3(0,1,0), D = new T.Vector3();
  const V = (pt, zz) => new T.Vector3(pt[0], pt[1], zz);
  const place = (m, a, b, r) => { D.subVectors(b, a); const l = D.length() || 0.001; m.position.addVectors(a, b).multiplyScalar(.5); m.scale.set(r, l, r); m.quaternion.setFromUnitVectors(Yv, D.normalize()); };
  const HZ = 8.5, SZ = 15.5;
  const hipR = V(J.hip, HZ), hipL = V(J.hip, -HZ), kR = V(J.knee, HZ), kL = V(J.knee2, -HZ), aR = V(J.ank, HZ), aL = V(J.ank2, -HZ);
  place(P.thighR, kR, hipR, 7); place(P.shinR, aR, kR, 5.3);
  place(P.thighL, kL, hipL, 7); place(P.shinL, aL, kL, 5.3);
  P.jHipR.position.copy(hipR); P.jHipL.position.copy(hipL); P.jKneeR.position.copy(kR); P.jKneeL.position.copy(kL);
  P.jAnkleR.position.copy(aR); P.jAnkleL.position.copy(aL);
  const foot = (m, ank, fv, zz) => { const d = unit(fv); m.position.set(ank[0] + d[0]*5.5 + d[1]*1.5, ank[1] + d[1]*5.5 - d[0]*1.5, zz); m.rotation.set(0, 0, Math.atan2(d[1], d[0])); m.scale.set(18, 5, 8); };
  foot(P.footR, J.ank, p.fv, HZ); foot(P.footL, J.ank2, p.ffv, -HZ);
  P.torso.position.set(J.hip[0], J.hip[1], 0); P.torso.rotation.set(0, 0, -p.b*R);
  place(P.neck, V(add(J.sh, J.td, -4), 0), V(add(J.neckTop, J.td, 3), 0), 4.2);
  P.headG.position.copy(V(J.head, 0)); P.headG.rotation.set(0, 0, -p.b*R);
  const shp = add(J.sh, J.td, -5);
  const arm = (s, el, ha, ez, hz) => {
    const S = V(shp, s === 'R' ? SZ : -SZ), E = V(el, ez), H = V(ha, hz);
    place(P['upper'+s], E, S, 4.9); place(P['fore'+s], H, E, 4.1);
    P['jSh'+s].position.copy(S); P['jEl'+s].position.copy(E); P['hand'+s].position.copy(H);
    P['hand'+s].quaternion.setFromUnitVectors(Yv, D.subVectors(E, H).normalize());
  };
  arm('R', J.el, J.ha, z[0], z[1]); arm('L', J.el2, J.ha2, z[2], z[3]);
  const bi = bellInfo(p, J);
  P.bell.visible = !!bi;
  if (bi){
    const bz = z[4] === 'one' ? z[1] : 0;
    P.bell.position.set(bi.c[0], bi.c[1], bz);
    const X = new T.Vector3(0,0,1), Y2 = new T.Vector3(bi.upv[0], bi.upv[1], 0), Z = new T.Vector3(-bi.upv[1], bi.upv[0], 0);
    P.bell.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y2, Z));
  }
}
function exBounds(ex){
  if (ex._b) return ex._b;
  let minX = 1e9, maxX = -1e9, maxY = 0;
  ex.nk.forEach(k => { const J = solve(k); const pts = [J.ank, J.knee, J.hip, J.sh, J.ha, J.ha2, J.ank2, add(J.head,[0,11]), add(J.head,[11,0]), add(J.head,[-11,0])];
    const bi = bellInfo(k, J); if (bi){ pts.push(add(bi.c,[11,11]), add(bi.c,[-11,-11])); }
    pts.forEach(q => { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); }); });
  return ex._b = {cx:(minX+maxX)/2, cy:Math.max(28, maxY/2), span:Math.max(maxX-minX, maxY, 150)};
}
const VIEWS = {side:0, three:38, front:90};
class Coach3D{
  constructor(host, opts={}){
    this.o = opts; this.cv = document.createElement('canvas'); this.cv.setAttribute('role','img');
    this.cv.setAttribute('aria-label', opts.label || '3D coach demonstrating the move');
    host.insertBefore(this.cv, host.firstChild); this.ctx = this.cv.getContext('2d');
    this.az = this.azT = (opts.az ?? VIEWS.three); this.el = this.elT = (opts.el ?? 12);
    this.spin = false; this.cx = null; this.ex = null; this.t0 = performance.now(); this.speed = 1; this.visible = true;
    const ro = new ResizeObserver(() => this.fit()); ro.observe(this.cv); this.fit();
    if (opts.interactive) this.controls(host);
  }
  fit(){ const dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(this.cv.clientWidth*dpr), h = Math.round(this.cv.clientHeight*dpr); if (w && h && (w !== this.cv.width || h !== this.cv.height)){ this.cv.width = w; this.cv.height = h; } }
  controls(host){
    const bar = document.createElement('div'); bar.className = 'vctl';
    bar.innerHTML = '<div class="seg" role="group" aria-label="Camera view"><button data-v="side">Side</button><button data-v="three" aria-pressed="true">3/4</button><button data-v="front">Front</button><button data-v="spin">Spin</button></div><span class="hint">Drag to turn</span>';
    host.appendChild(bar); this.bar = bar;
    bar.querySelectorAll('button').forEach(b => b.onclick = () => {
      if (b.dataset.v === 'spin'){ this.spin = !this.spin; }
      else { this.spin = false; this.azT = VIEWS[b.dataset.v]; this.az = ((this.az % 360) + 540) % 360 - 180; this.elT = 12; }
      this.mark(b.dataset.v === 'spin' ? (this.spin ? 'spin' : null) : b.dataset.v);
    });
    let drag = null;
    this.cv.addEventListener('pointerdown', e => { drag = {x:e.clientX, y:e.clientY, az:this.azT, el:this.elT}; this.cv.setPointerCapture(e.pointerId); this.cv.classList.add('drag'); this.spin = false; });
    this.cv.addEventListener('pointermove', e => { if (!drag) return; this.azT = drag.az - (e.clientX - drag.x)*0.45; this.elT = Math.max(-4, Math.min(65, drag.el + (e.clientY - drag.y)*0.3)); this.az = this.azT; this.el = this.elT; this.mark(null); });
    const end = () => { drag = null; this.cv.classList.remove('drag'); };
    this.cv.addEventListener('pointerup', end); this.cv.addEventListener('pointercancel', end);
  }
  mark(v){ if (this.bar) this.bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
  set(ex, speed=1){ if (this.ex !== ex){ this.ex = ex; this.t0 = performance.now(); } this.speed = speed; }
  frame(now){
    const ex = this.ex; if (!ex || !this.visible) return;
    const w = this.cv.width, h = this.cv.height; if (!w || !h) return;
    const g = initGL(); applyStyle(state.coach.style, state.coach.skin);
    if (w > g.w || h > g.h){ g.w = Math.max(g.w, w); g.h = Math.max(g.h, h); g.renderer.setSize(g.w, g.h, false); }
    const K = ex.nk, n = K.length; let p;
    if (n === 1 || reduceMotion) p = K[0];
    else { const cyc = ((now - this.t0)/1000*this.speed / ex.tempo) % 1; const pos = cyc*n; const i = Math.floor(pos) % n; p = lerp(K[i], K[(i+1)%n], ease(pos - Math.floor(pos))); }
    poseFigure(p, ex);
    const b = exBounds(ex);
    if (this.cx === null){ this.cx = b.cx; this.cy = b.cy; this.span = b.span; }
    const k = this.o.interactive ? 0.08 : 1;
    this.cx += (b.cx - this.cx)*k; this.cy += (b.cy - this.cy)*k; this.span += (b.span - this.span)*k;
    if (this.spin && !reduceMotion) this.azT += 0.35;
    this.az += (this.azT - this.az)*0.15; this.el += (this.elT - this.el)*0.15;
    const cam = g.camera, aspect = w/h; cam.aspect = aspect; cam.updateProjectionMatrix();
    const half = Math.tan(15*R);
    const dist = ((this.span + (this.o.interactive ? 70 : 25))/2) / half / Math.min(1, aspect*0.95);
    const a = this.az*R, e = this.el*R;
    cam.position.set(this.cx + dist*Math.cos(e)*Math.sin(a), this.cy + 2.5 + dist*Math.sin(e), dist*Math.cos(e)*Math.cos(a));
    cam.lookAt(this.cx, this.cy + 2.5, 0);
    g.key.position.set(this.cx + 140, 300, 200); g.key.target.position.set(this.cx, 40, 0); g.key.target.updateMatrixWorld();
    const r = g.renderer; r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
    r.render(g.scene, cam);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(r.domElement, 0, g.h - h, w, h, 0, 0, w, h);
  }
}
function makeView(host, opts={}){
  if (GL_OK){ try { initGL(); return new Coach3D(host, opts); } catch(e){ console.warn('3D unavailable', e); } }
  const m = new Mannequin(host, opts.label);
  if (opts.interactive){ const n = document.createElement('div'); n.className = 'nogl'; n.textContent = 'Your browser could not start 3D, so this is the flat side view.'; host.appendChild(n); }
  return m;
}

const WORKOUTS = [
  {id:'A', name:'Hinge Day', focus:'Swings, deadlifts and glutes — the backbone of kettlebell training.', moves:['swing','deadlift','row','lunge','bridge','plank']},
  {id:'B', name:'Push & Pull', focus:'Upper body: pressing, rowing and pulling.', moves:['press','row','pushup','floorpress','highpull','pullover']},
  {id:'C', name:'Legs & Core', focus:'Squats and lunges, finished with core work.', moves:['goblet','lunge','swing','bridge','pullover','plank']},
  {id:'D', name:'Full Body', focus:'Big compound moves that hit everything.', moves:['thruster','swing','row','pushup','lunge','tricep']},
  {id:'E', name:'Power & Arms', focus:'Explosive hips plus shoulders and arms.', moves:['swing','highpull','press','curl','tricep','floorpress']}
];
const FORMAT = {
  20:{warm:['bwsquat','hinge','armswing'], warmSec:40, n:5, rounds:3, work:40, rest:20, roundRest:30, cool:['hipstretch','fold'], coolSec:60},
  30:{warm:['bwsquat','hinge','armswing'], warmSec:60, n:6, rounds:4, work:45, rest:15, roundRest:20, cool:['hipstretch','fold'], coolSec:60}
};
function buildSession(w, dur){
  const F = FORMAT[dur], segs = [];
  F.warm.forEach((m,i)=>segs.push({kind:'warm', ex:m, sec:F.warmSec, label:`Warm-up ${i+1} of ${F.warm.length}`}));
  const moves = w.moves.slice(0, F.n);
  for (let r=1; r<=F.rounds; r++){
    moves.forEach((m,i)=>{
      segs.push({kind:'work', ex:m, sec:F.work, label:`Round ${r} of ${F.rounds} · Move ${i+1} of ${moves.length}`});
      const last = i === moves.length-1;
      if (!last) segs.push({kind:'rest', ex:moves[i+1], sec:F.rest, label:`Round ${r} of ${F.rounds} · Rest`});
      else if (r < F.rounds) segs.push({kind:'rest', ex:moves[0], sec:F.roundRest, label:`Round ${r} done · Catch your breath`});
    });
  }
  segs.push({kind:'rest', ex:F.cool[0], sec:15, label:'Main set done · Cool-down next'});
  F.cool.forEach((m,i)=>segs.push({kind:'cool', ex:m, sec:F.coolSec, label:`Cool-down ${i+1} of ${F.cool.length}`}));
  return segs;
}
const totalSec = segs => segs.reduce((a,s)=>a+s.sec,0);

/* ============ State + storage ============ */
const DEFAULT = {days:[1,3,5], dur:20, log:[], coach:{style:'athlete', skin:SKINS[2]}};
let state = JSON.parse(JSON.stringify(DEFAULT));
let dbRef = null, storeMode = 'local';
const LSK = 'iron-thirty-v1';
const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k, v); } catch(e){} };
const lsDel = k => { try { localStorage.removeItem(k); } catch(e){} };
const parse = s => { try { return JSON.parse(s); } catch(e){ return null; } };
function cleanCoach(c){ return {style: (c && STYLES[c.style]) ? c.style : 'athlete', skin: (c && SKINS.includes(c.skin)) ? c.skin : SKINS[2]}; }
function cleanState(d){
  d = d || {};
  return {
    days: Array.isArray(d.days) ? d.days.filter(x => Number.isInteger(x) && x >= 0 && x < 7) : DEFAULT.days.slice(),
    dur: d.dur === 30 ? 30 : 20,
    log: Array.isArray(d.log) ? d.log.filter(x => x && /^\d{4}-\d\d-\d\d$/.test(x.d) && WORKOUTS.some(w => w.id === x.w)).map(x => ({d:x.d, w:x.w, m:+x.m || 0})) : [],
    coach: cleanCoach(d.coach)
  };
}

/* Accounts (Supabase). config.js sets window.ONEBELL_CONFIG. Each user has one row in `plans`
   (see supabase/schema.sql); a copy is cached per user in localStorage so the app starts instantly
   and works offline. `-dirty` marks local changes the server hasn't confirmed yet. */
const CFG = window.ONEBELL_CONFIG || {};
const CLOUD = !window.claude && !!CFG.supabaseUrl && !!CFG.supabaseAnonKey && !/YOUR_/.test(CFG.supabaseUrl + CFG.supabaseAnonKey);
const sb = CLOUD && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
const authErr = (() => { const h = new URLSearchParams(location.hash.slice(1)); return h.get('error_description') || ''; })();
let uid = null, userEmail = '', pulled = false;
const ck = () => LSK + ':' + uid;
if (CLOUD){
  uid = lsGet(LSK + '-uid');
  userEmail = lsGet(LSK + '-email') || '';
  if (uid) state = cleanState(parse(lsGet(ck())) || DEFAULT);
  storeMode = 'pending';
} else {
  const s = parse(lsGet(LSK)); if (s) state = cleanState(Object.assign(state, s));
}
let writeChain = Promise.resolve();
function save(){
  if (CLOUD && uid){ lsSet(ck(), JSON.stringify(state)); lsSet(ck() + '-dirty', '1'); push(); }
  else lsSet(LSK, JSON.stringify(state));
  if (dbRef){
    const body = JSON.parse(JSON.stringify(state));
    writeChain = writeChain.then(()=>dbRef.set(body)).catch(()=>{});
  }
  renderAll();
}
let pushing = null, pushAgain = false;
function push(){
  if (!sb || !uid){ storeMode = 'pending'; return Promise.resolve(); }
  if (pushing){ pushAgain = true; return pushing; }
  pushing = (async () => {
    do {
      pushAgain = false;
      const u = uid, body = JSON.parse(JSON.stringify(state));
      const {error} = await sb.from('plans').upsert({user_id: u, data: body, updated_at: new Date().toISOString()});
      if (error) throw error;
      if (!pushAgain && u === uid) lsDel(LSK + ':' + u + '-dirty');
    } while (pushAgain);
    storeMode = 'cloud';
  })().catch(() => { storeMode = 'pending'; }).finally(() => { pushing = null; renderAcct(); });
  return pushing;
}
// Bring this device up to date: send unsynced local changes, otherwise take the server copy.
async function pull(){
  if (!sb || !uid) return;
  if (lsGet(ck() + '-dirty')){ await push(); pulled = storeMode === 'cloud'; return; }
  const u = uid;
  const {data, error} = await sb.from('plans').select('data').eq('user_id', u).maybeSingle();
  if (error || u !== uid){ storeMode = 'pending'; renderAcct(); return; }
  pulled = true;
  if (lsGet(ck() + '-dirty')){ push(); return; }   // a change landed while we were fetching
  if (data){
    state = cleanState(data.data); lsSet(ck(), JSON.stringify(state));
    storeMode = 'cloud'; dur = state.dur; renderAll();
  } else {
    // First sign-in for this account: adopt history saved before accounts existed, if any.
    const legacy = parse(lsGet(LSK));
    if (legacy && !lsGet(ck())){ state = cleanState(legacy); lsDel(LSK); dur = state.dur; }
    lsSet(ck(), JSON.stringify(state)); lsSet(ck() + '-dirty', '1');
    await push(); renderAll();
  }
}
function adopt(user){
  const same = user.id === uid;
  uid = user.id; userEmail = user.email || '';
  lsSet(LSK + '-uid', uid); lsSet(LSK + '-email', userEmail);
  if (!same){ state = cleanState(parse(lsGet(ck())) || DEFAULT); dur = state.dur; chosen = null; preview = null; pulled = false; }
  gate(false); renderAll();
  if (!pulled) pull();
}
function dropAccount(){
  if (uid){ lsDel(ck()); lsDel(ck() + '-dirty'); }
  lsDel(LSK + '-uid'); lsDel(LSK + '-email');
  uid = null; userEmail = ''; pulled = false; storeMode = 'pending';
  state = cleanState(DEFAULT); dur = state.dur; chosen = null; preview = null;
  gate(true); renderAll();
}
async function signOut(){
  if (lsGet(ck() + '-dirty')){
    await push();
    if (lsGet(ck() + '-dirty') && !confirm('Some changes haven’t synced yet (you seem to be offline). Sign out anyway and lose them?')) return;
  }
  if (sb) await sb.auth.signOut({scope: 'local'}).catch(() => {});
  dropAccount();
}
function startAuth(){
  if (!CLOUD) return;
  wireAuth();
  if (!sb){ gate(!uid); if (!uid) authMsg('Can’t reach the sign-in service. Check your connection and reload.'); return; }
  gate(!uid);
  if (authErr){ authMsg(authErr + ' Request a new link below.'); history.replaceState(null, '', location.pathname + location.search); }
  sb.auth.onAuthStateChange((ev, session) => {
    // Supabase advises against awaiting its own calls inside this callback, so defer the work.
    setTimeout(() => {
      const u = session && session.user;
      if (u){
        if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
        adopt(u);
      } else if (ev === 'SIGNED_OUT' || (ev === 'INITIAL_SESSION' && navigator.onLine)){
        if (uid) dropAccount(); else gate(true);
      }
      // Offline with no session available: keep working from the cached copy; it syncs later.
    });
  });
  window.addEventListener('online', () => { if (uid) pull(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && uid && !P){ pulled = false; pull(); } });
}

/* Sign-in screen: email → magic link + 6-digit code. The code matters on iPhone, where a
   home-screen app doesn't share storage with Safari, so opening the link signs in Safari instead. */
let authEmail = '';
function authMsg(t, ok){ const m = $('authMsg'); m.textContent = t || ''; m.classList.toggle('ok', !!ok); }
function gate(on){ document.body.classList.toggle('gate', on); $('auth').hidden = !on; }
function wireAuth(){
  const step = n => { $('authStep1').hidden = n !== 1; $('authStep2').hidden = n !== 2; };
  $('authStep1').onsubmit = async e => {
    e.preventDefault(); if (!sb) return;
    authEmail = $('authEmail').value.trim(); if (!authEmail) return;
    const btn = e.submitter || $('authStep1').querySelector('button'); btn.disabled = true; authMsg('Sending…');
    const {error} = await sb.auth.signInWithOtp({email: authEmail, options: {emailRedirectTo: location.origin + location.pathname}});
    btn.disabled = false;
    if (error){ authMsg(error.message); return; }
    $('authSent').textContent = authEmail; authMsg(''); step(2); $('authCode').value = ''; $('authCode').focus();
  };
  $('authStep2').onsubmit = async e => {
    e.preventDefault(); if (!sb) return;
    const token = $('authCode').value.replace(/\D/g, ''); if (token.length < 6) { authMsg('Enter the code from the email.'); return; }
    authMsg('Checking…');
    const {error} = await sb.auth.verifyOtp({email: authEmail, token, type: 'email'});
    if (error){ authMsg(error.message); return; }
    authMsg('Signed in.', true); step(1);
  };
  $('authBack').onclick = () => { authMsg(''); step(1); $('authEmail').focus(); };
  $('signOut').onclick = signOut;
}
function renderAcct(){
  $('acctCard').hidden = !(CLOUD && uid);
  $('acctEmail').textContent = userEmail;
  $('saveNote').textContent = CLOUD
    ? (storeMode === 'cloud' ? 'Saved to your account. Sign in on any device to see it.' : 'Saved on this device. It syncs to your account when you’re back online.')
    : storeMode === 'cloud' ? 'Saved to your account — it follows you to any device where you open this page.' : 'Saved in this browser.';
}
(async () => {
  try {
    if (!window.claude || !claude.use) return;
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db || !user) return;
    const uid = await user.id(); if (!uid) return;
    dbRef = db.doc('data/users/' + uid + '/plan');
    const snap = await dbRef.get();
    if (snap.exists){
      const d = snap.data();
      state = {days: Array.isArray(d.days) ? d.days.slice() : DEFAULT.days.slice(), dur: d.dur === 30 ? 30 : 20, log: Array.isArray(d.log) ? d.log.map(x=>({...x})) : [], coach: cleanCoach(d.coach)};
      try { localStorage.setItem(LSK, JSON.stringify(state)); } catch(e){}
    } else if (state.log.length || state.days.join() !== DEFAULT.days.join()) {
      await dbRef.set(JSON.parse(JSON.stringify(state)));
    }
    storeMode = 'cloud';
    renderAll();
  } catch(e){ dbRef = null; }
})();

/* ============ Dates ============ */
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const logFor = key => state.log.find(l => l.d === key);
function nextWorkout(){ const n = state.log.length; const last = state.log.slice().sort((a,b)=>a.d<b.d?-1:1).pop();
  if (last){ const i = WORKOUTS.findIndex(w=>w.id===last.w); if (i>=0) return WORKOUTS[(i+1)%WORKOUTS.length]; }
  return WORKOUTS[n % WORKOUTS.length]; }
function nextPlannedDate(from){ for (let i=0;i<14;i++){ const d = new Date(from); d.setDate(d.getDate()+i); if (state.days.includes(d.getDay()) && !logFor(ymd(d))) return d; } return null; }

/* ============ Today view ============ */
let chosen = null, dur = state.dur, preview = null;
const $ = id => document.getElementById(id);
const hero = makeView($('heroStage'), {interactive:true, label:'3D coach demonstrating the selected move'});
const minis = [];
function setPreview(id){
  preview = id; hero.set(EX[id]);
  $('heroName').textContent = EX[id].name; $('heroTag').textContent = EX[id].tag;
  document.querySelectorAll('#sessMoves button').forEach(b => b.setAttribute('aria-current', b.dataset.ex === id ? 'true':'false'));
}
function renderToday(){
  const w = chosen || nextWorkout();
  const t = today(), tk = ymd(t), doneToday = logFor(tk);
  const planned = state.days.includes(t.getDay());
  let eyebrow;
  if (doneToday) eyebrow = `Done today · Up next: Workout ${w.id}`;
  else if (planned) eyebrow = `Today's workout · ${w.id}`;
  else { const nd = nextPlannedDate(t); eyebrow = `Rest day${nd ? ' · next planned ' + DOW[nd.getDay()] : ''} · Workout ${w.id}`; }
  if (chosen) eyebrow = `Your pick · Workout ${w.id}`;
  $('sessEyebrow').textContent = eyebrow;
  $('sessTitle').textContent = w.name;
  $('sessFocus').textContent = w.focus;
  const F = FORMAT[dur];
  $('sessSpec').textContent = `${F.n} moves × ${F.rounds} rounds · ${F.work}s on / ${F.rest}s off`;
  ['d20','d30'].forEach(id => $(id).setAttribute('aria-pressed', String(+$(id).dataset.d === dur)));
  const ol = $('sessMoves'); ol.textContent = '';
  w.moves.slice(0, F.n).forEach((m,i) => {
    const li = document.createElement('li'); const b = document.createElement('button'); b.dataset.ex = m;
    b.innerHTML = `<span class="ix">${i+1}</span><span class="nm"></span><span class="tg"></span>`;
    b.querySelector('.nm').textContent = EX[m].name; b.querySelector('.tg').textContent = EX[m].tag;
    b.addEventListener('click', () => setPreview(m));
    li.appendChild(b); ol.appendChild(li);
  });
  const mv = w.moves.slice(0,F.n);
  if (!preview || !mv.includes(preview)) setPreview(mv[0]); else setPreview(preview);
  const nxt = nextWorkout();
  const pk = $('pickW'); pk.textContent = '';
  WORKOUTS.forEach(x => {
    const b = document.createElement('button'); b.setAttribute('aria-pressed', String(x.id === w.id));
    b.textContent = `${x.id} · ${x.name}`;
    if (x.id === nxt.id){ const s = document.createElement('span'); s.className='up'; s.textContent='up next'; b.appendChild(s); }
    b.addEventListener('click', () => { chosen = (x.id === nxt.id) ? null : x; preview = null; renderToday(); });
    pk.appendChild(b);
  });
  // week strip
  const ws = $('weekStrip'); ws.textContent = '';
  const start = new Date(t); start.setDate(t.getDate() - t.getDay());
  let plannedN = 0, doneN = 0;
  for (let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i); const k = ymd(d); const lg = logFor(k);
    const isPlan = state.days.includes(d.getDay());
    if (isPlan) plannedN++; if (lg) doneN++;
    const c = document.createElement('div');
    c.className = 'day' + (lg ? ' done' : isPlan ? ' plan' : '') + (k === tk ? ' is-today' : '');
    c.innerHTML = `<span class="dn">${DOW[d.getDay()]}</span><span class="dd num">${d.getDate()}</span><span class="dw"></span>`;
    c.querySelector('.dw').textContent = lg ? `Done · ${lg.w}` : isPlan ? 'Planned' : 'Rest';
    ws.appendChild(c);
  }
  $('weekNote').textContent = `${doneN} of ${plannedN} planned sessions done`;
}
$('d20').onclick = () => { dur = 20; renderToday(); };
$('d30').onclick = () => { dur = 30; renderToday(); };

/* ============ Schedule view ============ */
let calMonth = (() => { const t = today(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
function renderSched(){
  const chips = $('dayChips'); chips.textContent = '';
  DOW.forEach((n,i) => { const b = document.createElement('button'); b.textContent = n; b.setAttribute('aria-pressed', String(state.days.includes(i)));
    b.onclick = () => { state.days = state.days.includes(i) ? state.days.filter(x=>x!==i) : [...state.days, i].sort(); save(); };
    chips.appendChild(b); });
  ['dd20','dd30'].forEach(id => $(id).setAttribute('aria-pressed', String(+$(id).dataset.d === state.dur)));
  $('calTitle').textContent = `${MON[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
  const cal = $('cal'); cal.textContent = '';
  DOW.forEach(n => { const h = document.createElement('div'); h.className='wd'; h.textContent = n[0]; cal.appendChild(h); });
  const first = calMonth.getDay(); const dim = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate();
  const tk = ymd(today()), tdate = today();
  for (let i=0;i<first;i++){ const b = document.createElement('button'); b.className='out'; b.tabIndex=-1; b.setAttribute('aria-hidden','true'); cal.appendChild(b); }
  for (let d=1; d<=dim; d++){
    const dt = new Date(calMonth.getFullYear(), calMonth.getMonth(), d); const k = ymd(dt); const lg = logFor(k);
    const isPlan = state.days.includes(dt.getDay());
    const b = document.createElement('button');
    b.className = (lg ? 'done' : isPlan && dt >= tdate ? 'plan' : '') + (k === tk ? ' is-today' : '');
    b.innerHTML = `<span>${d}</span><small>${lg ? lg.w : ''}</small>`;
    b.setAttribute('aria-label', `${MON[dt.getMonth()]} ${d}${lg ? ', done: workout '+lg.w : isPlan ? ', planned' : ''}`);
    if (dt <= tdate) b.onclick = () => {
      if (lg) state.log = state.log.filter(x => x.d !== k);
      else state.log.push({d:k, w:nextWorkout().id, m:state.dur});
      save();
    }; else b.style.cursor = 'default';
    cal.appendChild(b);
  }
  // stats
  const t = today(); const ws = new Date(t); ws.setDate(t.getDate()-t.getDay()); const wsk = ymd(ws);
  const mk = `${t.getFullYear()}-${pad(t.getMonth()+1)}`;
  $('stWeek').textContent = state.log.filter(l => l.d >= wsk && l.d <= ymd(t)).length;
  $('stMonth').textContent = state.log.filter(l => l.d.startsWith(mk)).length;
  $('stMin').textContent = state.log.reduce((a,l)=>a+(+l.m||0),0);
  const h = $('hist'); h.textContent = '';
  const sorted = state.log.slice().sort((a,b)=> a.d < b.d ? 1 : -1);
  if (!sorted.length){ const li = document.createElement('li'); li.innerHTML = '<span>No sessions yet. Finish a workout and it lands here automatically.</span>'; h.appendChild(li); }
  sorted.forEach(l => { const w = WORKOUTS.find(x=>x.id===l.w) || {name:'Workout'}; const [y,m,d] = l.d.split('-').map(Number); const dt = new Date(y,m-1,d);
    const li = document.createElement('li'); li.innerHTML = '<b></b><span></span>';
    li.querySelector('b').textContent = `${l.w} · ${w.name}`; li.querySelector('span').textContent = `${DOW[dt.getDay()]} ${MON[m-1].slice(0,3)} ${d} · ${l.m} min`; h.appendChild(li); });
  renderAcct();
}
$('calPrev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); renderSched(); };
$('calNext').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); renderSched(); };
$('dd20').onclick = () => { state.dur = 20; dur = 20; save(); };
$('dd30').onclick = () => { state.dur = 30; dur = 30; save(); };

/* ============ Moves library ============ */
const libIO = ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(e => { if (e.target._view) e.target._view.visible = e.isIntersecting; }), {rootMargin:'100px'}) : null;
function renderLib(){
  const lib = $('lib'); if (lib.childElementCount) return;
  const order = ['swing','deadlift','goblet','lunge','row','press','thruster','highpull','pushup','floorpress','bridge','pullover','plank','curl','tricep','bwsquat','hinge','armswing','hipstretch','fold'];
  order.forEach(id => {
    const ex = EX[id]; const card = document.createElement('article'); card.className = 'mv';
    const st = document.createElement('div'); st.className = 'st'; card.appendChild(st);
    const m = makeView(st, {az:32, el:10, label:'Coach demonstrating ' + ex.name}); m.set(ex); minis.push(m); m.visible = false; libIO && libIO.observe(st); st._view = m;
    const bd = document.createElement('div'); bd.className = 'bd';
    bd.innerHTML = `<div class="meta"><span></span><span class="num"></span></div><h3></h3><ul></ul><a target="_blank" rel="noopener">Watch a real person do it ↗</a>`;
    bd.querySelector('.meta span').textContent = ex.tag;
    bd.querySelector('.meta .num').textContent = ex.sided ? 'each side' : `${ex.tempo.toFixed(1)}s / rep`;
    bd.querySelector('h3').textContent = ex.name;
    ex.cues.forEach(c => { const li = document.createElement('li'); li.textContent = c; bd.querySelector('ul').appendChild(li); });
    bd.querySelector('a').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(ex.name + (ex.tag.startsWith('Warm')||ex.tag.startsWith('Cool') ? '' : ' kettlebell') + ' proper form');
    card.appendChild(bd); lib.appendChild(card);
  });
}

/* ============ Tabs ============ */
let view = 'today';
function show(v){ view = v;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  $('v-today').hidden = v !== 'today'; $('v-sched').hidden = v !== 'sched'; $('v-moves').hidden = v !== 'moves';
  if (v === 'moves') renderLib();
  try { localStorage.setItem(LSK+'-tab', v); } catch(e){}
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
if (['sched','moves'].includes(location.hash.slice(1))) show(location.hash.slice(1));

function renderCoach(){
  const cc = $('coachChips'); cc.textContent = '';
  for (const id in STYLES){ const b = document.createElement('button'); b.setAttribute('aria-pressed', String(state.coach.style === id));
    const i = document.createElement('i'); i.style.background = id === 'athlete' ? state.coach.skin : STYLES[id].dot; b.appendChild(i); b.append(STYLES[id].label);
    b.onclick = () => { state.coach.style = id; save(); }; cc.appendChild(b); }
  const sw = $('skinSw'); sw.textContent = ''; sw.hidden = state.coach.style !== 'athlete';
  SKINS.forEach((c,i) => { const b = document.createElement('button'); b.style.background = c; b.setAttribute('aria-label', 'Skin tone ' + (i+1)); b.setAttribute('aria-pressed', String(state.coach.skin === c));
    b.onclick = () => { state.coach.skin = c; save(); }; sw.appendChild(b); });
  $('coachNote').textContent = GL_OK ? 'Drag the figure to turn it' : '';
}
function renderAll(){ renderToday(); renderSched(); renderCoach(); }

/* ============ Player ============ */
const pm = makeView($('pStage'), {interactive:true, label:'3D coach demonstrating the current move'});
let P = null, audio = null, wake = null;
const CIRC = 351.86;
function beep(freq=880, ms=120, vol=.18){
  if (!$('optBeep').checked || !audio) return;
  try { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = freq; o.type='sine';
    g.gain.value = vol; o.connect(g); g.connect(audio.destination); const t = audio.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms/1000); o.start(t); o.stop(t + ms/1000 + .02); } catch(e){}
}
function say(txt){
  if (!$('optVoice').checked || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.rate = 1.02; speechSynthesis.speak(u); } catch(e){}
}
function startWorkout(){
  const w = chosen || nextWorkout();
  const segs = buildSession(w, dur);
  P = {w, dur, segs, i:0, el:0, paused:false, last:performance.now(), beeped:{}, done:0};
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume && audio.resume(); } catch(e){}
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => wake = l).catch(()=>{}); } catch(e){}
  $('player').hidden = false; $('pIn').hidden = false; $('pDone').hidden = true;
  document.body.style.overflow = 'hidden';
  $('pTitle').innerHTML = ''; const b = document.createElement('b'); b.textContent = `Workout ${w.id} · ${w.name}`; $('pTitle').appendChild(b);
  $('pTitle').append(` · ${dur} min`);
  const bar = $('pBar'); bar.textContent = '';
  segs.forEach(s => { const i = document.createElement('i'); if (s.kind !== 'rest') i.className = 'w'; bar.appendChild(i); });
  enterSeg(0);
}
function enterSeg(i){
  P.i = i; P.el = 0; P.beeped = {};
  const s = P.segs[i]; const ex = EX[s.ex];
  const isRest = s.kind === 'rest';
  pm.set(ex, isRest ? 0.6 : 1);
  $('pPhase').textContent = isRest ? 'Rest · next up' : s.kind === 'warm' ? 'Warm-up' : s.kind === 'cool' ? 'Cool-down' : 'Work';
  $('pPhase').className = 'p-phase' + (isRest ? ' rest' : '');
  $('pName').textContent = ex.name;
  $('pRound').textContent = s.label;
  const cues = $('pCues'); cues.textContent = ''; ex.cues.forEach(c => { const li = document.createElement('li'); li.textContent = c; cues.appendChild(li); });
  const nx = P.segs.slice(i+1).find(x => x.kind !== 'rest');
  $('pNext').innerHTML = '';
  if (isRest){ $('pNext').append('Get set. Starts when the timer hits zero.'); }
  else if (nx){ $('pNext').append('Next: '); const b = document.createElement('b'); b.textContent = EX[nx.ex].name; $('pNext').appendChild(b); }
  else $('pNext').append('Last one!');
  $('pSide').hidden = true;
  [...$('pBar').children].forEach((b,j) => { b.classList.toggle('past', j < i); b.classList.toggle('cur', j === i); b.style.removeProperty('--p'); });
  if (isRest) say(`Rest. Next, ${ex.name}.`); else say(ex.name + (ex.sided ? '. Switch sides halfway.' : ''));
  if (!isRest) beep(1320, 220, .22);
}
function tickPlayer(now){
  if (!P || $('player').hidden || !$('pDone').hidden) return;
  const dt = Math.min(0.25, (now - P.last)/1000); P.last = now;
  const s = P.segs[P.i];
  if (!P.paused) P.el += dt;
  const rem = Math.max(0, s.sec - P.el);
  const secs = Math.ceil(rem);
  $('pTime').textContent = secs;
  $('pRing').setAttribute('stroke-dashoffset', (CIRC * (P.el / s.sec)).toFixed(1));
  const cur = $('pBar').children[P.i]; if (cur) cur.style.setProperty('--p', Math.min(100, P.el/s.sec*100).toFixed(1)+'%');
  if (!P.paused){
    for (const n of [3,2,1]) if (rem <= n && rem > n-1 && !P.beeped[n]){ P.beeped[n] = 1; beep(660, 110); }
    const ex = EX[s.ex];
    if (ex.sided && s.kind !== 'rest' && P.el >= s.sec/2 && !P.beeped.h){ P.beeped.h = 1; beep(990, 160); beep(990, 160); say('Switch sides'); $('pSide').hidden = false; }
    if (P.el >= s.sec){ if (s.kind !== 'rest') P.done += s.sec; if (P.i < P.segs.length-1) enterSeg(P.i+1); else finish(true); }
  }
}
function finish(complete){
  const w = P.w; const tk = ymd(today());
  const worked = P.done + (P.segs[P.i].kind !== 'rest' ? Math.min(P.el, P.segs[P.i].sec) : 0);
  const frac = worked / P.segs.filter(s=>s.kind!=='rest').reduce((a,s)=>a+s.sec,0);
  const minutes = Math.round(totalSec(P.segs.slice(0, P.i+1))/60) || 1;
  $('pIn').hidden = true; $('pDone').hidden = false;
  try { wake && wake.release(); } catch(e){} wake = null;
  if (complete || frac >= 0.5){
    state.log = state.log.filter(l => l.d !== tk);
    state.log.push({d:tk, w:w.id, m: complete ? P.dur : minutes});
    chosen = null; save();
    $('fTitle').textContent = complete ? 'Nice work.' : 'Good session.';
    $('fText').textContent = `Workout ${w.id} · ${w.name} is logged for today. ${nextPlannedLine()}`;
    beep(1320,200); setTimeout(()=>beep(1760,300),220); say(complete ? 'Workout complete. Nice work.' : 'Session logged.');
  } else {
    $('fTitle').textContent = 'Ended early.';
    $('fText').textContent = 'Less than half the session was done, so it was not logged. Start again any time.';
  }
}
function nextPlannedLine(){ const t = today(); t.setDate(t.getDate()+1); const d = nextPlannedDate(t); const n = nextWorkout();
  return d ? `Next up: Workout ${n.id} (${n.name}) on ${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}.` : `Next up: Workout ${n.id}.`; }
function closePlayer(){ $('player').hidden = true; document.body.style.overflow = ''; try{ speechSynthesis.cancel(); }catch(e){} P = null; renderAll(); }
$('startBtn').onclick = startWorkout;
$('pPause').onclick = () => { if (!P) return; P.paused = !P.paused; $('pPause').textContent = P.paused ? 'Resume' : 'Pause'; if (P.paused) try{speechSynthesis.cancel()}catch(e){} };
$('pSkip').onclick = () => { if (!P) return; const s = P.segs[P.i]; if (s.kind !== 'rest') P.done += Math.min(P.el, s.sec); if (P.i < P.segs.length-1) enterSeg(P.i+1); else finish(true); };
$('pPrev').onclick = () => { if (!P) return; if (P.el > 3 || P.i === 0) enterSeg(P.i); else enterSeg(P.i-1); };
$('pEnd').onclick = () => { if (!P) return; if ($('pEnd').dataset.arm === '1'){ $('pEnd').dataset.arm = ''; $('pEnd').textContent = 'End workout'; finish(false); } else { $('pEnd').dataset.arm = '1'; $('pEnd').textContent = 'Tap again to end'; setTimeout(()=>{ $('pEnd').dataset.arm=''; $('pEnd').textContent='End workout'; }, 3000); } };
$('fClose').onclick = closePlayer;
document.addEventListener('keydown', e => { if (!P || $('player').hidden) return; if (e.code === 'Space'){ e.preventDefault(); $('pPause').click(); } });

/* ============ Animation loop ============ */
let libFrame = 0, lastFloor = 0;
function loop(now){
  if (view === 'today' && $('player').hidden) hero.frame(now);
  if (view === 'moves' && $('player').hidden){ libFrame = (libFrame+1) % 2; if (!libFrame) minis.forEach(m => { if (!libIO) m.visible = true; m.frame(now); }); }
  if (now - lastFloor > 1500){ lastFloor = now; syncFloor(); }
  if (!$('player').hidden) { pm.frame(now); tickPlayer(now); }
  requestAnimationFrame(loop);
}
renderAll();
startAuth();
hero.frame(performance.now());
requestAnimationFrame(loop);

/* ============ Offline / install ============ */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.claude)
  navigator.serviceWorker.register('sw.js').catch(() => {});
})();
