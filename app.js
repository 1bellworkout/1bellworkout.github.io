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
  oneswing:{name:'One-Arm Swing', tag:'Hinge · power', tempo:1.7, sided:true, keys:[
      {s:14,t:-58,b:62, na:{u:-25,l:-30}, fa:{u:-12,l:-12}, bell:'along'},
      {s:0,t:0,b:-4, na:{u:92,l:92}, fa:{u:20,l:35}, bell:'along'}],
    cues:['Same hip snap as the two-hand swing','Square shoulders: don’t let the bell twist you','Switch hands halfway']},
  sldl:{name:'Single-Leg Deadlift', tag:'Hinge · balance', tempo:3.6, sided:true, keys:[
      {ff:[-3,3], na:{u:0,l:0}, fa:{u:6,l:6}, bell:'hang'},
      {s:8,t:-10,b:80, ff:[-88,70], ffv:[3,-12], na:{u:0,l:0}, fa:{u:-6,l:-6}, bell:'hang'}],
    cues:['Stand on one leg, soft knee','Hinge forward as the free leg reaches back','Hips stay square; switch legs halfway']},
  suitcase:{name:'Suitcase Deadlift', tag:'Hinge · core', tempo:3.2, sided:true, keys:[
      {na:{u:0,l:0}, fa:{u:6,l:6}, bell:'hang'},
      {s:25,t:-65,b:45, na:{u:0,l:0}, fa:{u:4,l:4}, bell:'hang'}],
    cues:['Bell at your side like a suitcase','Sit hips back and down, chest up','Don’t lean toward the bell; switch hands halfway']},
  clean:{name:'Kettlebell Clean', tag:'Hinge · power', tempo:2.6, sided:true, keys:[
      {s:14,t:-55,b:58, na:{u:-15,l:-15}, fa:{u:-8,l:-8}, bell:'hang'},
      {s:0,t:0,b:-3, na:{u:35,l:95}, fa:{u:12,l:20}, bell:'hang'},
      {na:{u:15,l:170}, fa:{u:8,l:12}, bell:'rack'}],
    cues:['Hike the bell back like a swing','Drive the hips and keep the bell close','Let it roll onto your forearm in the rack; switch halfway']},
  cleanpress:{name:'Clean & Press', tag:'Full body', tempo:4.4, sided:true, keys:[
      {s:14,t:-55,b:58, na:{u:-15,l:-15}, fa:{u:-8,l:-8}, bell:'hang'},
      {na:{u:15,l:170}, fa:{u:8,l:12}, bell:'rack'},
      {na:{u:176,l:178}, fa:{u:8,l:12}, bell:'rack'},
      {na:{u:15,l:170}, fa:{u:8,l:12}, bell:'rack'}],
    cues:['Clean the bell to the rack','Press straight overhead, glutes tight','Lower to the rack, then back down; switch halfway']},
  kbgm:{name:'Goblet Good Morning', tag:'Hinge · hamstrings', tempo:3.4, keys:[
      {na:goblet, bell:'hang'},
      {s:10,t:-30,b:72, na:{u:-64,l:58}, bell:'hang'}],
    cues:['Hug the bell to your chest','Push hips back until you feel the hamstrings','Flat back, then squeeze glutes to stand']},
  slbridge:{name:'Single-Leg Glute Bridge', tag:'Glutes · single side', tempo:2.8, sided:true, keys:[
      {...lie, ff:[81,56], ffv:[4,12], na:{u:84,l:84}},
      {rx:25, s:27,t:-105.7,b:-105.7, ff:[87,51], ffv:[4,12], na:{u:84,l:84}}],
    cues:['One foot planted, other leg straight','Drive through the heel and lift your hips','Keep hips level; switch legs halfway']},
  splitsq:{name:'Goblet Split Squat', tag:'Legs · single side', tempo:3.2, sided:true, keys:[
      {s:2,t:-35,b:3, ff:[-70,6], ffv:[7,-8], na:goblet, bell:'hang'},
      {s:8,t:-80,b:4, ff:[-70,6], ffv:[7,-8], na:goblet, bell:'hang'}],
    cues:['Feet stay split: one forward, one back','Drop straight down, back knee toward the floor','Drive up through the front heel; switch halfway']},
  racksquat:{name:'Front-Rack Squat', tag:'Legs · core', tempo:3.4, sided:true, keys:[
      {na:{u:15,l:170}, fa:{u:30,l:40}, bell:'rack'},
      {s:38,t:-80,b:28, na:{u:30,l:170}, fa:{u:70,l:80}, bell:'rack'}],
    cues:['Bell in the rack on one side','Squat deep without leaning away from it','Stand tall, brace your core; switch sides halfway']},
  pushpress:{name:'Push Press', tag:'Shoulders · power', tempo:2.6, sided:true, keys:[
      {na:{u:15,l:170}, fa:{u:3,l:3}, bell:'rack'},
      {s:15,t:-15,b:2, na:{u:18,l:172}, fa:{u:3,l:3}, bell:'rack'},
      {na:{u:176,l:178}, fa:{u:3,l:3}, bell:'rack'}],
    cues:['Quick dip at the knees','Drive up with the legs to launch the press','Lock out overhead; switch halfway']},
  kneelpress:{name:'Half-Kneeling Press', tag:'Shoulders · core', tempo:2.8, sided:true, keys:[
      {s:8,t:-80,b:0, ff:[-74,8], ffv:[7,-8], na:{u:15,l:170}, fa:{u:3,l:3}, bell:'rack'},
      {s:8,t:-80,b:0, ff:[-74,8], ffv:[7,-8], na:{u:176,l:178}, fa:{u:3,l:3}, bell:'rack'}],
    cues:['Kneel on one knee, squeeze that glute','Press up without arching your back','Switch sides halfway']},
  hornrow:{name:'Two-Hand Row', tag:'Back', tempo:2.4, keys:[
      {s:15,t:-45,b:72, na:{u:-4,l:-4}, bell:'hang'},
      {s:15,t:-45,b:72, na:{u:-62,l:-6}, bell:'hang'}],
    cues:['Hinge forward, hold the bell by the horns','Row it to your lower ribs','Squeeze shoulder blades, lower slowly']},
  gfloorpress:{name:'Two-Hand Floor Press', tag:'Chest · triceps', tempo:2.6, keys:[
      {...lie, na:{u:86,l:180}, bell:'along'},
      {...lie, na:{u:180,l:180}, bell:'along'}],
    cues:['Lie down, bell held by the horns over your chest','Elbows touch the floor at the bottom','Press straight up, keep wrists stacked']},
  skull:{name:'Lying Triceps Extension', tag:'Triceps', tempo:2.8, keys:[
      {...lie, na:{u:180,l:180}, bell:'along'},
      {...lie, na:{u:172,l:262}, bell:'along'}],
    cues:['Lie down, arms straight up, bell by the horns','Bend only at the elbows, lowering behind your head','Squeeze triceps to straighten']},
  hammer:{name:'Hammer Curl', tag:'Biceps · single arm', tempo:2.6, sided:true, keys:[
      {na:{u:0,l:0}, fa:{u:3,l:3}, bell:'hang'},
      {na:{u:8,l:150}, fa:{u:3,l:3}, bell:'hang'}],
    cues:['Hold the handle, thumb up','Curl without swinging your body','Lower for three counts; switch halfway']},
  frontraise:{name:'Front Raise', tag:'Shoulders', tempo:2.8, keys:[
      {na:{u:0,l:0}, bell:'hang'},
      {na:{u:88,l:88}, bell:'hang'}],
    cues:['Hold the horns, arms nearly straight','Raise to shoulder height, no leaning back','Lower slowly']},
  situp:{name:'Goblet Crunch', tag:'Core', tempo:2.6, keys:[
      {...lie, na:{u:98,l:220}, bell:'hang'},
      {...lie, b:-58, na:{u:66,l:188}, bell:'hang'}],
    cues:['Lie on your back, bell hugged to your chest','Curl your shoulders off the floor','Exhale up, lower with control']},
  climber:{name:'Mountain Climbers', tag:'Core · cardio', tempo:1.1, keys:[
      {rx:-72,ay:6,fv:[4,-6],s:68,t:68,b:68, ff:[-72,6], ffv:[4,-6], na:{t:[64,2]}},
      {rx:-72,ay:6,fv:[4,-6],s:68,t:68,b:68, ff:[-8,12], ffv:[4,-6], na:{t:[64,2]}}],
    cues:['High plank, hands under shoulders','Drive knees toward your chest, one at a time','Hips stay low and steady']},
  // Halo: the bell circles the head, so each key also sets the hands' sideways (z) position:
  // zc = [right elbow z, right hand z, left elbow z, left hand z, grip, bell z].
  halo:{name:'Halo', tag:'Shoulders · core', tempo:2, sided:true, switchCue:'Switch direction', keys:[
      {na:{t:[16,163]}, bell:'along', zc:[20,4,-20,-4,'two',0]},
      {na:{t:[3,171]}, bell:'along', zc:[22,22,-4,15,'two',19]},
      {na:{t:[-13,160], k:1}, bell:'along', zc:[20,4,-20,-4,'two',0]},
      {na:{t:[3,171]}, bell:'along', zc:[4,-15,-22,-22,'two',-19]}],
    cues:['Hold the bell upside down by the horns at your chest','Circle it close around your head, ribs down','About 10 reps one way, then switch direction']},
  standpullover:{name:'Standing Pullover', tag:'Lats · shoulders', tempo:3, keys:[
      {na:{u:0,l:0}, bell:'along'},
      {na:{u:188,l:196}, bell:'along'}],
    cues:['Hold the horns, bell at your waist','Arms long: lift it up and over your head','Ribs down, then lower with control']},
  // bodyweight main moves (Bodyweight day)
  kneepush:{name:'Knee Push-Up', tag:'Chest · bodyweight', tempo:2.4, keys:[
      {rx:-70, ay:4, fv:[-8,6], s:90, t:64, b:64, na:{t:[67,2]}},
      {rx:-70, ay:4, fv:[-8,6], s:90, t:78, b:78, na:{t:[67,2]}}],
    cues:['Knees down, hips in line with your back','Lower your chest between your hands','Push the floor away']},
  superman:{name:'Superman', tag:'Back · bodyweight', tempo:3, keys:[
      {rx:-80, ay:5, fv:[-12,-1], s:90, t:90, b:88, na:{u:96,l:96}},
      {rx:-80, ay:9, fv:[-12,-1], s:96, t:92, b:80, na:{u:106,l:106}}],
    cues:['Lie face down, arms reaching forward','Lift arms, chest and legs a few inches','Hold a beat, then lower slowly']},
  birddog:{name:'Bird Dog', tag:'Core · bodyweight', tempo:3.2, sided:true, keys:[
      {rx:-75, ay:4, fv:[-8,6], s:90, t:0, b:90, ff:[-75,4], ffv:[-8,6], na:{t:[27,2]}, fa:{t:[27,2]}},
      {rx:-75, ay:4, fv:[-8,6], s:90, t:0, b:90, ff:[-119,52], ffv:[2,-12], na:{u:92,l:92}, fa:{t:[27,2]}}],
    cues:['Hands and knees, back flat','Reach one arm forward and the opposite leg back','Don’t let your hips tip; switch sides halfway']},
  bwsplit:{name:'Split Squat', tag:'Legs · bodyweight', tempo:3, sided:true, keys:[
      {s:2,t:-35,b:3, ff:[-70,6], ffv:[7,-8], na:{u:20,l:160}},
      {s:8,t:-80,b:4, ff:[-70,6], ffv:[7,-8], na:{u:20,l:160}}],
    cues:['Feet split, one forward and one back','Lower straight down, back knee toward the floor','Switch legs halfway']},
  bwsldl:{name:'Single-Leg Reach', tag:'Hinge · bodyweight', tempo:3.4, sided:true, keys:[
      {ff:[-3,3], na:{u:0,l:0}},
      {s:8,t:-10,b:80, ff:[-88,70], ffv:[3,-12], na:{u:0,l:0}}],
    cues:['Balance on one leg','Hinge and reach toward the floor as the free leg goes back','Switch legs halfway']},
  crunch:{name:'Crunch', tag:'Core · bodyweight', tempo:2.4, keys:[
      {...lie, na:{u:98,l:220}},
      {...lie, b:-58, na:{u:66,l:188}}],
    cues:['Knees bent, hands across your chest','Curl your shoulders off the floor','Lower slowly']},
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
  march:{name:'High-Knee March', tag:'Warm-up', tempo:1.6, sided:true, keys:[
      {na:{u:-10,l:-10}, fa:{u:10,l:10}},
      {ff:[44,48], ffv:[10,-6], na:{u:-35,l:-20}, fa:{u:40,l:85}}],
    cues:['Drive the knee up to hip height','Swing the opposite arm','Stay tall; switch legs halfway']},
  bwlunge:{name:'Reverse Lunge', tag:'Warm-up', tempo:3, sided:true, keys:[
      {na:{u:20,l:160}},
      {s:8,t:-80,b:4, ff:[-74,8], ffv:[7,-8], na:{u:20,l:160}}],
    cues:['Hands at your chest','Step back and lower gently','Switch legs halfway']},
  bwbridge:{name:'Glute Bridge', tag:'Warm-up', tempo:2.6, keys:[
      {...lie, na:{u:84,l:84}},
      {rx:25, s:27,t:-105.7,b:-105.7, na:{u:84,l:84}}],
    cues:['Feet flat, knees bent','Squeeze your glutes to lift the hips','Lower slowly']},
  pike:{name:'Plank to Down Dog', tag:'Warm-up', tempo:3.2, keys:[
      {rx:-72,ay:6,fv:[4,-6],s:68,t:68,b:68, na:{t:[64,2]}},
      {rx:-72,ay:6,fv:[10,-4],s:35,t:35,b:130, na:{t:[64,2]}}],
    cues:['Start in a high plank','Push your hips up and back','Press your heels toward the floor, then return']},
  hipstretch:{name:'Hip Flexor Stretch', tag:'Cool-down', tempo:5, keys:[
      {s:8,t:-80,b:4, ff:[-74,8], ffv:[7,-8], na:{u:20,l:20}},
      {s:12,t:-78,b:2, ff:[-74,8], ffv:[7,-8], na:{u:20,l:20}}],
    cues:['Back knee down, tuck your hips under','Lean gently forward','Switch legs halfway']},
  fold:{name:'Forward Fold', tag:'Cool-down', tempo:5, keys:[
      {s:8,t:-18,b:118, na:{u:-20,l:-20}},
      {s:8,t:-18,b:122, na:{u:-22,l:-22}}],
    cues:['Soft knees, let your head hang','Breathe slowly','Roll up one vertebra at a time']},
  quadstretch:{name:'Standing Quad Stretch', tag:'Cool-down', tempo:5, sided:true, keys:[
      {ff:[-22,84], ffv:[-4,12], na:{u:80,l:80}, fa:{t:[-22,86], k:1}},
      {ff:[-23,85], ffv:[-4,12], na:{u:82,l:82}, fa:{t:[-23,87], k:1}}],
    cues:['Hold your foot behind you','Knees together, hips pushed slightly forward','Switch legs halfway']},
  kneehug:{name:'Knee-to-Chest', tag:'Cool-down', tempo:5, sided:true, keys:[
      {...lie, ff:[28,42], ffv:[10,6], na:{t:[6,52], k:1}},
      {...lie, ff:[24,44], ffv:[10,6], na:{t:[3,54], k:1}}],
    cues:['Lie on your back','Hug one knee toward your chest','Relax your low back; switch legs halfway']},
  hamstretch:{name:'Kneeling Hamstring Stretch', tag:'Cool-down', tempo:5, sided:true, keys:[
      {rx:40, s:-57.6,t:-57.6,b:55, fv:[4,12], ff:[-80,4], ffv:[-10,-3], na:{t:[28,24], k:1}},
      {rx:40, s:-57.6,t:-57.6,b:60, fv:[4,12], ff:[-80,4], ffv:[-10,-3], na:{t:[32,20], k:1}}],
    cues:['Kneel, front leg straight, toes up','Hinge forward with a flat back','Switch legs halfway']},
  childpose:{name:'Child’s Pose', tag:'Cool-down', tempo:6, keys:[
      {rx:-40, ay:4, fv:[-12,-2], s:90,t:-70,b:97, na:{t:[72,4]}},
      {rx:-40, ay:4, fv:[-12,-2], s:90,t:-70,b:100, na:{t:[74,4]}}],
    cues:['Sit back on your heels','Reach your arms long in front','Breathe into your back']},
  cobra:{name:'Cobra Stretch', tag:'Cool-down', tempo:6, keys:[
      {rx:-80, ay:5, fv:[-12,-1], ffv:[-12,-1], s:90,t:90,b:62, na:{t:[58,5], k:1}},
      {rx:-80, ay:5, fv:[-12,-1], ffv:[-12,-1], s:90,t:90,b:58, na:{t:[58,5], k:1}}],
    cues:['Lie face down, hands under shoulders','Press your chest up, hips stay down','Relax your shoulders away from ears']},
  chest:{name:'Chest Opener', tag:'Cool-down', tempo:5, keys:[
      {b:-4, na:{u:-32,l:-32}},
      {b:-6, na:{u:-40,l:-40}}],
    cues:['Clasp your hands behind your back','Lift your chest and draw the arms back','Breathe slowly']},
  tristretch:{name:'Overhead Triceps Stretch', tag:'Cool-down', tempo:5, sided:true, keys:[
      {na:{u:165,l:330}, fa:{t:[7,174]}},
      {na:{u:168,l:334}, fa:{t:[6,176]}}],
    cues:['Reach one hand down your back','Gently press the elbow with the other hand','Switch arms halfway']},
  upperback:{name:'Upper-Back Stretch', tag:'Cool-down', tempo:5, keys:[
      {b:6, na:{u:86,l:88}},
      {b:10, na:{u:84,l:86}}],
    cues:['Clasp your hands in front','Push them away and round your upper back','Tuck your chin, breathe into the shoulder blades']}
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
  hinge:[17,-5,-17,5], armswing:[18,18,-18,-18], hipstretch:[18,17,-18,-17], fold:[15,9,-15,-9],
  oneswing:[13,4,-17,-17,'one'], sldl:[17,10,-17,-14,'one'], suitcase:[18,19,-18,-19,'one'], clean:[19,15,-17,-17,'one'],
  cleanpress:[19,15,-17,-17,'one'], kbgm:[13,5,-13,-5,'two'], slbridge:[19,21,-19,-21], splitsq:[13,5,-13,-5,'two'],
  racksquat:[19,15,-17,-17,'one'], pushpress:[19,15,-17,-17,'one'], kneelpress:[19,15,-17,-17,'one'], hornrow:[16,5,-16,-5,'two'],
  gfloorpress:[12,4,-12,-4,'two'], skull:[11,4,-11,-4,'two'], hammer:[16,16,-16,-16,'one'], frontraise:[13,5,-13,-5,'two'],
  situp:[13,5,-13,-5,'two'], climber:[23,20,-23,-20],
  march:[17,15,-17,-15], bwlunge:[17,-5,-17,5], bwbridge:[19,21,-19,-21], pike:[23,20,-23,-20],
  quadstretch:[18,18,-15,-12], kneehug:[16,10,-16,-10], hamstretch:[16,12,-16,-12], childpose:[20,18,-20,-18],
  cobra:[22,20,-22,-20], chest:[16,4,-16,-4], tristretch:[10,-2,-14,8], upperback:[16,3,-16,-3],
  halo:[20,4,-20,-4,'two'], standpullover:[12,4,-12,-4,'two'], kneepush:[23,20,-23,-20], superman:[16,14,-16,-14],
  birddog:[20,18,-20,-18], bwsplit:[17,-5,-17,5], bwsldl:[17,12,-17,-12], crunch:[13,5,-13,-5]
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
  const T = G.T, P = G.fig.P, J = solve(p), z = p.zc || ZC[ex.id] || [17,17,-17,-17];
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
    const bz = z[5] ?? (z[4] === 'one' ? z[1] : 0);
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

/* Each day has its own warm-up and cool-down and several routines that rotate.
   - Warm-up: dynamic, bodyweight (raise heart rate, then mobilise and activate what the
     day trains). Squats and good mornings are staples. The 20-min format uses the first 4.
   - Routines: 6 moves; the 20-min format uses the first 5, so the 6th is a finisher (often
     core). Explosive moves (swings, cleans, push press) come first, while you're fresh.
     Each day's staple lifts appear in every routine; the rest rotate.
   - Cool-down: static stretches for the muscles that day trained, held about 30 s
     (20 s each side for one-sided stretches). The 20-min format uses the first 3. */
const WORKOUTS = [
  {id:'A', name:'Hinge Day', focus:'Swings, deadlifts and glutes — the backbone of kettlebell training.',
    warm:['march','hinge','bwsquat','bwbridge','armswing'],
    cool:['fold','hipstretch','kneehug','childpose'],
    routines:[
      {name:'Swing & Deadlift', moves:['swing','deadlift','row','lunge','bridge','plank']},
      {name:'Single-Leg', moves:['swing','sldl','kbgm','slbridge','hornrow','plank']},
      {name:'Power Hinge', moves:['oneswing','clean','deadlift','slbridge','row','climber']},
      {name:'Strength Hinge', moves:['deadlift','swing','suitcase','kbgm','bridge','plank']}]},
  {id:'B', name:'Push & Pull', focus:'Upper body: pressing, rowing and pulling.',
    warm:['armswing','bwsquat','hinge','pike','march'],
    cool:['chest','childpose','tristretch','upperback'],
    routines:[
      {name:'Classic', moves:['press','row','pushup','floorpress','highpull','pullover']},
      {name:'Kneeling Strength', moves:['kneelpress','hornrow','pushup','gfloorpress','highpull','plank']},
      {name:'Power Press', moves:['pushpress','row','pushup','floorpress','frontraise','pullover']},
      {name:'Volume', moves:['kneelpress','row','pushup','gfloorpress','hornrow','pullover']}]},
  {id:'C', name:'Legs & Core', focus:'Squats and lunges, finished with core work.',
    warm:['march','bwsquat','bwlunge','hinge','bwbridge'],
    cool:['quadstretch','hipstretch','cobra','hamstretch'],
    routines:[
      {name:'Squat & Lunge', moves:['goblet','lunge','swing','bridge','pullover','plank']},
      {name:'Split Stance', moves:['goblet','splitsq','suitcase','slbridge','situp','plank']},
      {name:'Balance & Core', moves:['goblet','lunge','sldl','bridge','situp','climber']},
      {name:'Front Rack', moves:['goblet','racksquat','lunge','bridge','pullover','climber']}]},
  {id:'D', name:'Full Body', focus:'Big compound moves that hit everything.',
    warm:['march','bwsquat','hinge','pike','bwlunge'],
    cool:['fold','quadstretch','chest','childpose'],
    routines:[
      {name:'Classic', moves:['thruster','swing','row','pushup','lunge','tricep']},
      {name:'Clean & Press', moves:['cleanpress','goblet','swing','pushup','hornrow','climber']},
      {name:'Athletic', moves:['thruster','clean','splitsq','row','pushup','situp']},
      {name:'Conditioning', moves:['swing','thruster','lunge','hornrow','pushpress','plank']}]},
  {id:'E', name:'Power & Arms', focus:'Explosive hips plus shoulders and arms.',
    warm:['armswing','hinge','bwsquat','pike','march'],
    cool:['tristretch','chest','childpose','fold'],
    routines:[
      {name:'Classic', moves:['swing','highpull','press','curl','tricep','floorpress']},
      {name:'One-Arm Power', moves:['oneswing','pushpress','hammer','skull','highpull','frontraise']},
      {name:'Clean & Arms', moves:['clean','press','curl','tricep','swing','gfloorpress']},
      {name:'Pump', moves:['swing','cleanpress','hammer','skull','pushup','frontraise']},
      // Rep-based complex: each set is ~10 halos each way, then ~10 pullovers.
      {name:'Halo Complex', note:'Inspired by Garrett Merrill: each set is 10 halos one way, 10 the other, then 10 pullovers.',
        moves:['halo','standpullover'], reps:{halo:'10 each way', standpullover:'10 reps'},
        format:{20:{n:2, rounds:10, work:[40,30], rest:5, roundRest:20}, 30:{n:2, rounds:15, work:[40,30], rest:5, roundRest:20}}}]},
  // Not in the A–E rotation: pick it for an easier day or when the kettlebell stays home.
  {id:'F', name:'Bodyweight', extra:true, bw:true, focus:'No kettlebell needed: an easier day, or for when the bell stays home.',
    warm:['march','bwsquat','hinge','armswing','bwbridge'],
    cool:['fold','hipstretch','childpose','quadstretch'],
    routines:[
      {name:'Easy Day', moves:['bwsquat','kneepush','bwbridge','bwlunge','birddog','plank'],
        format:{20:{work:30, rest:30}, 30:{work:35, rest:25}}},
      {name:'Lower Body', moves:['bwsquat','bwsplit','slbridge','bwsldl','superman','crunch']},
      {name:'Upper & Core', moves:['pushup','superman','pike','birddog','climber','plank']},
      {name:'Full Body', moves:['bwsquat','pushup','bwlunge','superman','climber','plank']}]}
];
const ROTATION = WORKOUTS.filter(w => !w.extra);
// warmN/coolN: how many warm-up moves / stretches; sw: seconds to change position between them.
const FORMAT = {
  20:{warmN:4, warmSec:30, n:5, rounds:3, work:40, rest:20, roundRest:30, coolN:3, sw:5},
  30:{warmN:5, warmSec:35, n:6, rounds:4, work:45, rest:15, roundRest:20, coolN:4, sw:5}
};
const stretchSec = id => EX[id].sided ? 40 : 30;
// Which routine of a day comes next: the one after the last you did, else by count.
function routineIndex(w){
  const mine = state.log.filter(l => l.w === w.id).sort((a,b) => a.d < b.d ? -1 : 1);
  const last = mine[mine.length-1];
  const i = last && Number.isInteger(last.v) ? last.v + 1 : mine.length;
  return i % w.routines.length;
}
// A routine can override the day's timing (format[dur]) — e.g. the halo complex's 10 sets.
const fmt = (R, dur) => Object.assign({}, FORMAT[dur], R.format && R.format[dur]);
function buildSession(w, dur, ri){
  const R = w.routines[ri], F = fmt(R, dur), segs = [];
  const warm = w.warm.slice(0, F.warmN), cool = w.cool.slice(0, F.coolN), moves = R.moves.slice(0, F.n);
  const workSec = i => Array.isArray(F.work) ? F.work[i] : F.work;
  const word = R.reps ? 'Set' : 'Round';
  warm.forEach((m,i) => {
    if (i) segs.push({kind:'switch', ph:'warm', ex:m, sec:F.sw, label:'Switch'});
    segs.push({kind:'warm', ph:'warm', ex:m, sec:F.warmSec, label:`Warm-up ${i+1} of ${warm.length}`});
  });
  segs.push({kind:'rest', ph:'main', ex:moves[0], sec:10, label: w.bw ? 'Warm-up done · Get ready' : 'Warm-up done · Grab your kettlebell'});
  for (let r=1; r<=F.rounds; r++){
    moves.forEach((m,i)=>{
      const reps = R.reps && R.reps[m] ? ` · ${R.reps[m]}` : ` · Move ${i+1} of ${moves.length}`;
      segs.push({kind:'work', ph:'main', ex:m, sec:workSec(i), label:`${word} ${r} of ${F.rounds}${reps}`});
      const last = i === moves.length-1;
      if (!last) segs.push({kind: F.rest <= F.sw ? 'switch' : 'rest', ph:'main', ex:moves[i+1], sec:F.rest, label: F.rest <= F.sw ? 'Switch' : `${word} ${r} of ${F.rounds} · Rest`});
      else if (r < F.rounds) segs.push({kind:'rest', ph:'main', ex:moves[0], sec:F.roundRest, label:`${word} ${r} done · Catch your breath`});
    });
  }
  segs.push({kind:'rest', ph:'cool', ex:cool[0], sec:10, label:'Main set done · Cool-down next'});
  cool.forEach((m,i) => {
    if (i) segs.push({kind:'switch', ph:'cool', ex:m, sec:F.sw, label:'Switch'});
    segs.push({kind:'cool', ph:'cool', ex:m, sec:stretchSec(m), label:`Cool-down ${i+1} of ${cool.length}`});
  });
  return segs;
}
const isBreak = s => s.kind === 'rest' || s.kind === 'switch';
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
    log: Array.isArray(d.log) ? d.log.filter(x => x && /^\d{4}-\d\d-\d\d$/.test(x.d) && WORKOUTS.some(w => w.id === x.w)).map(x => Object.assign({d:x.d, w:x.w, m:+x.m || 0}, Number.isInteger(x.v) && x.v >= 0 && x.v < 10 ? {v:x.v} : {})) : [],
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
  if (!same){ state = cleanState(parse(lsGet(ck())) || DEFAULT); dur = state.dur; chosen = null; chosenR = null; preview = null; pulled = false; }
  gate(recovering); renderAll();
  if (!pulled) pull();
}
function dropAccount(){
  if (uid){ lsDel(ck()); lsDel(ck() + '-dirty'); }
  lsDel(LSK + '-uid'); lsDel(LSK + '-email');
  uid = null; userEmail = ''; pulled = false; storeMode = 'pending';
  state = cleanState(DEFAULT); dur = state.dur; chosen = null; chosenR = null; preview = null;
  if (recovering) showReset(false);
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
  if (authErr){ authMsg(authErr + ' If this was a password reset, tap “Forgot password?” again for a new link.'); history.replaceState(null, '', location.pathname + location.search); }
  let resetLink = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev, session) => {
    // Supabase advises against awaiting its own calls inside this callback, so defer the work.
    setTimeout(() => {
      const u = session && session.user;
      if (u){
        if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
        adopt(u);
        if (ev === 'PASSWORD_RECOVERY' || resetLink){ resetLink = false; showReset(true); }
      } else if (ev === 'SIGNED_OUT' || (ev === 'INITIAL_SESSION' && navigator.onLine)){
        if (uid) dropAccount(); else gate(true);
      }
      // Offline with no session available: keep working from the cached copy; it syncs later.
    });
  });
  window.addEventListener('online', () => { if (uid) pull(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && uid && !P){ pulled = false; pull(); } });
}

/* Sign-in screen: email + password, with "Create account" and "Forgot password?". Password
   sign-in happens inside the page, so it works in an iPhone home-screen app (which doesn't share
   storage with Safari). A reset link opens wherever the email is tapped; set the new password
   there, then sign in with it anywhere. */
let authMode = 'in', recovering = false;
const HERE = () => location.origin + location.pathname;
function authMsg(t, ok){ const m = $('authMsg'); m.textContent = t || ''; m.classList.toggle('ok', !!ok); }
function gate(on){ document.body.classList.toggle('gate', on); $('auth').hidden = !on; }
function friendly(err){
  const m = (err && err.message) || 'Something went wrong. Try again.';
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Check them, or tap “Forgot password?”.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the message we sent and tap the link, then sign in here.';
  if (/already registered/i.test(m)) return 'There’s already an account with that email. Switch to “Sign in”.';
  if (/rate limit/i.test(m)) return 'Too many emails sent. Wait a while and try again.';
  return m;
}
function setAuthMode(m){
  authMode = m;
  $('authModes').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
  $('authTitle').textContent = m === 'up' ? 'Create account' : 'Sign in';
  $('authGo').textContent = m === 'up' ? 'Create account' : 'Sign in';
  $('authPass').autocomplete = m === 'up' ? 'new-password' : 'current-password';
  $('authForgot').hidden = m === 'up';
  authMsg('');
}
function showReset(on){
  recovering = on;
  $('authForm').hidden = on; $('authModes').hidden = on; $('authReset').hidden = !on;
  if (on){ $('authTitle').textContent = 'New password'; $('authResetEmail').textContent = userEmail; authMsg(''); gate(true); $('authNewPass').focus(); }
  else setAuthMode(authMode);
}
function wireAuth(){
  $('authModes').querySelectorAll('button').forEach(b => b.onclick = () => setAuthMode(b.dataset.m));
  $('authForm').onsubmit = async e => {
    e.preventDefault(); if (!sb) return;
    const email = $('authEmail').value.trim(), password = $('authPass').value;
    const btn = $('authGo'); btn.disabled = true; authMsg(authMode === 'up' ? 'Creating your account…' : 'Signing in…');
    const res = authMode === 'up'
      ? await sb.auth.signUp({email, password, options: {emailRedirectTo: HERE()}})
      : await sb.auth.signInWithPassword({email, password});
    btn.disabled = false;
    if (res.error){ authMsg(friendly(res.error)); return; }
    if (authMode === 'up' && !res.data.session){ setAuthMode('in'); authMsg('Almost done: we emailed you a confirmation link. Tap it, then sign in here with your password.', true); return; }
    $('authPass').value = ''; authMsg('');
  };
  $('authForgot').onclick = async () => {
    if (!sb) return;
    const email = $('authEmail').value.trim();
    if (!email){ authMsg('Type your email above first, then tap “Forgot password?”.'); $('authEmail').focus(); return; }
    authMsg('Sending…');
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: HERE()});
    authMsg(error ? friendly(error) : 'Check your email for a reset link. On iPhone it opens in Safari: set the new password there, then sign in here.', !error);
  };
  $('authReset').onsubmit = async e => {
    e.preventDefault(); if (!sb) return;
    authMsg('Saving…');
    const {error} = await sb.auth.updateUser({password: $('authNewPass').value});
    if (error){ authMsg(friendly(error)); return; }
    $('authNewPass').value = ''; showReset(false); gate(false);
  };
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
// Rotation A–E; Bodyweight days (extra) don't move it along.
function nextWorkout(){ const rot = state.log.filter(l => ROTATION.some(w => w.id === l.w)); const last = rot.sort((a,b)=>a.d<b.d?-1:1).pop();
  if (last){ const i = ROTATION.findIndex(w=>w.id===last.w); if (i>=0) return ROTATION[(i+1)%ROTATION.length]; }
  return ROTATION[rot.length % ROTATION.length]; }
function nextPlannedDate(from){ for (let i=0;i<14;i++){ const d = new Date(from); d.setDate(d.getDate()+i); if (state.days.includes(d.getDay()) && !logFor(ymd(d))) return d; } return null; }

/* ============ Today view ============ */
let chosen = null, chosenR = null, dur = state.dur, preview = null;
// The workout day and routine Start will run: your picks, else what's up next.
function plan(){ const w = chosen || nextWorkout(); const ri = chosenR ?? routineIndex(w); return {w, ri, R: w.routines[ri]}; }
const $ = id => document.getElementById(id);
const hero = makeView($('heroStage'), {interactive:true, label:'3D coach demonstrating the selected move'});
const minis = [];
function setPreview(id){
  preview = id; hero.set(EX[id]);
  $('heroName').textContent = EX[id].name; $('heroTag').textContent = EX[id].tag;
  document.querySelectorAll('#sessMoves button').forEach(b => b.setAttribute('aria-current', b.dataset.ex === id ? 'true':'false'));
}
function renderToday(){
  const {w, ri, R} = plan();
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
  const F = fmt(R, dur);
  $('sessSpec').textContent = R.reps
    ? `${F.rounds} sets · ${R.moves.map(m => `${R.reps[m]} ${EX[m].name.toLowerCase()}`).join(' + ')}`
    : `${F.n} moves × ${F.rounds} rounds · ${F.work}s on / ${F.rest}s off`;
  $('routineNote').textContent = R.note || ''; $('routineNote').hidden = !R.note;
  ['d20','d30'].forEach(id => $(id).setAttribute('aria-pressed', String(+$(id).dataset.d === dur)));
  const pr = $('pickR'); pr.textContent = '';
  const upR = routineIndex(w);
  w.routines.forEach((r, j) => {
    const b = document.createElement('button'); b.setAttribute('aria-pressed', String(j === ri));
    b.textContent = r.name;
    if (j === upR){ const s = document.createElement('span'); s.className = 'up'; s.textContent = 'up next'; b.appendChild(s); }
    b.addEventListener('click', () => { chosenR = (j === upR) ? null : j; preview = null; renderToday(); });
    pr.appendChild(b);
  });
  $('routineLbl').textContent = `Routine ${ri+1} of ${w.routines.length}`;
  const names = ids => ids.map(id => EX[id].name).join(', ');
  $('sessWarm').textContent = names(w.warm.slice(0, F.warmN));
  $('sessCool').textContent = names(w.cool.slice(0, F.coolN));
  const ol = $('sessMoves'); ol.textContent = '';
  R.moves.slice(0, F.n).forEach((m,i) => {
    const li = document.createElement('li'); const b = document.createElement('button'); b.dataset.ex = m;
    b.innerHTML = `<span class="ix">${i+1}</span><span class="nm"></span><span class="tg"></span>`;
    b.querySelector('.nm').textContent = EX[m].name; b.querySelector('.tg').textContent = EX[m].tag;
    b.addEventListener('click', () => setPreview(m));
    li.appendChild(b); ol.appendChild(li);
  });
  const mv = R.moves.slice(0,F.n);
  if (!preview || !mv.includes(preview)) setPreview(mv[0]); else setPreview(preview);
  const nxt = nextWorkout();
  const pk = $('pickW'); pk.textContent = '';
  WORKOUTS.forEach(x => {
    const b = document.createElement('button'); b.setAttribute('aria-pressed', String(x.id === w.id));
    b.textContent = x.extra ? `${x.name} (no bell)` : `${x.id} · ${x.name}`;
    if (x.id === nxt.id){ const s = document.createElement('span'); s.className='up'; s.textContent='up next'; b.appendChild(s); }
    b.addEventListener('click', () => { chosen = (x.id === nxt.id) ? null : x; chosenR = null; preview = null; renderToday(); });
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
      else { const nw = nextWorkout(); state.log.push({d:k, w:nw.id, m:state.dur, v:routineIndex(nw)}); }
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
    li.querySelector('b').textContent = `${l.w} · ${w.name}` + (w.routines && w.routines[l.v] ? ` · ${w.routines[l.v].name}` : ''); li.querySelector('span').textContent = `${DOW[dt.getDay()]} ${MON[m-1].slice(0,3)} ${d} · ${l.m} min`; h.appendChild(li); });
  renderAcct();
}
$('calPrev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); renderSched(); };
$('calNext').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); renderSched(); };
$('dd20').onclick = () => { state.dur = 20; dur = 20; save(); };
$('dd30').onclick = () => { state.dur = 30; dur = 30; save(); };

/* ============ Moves library ============ */
const libIO = ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(e => { if (e.target._view) e.target._view.visible = e.isIntersecting; }), {rootMargin:'100px'}) : null;
const grp = ex => ex.tag === 'Warm-up' ? 1 : ex.tag === 'Cool-down' ? 2 : 0;
function renderLib(){
  const lib = $('lib'); if (lib.childElementCount) return;
  // Every move: main lifts first, then warm-ups, then stretches (EX is defined in that order).
  const order = Object.keys(EX).sort((a,b) => grp(EX[a]) - grp(EX[b]));
  order.forEach(id => {
    const ex = EX[id]; const card = document.createElement('article'); card.className = 'mv';
    const st = document.createElement('div'); st.className = 'st'; card.appendChild(st);
    const m = makeView(st, {az:32, el:10, label:'Coach demonstrating ' + ex.name}); m.set(ex); minis.push(m); m.visible = false; libIO && libIO.observe(st); st._view = m;
    const bd = document.createElement('div'); bd.className = 'bd';
    bd.innerHTML = `<div class="meta"><span></span><span class="num"></span></div><h3></h3><ul></ul><a target="_blank" rel="noopener">Watch a real person do it ↗</a>`;
    bd.querySelector('.meta span').textContent = ex.tag;
    bd.querySelector('.meta .num').textContent = ex.sided ? (ex.switchCue ? 'each direction' : 'each side') : `${ex.tempo.toFixed(1)}s / rep`;
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

/* ============ Invite + install ============ */
// Invite uses the phone's own share sheet (Messages, WhatsApp, email...), so contacts and phone
// numbers never pass through the app. Web apps can't install themselves, so people who open the
// link get a banner: a real Install button on Android/Chrome, Add to Home Screen steps on iPhone.
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
let toastT = 0;
function toast(t){ const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3500); }
async function invite(){
  const text = 'Work out with me on 1 Bell: 20–30 minute kettlebell workouts with a 3D coach. Open this link, then add it to your home screen:';
  if (navigator.share){
    try { await navigator.share({title: '1 Bell', text, url: APP_URL}); return; }
    catch(e){ if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text + ' ' + APP_URL); toast('Invite copied. Paste it into a text or email.'); }
  catch(e){ window.prompt('Copy this invite link:', APP_URL); }
}
$('inviteBtn').onclick = invite;

const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_APP = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok/i.test(navigator.userAgent);
const DISMISS_KEY = LSK + '-install-dismissed';
let installEvt = null;
function installDismissed(){ const t = +lsGet(DISMISS_KEY) || 0; return Date.now() - t < 14 * 864e5; }
function showInstall(){
  if (STANDALONE || installDismissed()) return;
  const txt = $('installTxt'), go = $('installGo');
  if (installEvt){
    txt.innerHTML = '<b>Install 1 Bell</b><span>Opens from your home screen and works offline.</span>';
    go.hidden = false;
  } else if (IOS){
    txt.innerHTML = IN_APP
      ? '<b>Open in Safari to install</b><span>Tap ⋯ or the compass icon, choose “Open in Safari”, then add it to your home screen.</span>'
      : '<b>Add 1 Bell to your home screen</b><span>Tap <svg class="ios-share" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3l4 4-1.4 1.4L13 6.8V15h-2V6.8L9.4 8.4 8 7zM5 10h4v2H7v8h10v-8h-2v-2h4v12H5z"/></svg> Share, then “Add to Home Screen”.</span>';
    go.hidden = true;
  } else return;   // desktop browsers without an install prompt: no banner
  $('installBar').hidden = false;
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(); });
window.addEventListener('appinstalled', () => { $('installBar').hidden = true; installEvt = null; });
$('installGo').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch(e){}
  installEvt = null; $('installBar').hidden = true;
};
$('installX').onclick = () => { lsSet(DISMISS_KEY, String(Date.now())); $('installBar').hidden = true; };
setTimeout(showInstall, 1500);

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
  const {w, ri} = plan();
  const segs = buildSession(w, dur, ri);
  P = {w, ri, dur, segs, i:0, el:0, paused:false, last:performance.now(), beeped:{}, done:0};
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume && audio.resume(); } catch(e){}
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => wake = l).catch(()=>{}); } catch(e){}
  $('player').hidden = false; $('pIn').hidden = false; $('pDone').hidden = true;
  document.body.style.overflow = 'hidden';
  $('pTitle').innerHTML = ''; const b = document.createElement('b'); b.textContent = `Workout ${w.id} · ${w.name}`; $('pTitle').appendChild(b);
  $('pTitle').append(` · ${dur} min`);
  buildProgress(segs);
  enterSeg(0);
}
/* Progress bar: one group per phase (warm-up / main set / cool-down), each with an icon and
   label, segments sized by their real duration, rests drawn thinner than work. */
const PHASES = {
  warm: {name:'Warm-up',   icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c1 3.5-1.5 5-1.5 7.5A2.5 2.5 0 0 0 13 12c1.4 0 2.3-1 2.5-2.3C17.3 11.3 18 13.4 18 15a6 6 0 0 1-12 0c0-4.6 4.4-6.6 6-13z"/></svg>'},
  main: {name:'Main set',  icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 2h8a3 3 0 0 1 3 3v2a3 3 0 0 1-1 2.2A7.5 7.5 0 1 1 6 9.2 3 3 0 0 1 5 7V5a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v2c0 .2 0 .4.2.5A7.5 7.5 0 0 1 12 6.5c1.8 0 3.5.6 4.8 1.6l.2-.1V5a1 1 0 0 0-1-1z"/></svg>'},
  cool: {name:'Cool-down', icon:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/></svg>'}
};
const phaseOf = s => s.ph || (s.kind === 'warm' ? 'warm' : s.kind === 'cool' ? 'cool' : 'main');
const mmss = t => `${Math.floor(t/60)}:${pad(Math.floor(t%60))}`;
function buildProgress(segs){
  const bar = $('pBar'); bar.textContent = '';
  P.bars = []; P.groups = {}; P.starts = []; P.total = 0; P.leftShown = -1;
  let grp = null, key = null;
  segs.forEach(s => {
    P.starts.push(P.total); P.total += s.sec;
    const k = phaseOf(s);
    if (k !== key){
      key = k;
      grp = document.createElement('div'); grp.className = 'ph ph-' + k; grp._sec = 0;
      grp.innerHTML = `<div class="ph-l">${PHASES[k].icon}<span>${PHASES[k].name}</span></div><div class="ph-segs"></div>`;
      bar.appendChild(grp); P.groups[k] = grp;
    }
    grp._sec += s.sec; grp.style.flexGrow = grp._sec;
    const i = document.createElement('i'); i.style.flexGrow = s.sec; if (isBreak(s)) i.className = 'rest';
    grp.querySelector('.ph-segs').appendChild(i); P.bars.push(i);
  });
}
function renderProgress(){
  const s = P.segs[P.i], k = phaseOf(s);
  const done = P.starts[P.i] + Math.min(P.el, s.sec), left = Math.max(0, Math.ceil(P.total - done));
  const cur = P.bars[P.i]; if (cur) cur.style.setProperty('--p', Math.min(100, P.el/s.sec*100).toFixed(1)+'%');
  if (left === P.leftShown) return;
  P.leftShown = left;
  $('pLeft').textContent = `${mmss(Math.floor(done))} done · ${mmss(left)} left`;
  $('pBar').setAttribute('aria-valuenow', String(Math.round(done / P.total * 100)));
  $('pBar').setAttribute('aria-valuetext', `${PHASES[k].name}, ${mmss(left)} left`);
}
function enterSeg(i){
  P.i = i; P.el = 0; P.beeped = {};
  const s = P.segs[i]; const ex = EX[s.ex];
  const isRest = isBreak(s), isSwitch = s.kind === 'switch';
  pm.set(ex, isRest ? 0.6 : 1);
  $('pPhase').textContent = isSwitch ? 'Switch · next up' : isRest ? 'Rest · next up' : s.kind === 'warm' ? 'Warm-up' : s.kind === 'cool' ? 'Cool-down' : 'Work';
  $('pPhase').className = 'p-phase' + (isRest ? ' rest' : '');
  $('pName').textContent = ex.name;
  $('pRound').textContent = s.label;
  const cues = $('pCues'); cues.textContent = ''; ex.cues.forEach(c => { const li = document.createElement('li'); li.textContent = c; cues.appendChild(li); });
  const nx = P.segs.slice(i+1).find(x => !isBreak(x));
  $('pNext').innerHTML = '';
  if (isSwitch){ $('pNext').append('Get into position.'); }
  else if (isRest){ $('pNext').append('Get set. Starts when the timer hits zero.'); }
  else if (nx){ $('pNext').append('Next: '); const b = document.createElement('b'); b.textContent = EX[nx.ex].name; $('pNext').appendChild(b); }
  else $('pNext').append('Last one!');
  $('pSide').hidden = true;
  P.bars.forEach((b,j) => { b.classList.toggle('past', j < i); b.classList.toggle('cur', j === i); b.style.removeProperty('--p'); });
  const k = phaseOf(s);
  for (const g in P.groups) P.groups[g].classList.toggle('on', g === k);
  $('pPhaseName').className = 'prog-ph ph-' + k;
  $('pPhaseName').innerHTML = PHASES[k].icon; $('pPhaseName').append(PHASES[k].name);
  P.leftShown = -1; renderProgress();
  if (isSwitch) say(`Next, ${ex.name}.`); else if (isRest) say(`Rest. Next, ${ex.name}.`); else say(ex.name + (ex.sided ? `. ${ex.switchCue || 'Switch sides'} halfway.` : ''));
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
  renderProgress();
  if (!P.paused){
    for (const n of [3,2,1]) if (rem <= n && rem > n-1 && !P.beeped[n]){ P.beeped[n] = 1; beep(660, 110); }
    const ex = EX[s.ex];
    if (ex.sided && !isBreak(s) && P.el >= s.sec/2 && !P.beeped.h){ P.beeped.h = 1; beep(990, 160); beep(990, 160); say(ex.switchCue || 'Switch sides'); $('pSide').textContent = ex.switchCue || 'Switch sides'; $('pSide').hidden = false; }
    if (P.el >= s.sec){ if (!isBreak(s)) P.done += s.sec; if (P.i < P.segs.length-1) enterSeg(P.i+1); else finish(true); }
  }
}
function finish(complete){
  const w = P.w; const tk = ymd(today());
  const worked = P.done + (!isBreak(P.segs[P.i]) ? Math.min(P.el, P.segs[P.i].sec) : 0);
  const frac = worked / P.segs.filter(s=>!isBreak(s)).reduce((a,s)=>a+s.sec,0);
  const minutes = Math.round(totalSec(P.segs.slice(0, P.i+1))/60) || 1;
  $('pIn').hidden = true; $('pDone').hidden = false;
  try { wake && wake.release(); } catch(e){} wake = null;
  if (complete || frac >= 0.5){
    state.log = state.log.filter(l => l.d !== tk);
    state.log.push({d:tk, w:w.id, m: complete ? P.dur : minutes, v:P.ri});
    chosen = null; chosenR = null; save();
    $('fTitle').textContent = complete ? 'Nice work.' : 'Good session.';
    $('fText').textContent = `Workout ${w.id} · ${w.name} (${w.routines[P.ri].name}) is logged for today. ${nextPlannedLine()}`;
    beep(1320,200); setTimeout(()=>beep(1760,300),220); say(complete ? 'Workout complete. Nice work.' : 'Session logged.');
  } else {
    $('fTitle').textContent = 'Ended early.';
    $('fText').textContent = 'Less than half the session was done, so it was not logged. Start again any time.';
  }
}
function nextPlannedLine(){ const t = today(); t.setDate(t.getDate()+1); const d = nextPlannedDate(t); const n = nextWorkout();
  const nm = `${n.name}: ${n.routines[routineIndex(n)].name}`;
  return d ? `Next up: Workout ${n.id} (${nm}) on ${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}.` : `Next up: Workout ${n.id} (${nm}).`; }
function closePlayer(){ $('player').hidden = true; document.body.style.overflow = ''; try{ speechSynthesis.cancel(); }catch(e){} P = null; renderAll(); }
$('startBtn').onclick = startWorkout;
$('pPause').onclick = () => { if (!P) return; P.paused = !P.paused; $('pPause').textContent = P.paused ? 'Resume' : 'Pause'; if (P.paused) try{speechSynthesis.cancel()}catch(e){} };
$('pSkip').onclick = () => { if (!P) return; const s = P.segs[P.i]; if (!isBreak(s)) P.done += Math.min(P.el, s.sec); if (P.i < P.segs.length-1) enterSeg(P.i+1); else finish(true); };
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
