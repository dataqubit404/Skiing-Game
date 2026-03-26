const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize(); window.addEventListener('resize', resize);

const startScreen = document.getElementById('startScreen'), hud = document.getElementById('hud');
const scoreValue = document.getElementById('scoreValue'), distanceValue = document.getElementById('distanceValue');
const comboDisplay = document.getElementById('comboDisplay'), trickText = document.getElementById('trickText');
const pauseScreen = document.getElementById('pauseScreen'), gameOverScreen = document.getElementById('gameOverScreen');
const finalScore = document.getElementById('finalScore'), finalDistance = document.getElementById('finalDistance');
const finalCoins = document.getElementById('finalCoins'), crashReason = document.getElementById('crashReason');

let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playTone(freq, type, dur, vol=0.15, dly=0) {
  if (!audioCtx) return; const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination); osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + dly);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + dly + dur);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime + dly);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dly + dur);
  osc.start(audioCtx.currentTime + dly); osc.stop(audioCtx.currentTime + dly + dur + 0.05);
}
function playJump() { playTone(320, 'sine', 0.25, 0.18); }
function playLand() { playTone(180, 'sine', 0.15, 0.2); }
function playCoin() { playTone(880, 'sine', 0.1, 0.12); playTone(1100, 'sine', 0.08, 0.1, 0.05); }
function playTrick() { [660,880,1100].forEach((f,i)=> playTone(f,'sine',0.12,0.1,i*0.06)); }
function playCrash() { playTone(150,'sawtooth',0.3,0.3); playTone(80,'triangle',0.4,0.3,0.05); }
function playThunder() { playTone(60, 'sawtooth', 0.8, 0.4); playTone(40, 'square', 1.2, 0.3, 0.1); }

let state = 'start', score = 0, distance = 0, combo = 1, comboTimer = 0;
let sessionCoins = 0, frameCount = 0, dayTime = 0.15, lastTime = 0, thunderAlpha = 0;

const cam = { x: 0, y: 0, shake: 0 };
const ZOOM = 0.5; 
const input = { jumpPressed: false, lastJumpTime: 0 };

const CHUNK_W = 800;
const terrain = { points: [] };
let chasms = [], objects = [], rain = [];
let objSpawnX = 600;

// Generate random stars once
const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random() * 0.7, size: Math.random() * 2 }));

function genPoint(x, prevY, prevSlope) {
  const slopeChange = (Math.random() - 0.45) * 0.15;
  let slope = Math.max(0.1, Math.min(0.65, prevSlope + slopeChange));
  return { x, y: prevY + slope * 80, slope };
}

function initTerrain() {
  terrain.points = []; chasms = []; objects.length = 0; objSpawnX = 600;
  let y = 0, slope = 0.2;
  for (let x = -100; x < (canvas.width/ZOOM) + CHUNK_W * 2; x += 55) {
    const p = genPoint(x, y, slope); y = p.y; slope = p.slope; terrain.points.push(p);
  }
}

function extendTerrain() {
  const last = terrain.points[terrain.points.length - 1];
  if (last.x < cam.x + (canvas.width/ZOOM) + 2000) {
    let y = last.y, slope = last.slope;
    for (let i = 0; i < 12; i++) {
      const p = genPoint(last.x + (i + 1) * 55, y, slope); y = p.y; slope = p.slope; terrain.points.push(p);
    }
  }
  while (terrain.points.length > 2 && terrain.points[1].x < cam.x - 200) terrain.points.shift();
}

function getTerrainY(wx) {
  for (let i = 1; i < terrain.points.length - 2; i++) {
    if (terrain.points[i].x <= wx && terrain.points[i + 1].x > wx) {
      const t = (wx - terrain.points[i].x) / (terrain.points[i + 1].x - terrain.points[i].x);
      const p0 = terrain.points[i-1], p1 = terrain.points[i], p2 = terrain.points[i+1], p3 = terrain.points[i+2];
      return 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t*t + (-p0.y+3*p1.y-3*p2.y+p3.y)*t*t*t);
    }
  } return 0;
}
function getTerrainAngle(wx) { return Math.atan2(getTerrainY(wx + 5) - getTerrainY(wx - 5), 10); }
function isOverChasm(wx) { return chasms.some(c => wx > c.x && wx < c.x + c.w); }

const player = {
  wx: 0, wy: 0, vx: 0, vy: 0, angle: 0, onGround: false, airTime: 0,
  flips: 0, flipAngle: 0, spinning: false, crashAnim: 0, alive: true, trail: []
};

function resetPlayer() {
  player.wx = 200; player.wy = getTerrainY(200) - 10; player.vx = 8; player.vy = 0; player.angle = 0;
  player.onGround = false; player.airTime = 0; player.flips = 0; player.flipAngle = 0;
  player.spinning = false; player.crashAnim = 0; player.alive = true; player.trail = [];
}

function doJump(high = false) {
  if (!player.alive) return;
  if (player.onGround || player.airTime < 8) {
    player.vy = high ? -10.5 : -7.5; 
    player.onGround = false; player.flipAngle = 0; player.flips = 0; playJump();
  }
}

function updatePlayer(dt) {
  if (!player.alive) { player.crashAnim = Math.min(player.crashAnim + dt * 2.5, 1); return; }

  const terrAngle = getTerrainAngle(player.wx), terrY = getTerrainY(player.wx);
  const overChasm = isOverChasm(player.wx);
  const BASE_SPEED = 8.5;

  if (player.onGround && !overChasm) {
    player.vy = 0; player.wy = terrY - 10; 
    if (player.vx < BASE_SPEED) player.vx += 0.2; 
  } else {
    player.vy += 0.6; player.wy += player.vy; 
    player.onGround = false; 
  }
  
  // Pit Collision Logic
  if (overChasm && player.wy > terrY + 320) return triggerCrash("Fell into a pit");

  if (player.vx > BASE_SPEED) player.vx -= 0.04; 
  player.wx += player.vx;

  if (!overChasm && player.wy >= terrY - 10 && player.vy >= 0) {
    const landAngle = Math.abs(player.angle - terrAngle);
    const normalised = ((landAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (!player.onGround && Math.abs(normalised) > 0.85) return triggerCrash("Bad Landing");
    
    player.wy = terrY - 10;
    if (!player.onGround) {
      playLand();
      if (player.flips > 0) {
        score += player.flips * 150 * combo;
        player.vx += player.flips * 4.5; 
        combo = Math.min(8, combo + player.flips); comboTimer = 180;
        trickText.textContent = `${player.flips}x Flip! Speed Boost!`; trickText.style.opacity = '1';
        setTimeout(() => trickText.style.opacity = '0', 1500); playTrick();
      }
      player.flipAngle = 0; player.flips = 0; player.spinning = false;
    }
    player.onGround = true; player.airTime = 0; player.angle = terrAngle * 0.8 + player.angle * 0.2;
  } else if (!player.onGround) {
    player.airTime += dt;
    if (player.spinning) {
      player.angle += 0.14; player.flipAngle += 0.14;
      if (Math.abs(player.flipAngle) >= Math.PI * 2) { player.flips++; player.flipAngle -= Math.PI * 2; }
    } else player.angle += (0 - player.angle) * 0.04;
  }

  if (player.wy > cam.y + (canvas.height/ZOOM) + 300) triggerCrash("Lost to the Abyss");

  if (player.onGround && frameCount % 2 === 0) {
    player.trail.push({ x: player.wx - 15, y: player.wy + 10, life: 1, size: Math.random() * 4 + 3, vy: -Math.random() * 1.5 });
  }
  player.trail = player.trail.filter(p => { p.life -= 0.04; p.y += p.vy; return p.life > 0; });
}

function triggerCrash(reason = "You crashed") {
  player.alive = false; player.vy = -8; player.onGround = false; cam.shake = 1;
  crashReason.textContent = reason; playCrash();
  setTimeout(() => showGameOver(), 1800);
}

function spawnObjects() {
  while (objSpawnX < cam.x + (canvas.width/ZOOM) + 1000) {
    const r = Math.random();
    if (r < 0.15) {
      // FIX: Smaller gap width (120-220px)
      chasms.push({ x: objSpawnX, w: 120 + Math.random() * 100 });
      objSpawnX += 900;
    } else if (r < 0.45) {
      const count = Math.floor(Math.random() * 5) + 3;
      for (let i = 0; i < count; i++) {
        let cx = objSpawnX + i * 40;
        if (!isOverChasm(cx)) objects.push({ type: 'coin', wx: cx, wy: getTerrainY(cx) - 35, bob: Math.random() * Math.PI * 2 });
      }
      objSpawnX += 800;
    } else {
      const types = ['rock', 'tree', 'log', 'sign'];
      if (!isOverChasm(objSpawnX)) objects.push({ type: types[Math.floor(Math.random() * types.length)], wx: objSpawnX, wy: getTerrainY(objSpawnX), scale: 0.8 + Math.random() * 0.4 });
      objSpawnX += 800;
    }
  }
  for (let i = objects.length - 1; i >= 0; i--) if (objects[i].wx < cam.x - 400) objects.splice(i, 1);
  for (let i = chasms.length - 1; i >= 0; i--) if (chasms[i].x + chasms[i].w < cam.x - 400) chasms.splice(i, 1);
}

function checkCollisions() {
  if (!player.alive) return;
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i], dx = player.wx - o.wx;
    if (o.type === 'coin') {
      const dy = (player.wy - 10) - (o.wy + Math.sin(frameCount * 0.1 + o.bob) * 6);
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) { objects.splice(i, 1); sessionCoins++; score += 50 * combo; playCoin(); }
    } else {
      let hitY = 20 * o.scale, hitX = 15 * o.scale;
      if (o.type === 'tree') hitY = 40; if (o.type === 'log') hitY = 10;
      if (Math.abs(dx) < hitX && Math.abs(player.wy - (o.wy - hitY)) < hitY) triggerCrash("Hit an obstacle");
    }
  }
}

function lerpColor(c1, c2, t) { return [Math.round(c1[0] + (c2[0]-c1[0])*t), Math.round(c1[1] + (c2[1]-c1[1])*t), Math.round(c1[2] + (c2[2]-c1[2])*t)]; }
function rgbStr(c, a=1) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const PALETTE = {
  dawn:  { skyTop:[30,35,45], skyBot:[100,70,80], snow:[210,210,215], mtn:[15,15,18] },
  day:   { skyTop:[160,180,200], skyBot:[230,230,235], snow:[255,255,255], mtn:[25,25,30] },
  dusk:  { skyTop:[40,20,30], skyBot:[180,90,50], snow:[160,140,130], mtn:[10,8,10] },
  night: { skyTop:[5,5,10], skyBot:[15,15,25], snow:[60,60,70], mtn:[2,2,4] },
  storm: { skyTop:[20,25,30], skyBot:[40,45,50], snow:[90,95,100], mtn:[5,5,8] }
};
function getPalette() {
  const t = dayTime % 1; let p1, p2, a;
  if (t < 0.2) { p1 = PALETTE.night; p2 = PALETTE.dawn; a = t/0.2; }
  else if (t < 0.4) { p1 = PALETTE.dawn; p2 = PALETTE.day; a = (t-0.2)/0.2; }
  else if (t < 0.6) { p1 = PALETTE.day; p2 = PALETTE.dusk; a = (t-0.4)/0.2; }
  else if (t < 0.8) { p1 = PALETTE.dusk; p2 = PALETTE.storm; a = (t-0.6)/0.2; }
  else { p1 = PALETTE.storm; p2 = PALETTE.night; a = (t-0.8)/0.2; }
  return { skyTop: lerpColor(p1.skyTop, p2.skyTop, a), skyBot: lerpColor(p1.skyBot, p2.skyBot, a), snow: lerpColor(p1.snow, p2.snow, a), mtn: lerpColor(p1.mtn, p2.mtn, a) };
}

function drawSky(pal) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, rgbStr(pal.skyTop)); grad.addColorStop(1, rgbStr(pal.skyBot));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);

  let starAlpha = 0;
  if (dayTime < 0.3) starAlpha = 1 - (dayTime / 0.3);
  else if (dayTime > 0.85) starAlpha = (dayTime - 0.85) / 0.15;
  if (starAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
    stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x * canvas.width, s.y * canvas.height, s.size, 0, Math.PI*2); ctx.fill(); });
  }

  const cx = canvas.width / 2, cy = canvas.height * 0.9, radius = canvas.width * 0.45;
  if (dayTime > 0.15 && dayTime < 0.85) {
    let sunP = (dayTime - 0.15) / 0.7;
    let sAngle = Math.PI - (sunP * Math.PI);
    ctx.fillStyle = `rgba(255, 220, 80, ${Math.sin(sunP * Math.PI)})`;
    ctx.beginPath(); ctx.arc(cx + Math.cos(sAngle)*radius, cy - Math.sin(sAngle)*radius, 40, 0, Math.PI*2); ctx.fill();
  }
  if (dayTime > 0.7 || dayTime < 0.3) {
    let mTime = (dayTime > 0.7) ? (dayTime - 0.7) : (dayTime + 0.3);
    let moonP = mTime / 0.6;
    let mAngle = Math.PI - (moonP * Math.PI);
    ctx.fillStyle = `rgba(240, 245, 255, ${Math.sin(moonP * Math.PI)})`;
    ctx.beginPath(); ctx.arc(cx + Math.cos(mAngle)*radius, cy - Math.sin(mAngle)*radius, 28, 0, Math.PI*2); ctx.fill();
  }
}

function drawMountains(pal) {
  ctx.fillStyle = rgbStr(pal.mtn, 0.35);
  ctx.beginPath();
  const startX = -(cam.x * 0.1) % 150 - 150;
  ctx.moveTo(startX, canvas.height);
  for (let x = startX; x <= canvas.width + 150; x += 100) {
    let globalX = x + (cam.x * 0.1);
    let h = 250 + Math.sin(globalX * 0.003) * 120 + Math.cos(globalX * 0.008) * 70;
    ctx.lineTo(x, canvas.height - h);
  }
  ctx.lineTo(canvas.width, canvas.height); ctx.fill();
}

function drawTerrain(pal) {
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = rgbStr(pal.snow); ctx.lineWidth = 4; ctx.strokeStyle = rgbStr(pal.mtn);

  const startX = cam.x - 100, endX = cam.x + (canvas.width/ZOOM) + 100, step = 15;
  const CHASM_DEPTH = 350; // The depth of the hollow part
  const WORLD_BOTTOM = cam.y + (canvas.height/ZOOM) + 800;

  // Draw the solid block with hollow pits
  ctx.beginPath();
  ctx.moveTo(startX, WORLD_BOTTOM);
  for (let x = startX; x <= endX; x += step) {
    let over = isOverChasm(x);
    let ty = getTerrainY(x);
    ctx.lineTo(x, over ? ty + CHASM_DEPTH : ty);
  }
  ctx.lineTo(endX, WORLD_BOTTOM);
  ctx.fill();

  // Draw the surface line (the "snow" line)
  ctx.beginPath();
  let firstY = isOverChasm(startX) ? getTerrainY(startX) + CHASM_DEPTH : getTerrainY(startX);
  ctx.moveTo(startX, firstY);
  for (let x = startX + step; x <= endX; x += step) {
    let over = isOverChasm(x);
    let ty = getTerrainY(x);
    if (over) {
       if (!isOverChasm(x - step)) ctx.lineTo(x, ty); // Wall down
       ctx.lineTo(x, ty + CHASM_DEPTH);
    } else {
       if (isOverChasm(x - step)) ctx.lineTo(x - step, ty); // Wall up
       ctx.lineTo(x, ty);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawSilhouetteObstacle(o, pal) {
  ctx.save(); ctx.translate(o.wx - cam.x, o.wy - cam.y);
  if (o.type === 'coin') {
    ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(0, Math.sin(frameCount * 0.1 + o.bob) * 6, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFA500'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.rotate(getTerrainAngle(o.wx)); 
    ctx.scale(o.scale, o.scale); ctx.fillStyle = rgbStr(pal.mtn); ctx.beginPath();
    if (o.type === 'rock') { ctx.moveTo(-15, 0); ctx.lineTo(-10, -18); ctx.lineTo(0, -24); ctx.lineTo(12, -15); ctx.lineTo(18, 0); } 
    else if (o.type === 'tree') { ctx.moveTo(-4, 0); ctx.lineTo(-4, -10); ctx.lineTo(-20, -10); ctx.lineTo(0, -45); ctx.lineTo(20, -10); ctx.lineTo(4, -10); ctx.lineTo(4, 0); } 
    else if (o.type === 'log') { ctx.roundRect(-25, -12, 50, 12, 4); } 
    else if (o.type === 'sign') { ctx.rect(-2, 0, 4, -30); ctx.rect(-15, -30, 30, -20); }
    ctx.fill();
  } ctx.restore();
}

function drawTrail() {
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  player.trail.forEach(p => { ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.8})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

function drawPlayer(pal) {
  ctx.save(); ctx.translate(player.wx - cam.x, player.wy - cam.y); ctx.rotate(player.angle);
  if (!player.alive) { ctx.rotate(player.crashAnim * Math.PI * 3); ctx.globalAlpha = 1 - player.crashAnim * 0.5; }
  ctx.fillStyle = rgbStr(pal.mtn); ctx.beginPath(); ctx.roundRect(-22, 6, 44, 4, 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, -22); ctx.lineTo(-6, -18); ctx.lineTo(-10, -8); ctx.lineTo(-14, 0); ctx.lineTo(-12, 6); 
  ctx.lineTo(-6, 6); ctx.lineTo(-6, -4); ctx.lineTo(2, 0); ctx.lineTo(10, 6); ctx.lineTo(16, 6); 
  ctx.lineTo(8, -6); ctx.lineTo(6, -12); ctx.lineTo(12, -8); ctx.lineTo(14, -12); ctx.lineTo(6, -18); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -26, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a22'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, -22);
  ctx.quadraticCurveTo(-15, -20 + Math.random()*2, -22, -18 + Math.random()*5); ctx.stroke();
  ctx.restore();
}

function updateAndDrawWeather() {
  const isStorm = (dayTime % 1 > 0.7 && dayTime % 1 < 0.95);
  if (isStorm) { for (let i = 0; i < 5; i++) rain.push({ x: Math.random() * canvas.width, y: -20, vx: -1.5 - Math.random(), vy: 18 + Math.random() * 12 }); }
  ctx.strokeStyle = 'rgba(180, 200, 220, 0.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = rain.length - 1; i >= 0; i--) {
    let r = rain[i]; r.x += r.vx; r.y += r.vy;
    ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.vx * 1.5, r.y - r.vy * 1.5);
    if (r.y > canvas.height || r.x < 0) rain.splice(i, 1);
  }
  ctx.stroke();
  if (isStorm && Math.random() < 0.006) { thunderAlpha = 0.9; cam.shake = 12; playThunder(); }
  if (thunderAlpha > 0) { 
    ctx.fillStyle = `rgba(255,255,255,${thunderAlpha * 0.8})`; ctx.fillRect(0, 0, canvas.width, canvas.height); 
    if (thunderAlpha > 0.6 && Math.random() < 0.5) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 4; ctx.beginPath();
      let lx = Math.random() * canvas.width; ctx.moveTo(lx, 0);
      for(let y = 0; y < canvas.height; y += 40 + Math.random()*50) { lx += (Math.random() - 0.5) * 100; ctx.lineTo(lx, y); }
      ctx.stroke();
    }
    thunderAlpha -= 0.04; 
  }
}

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 16.67, 3); lastTime = timestamp; frameCount++;
  const pal = getPalette(); ctx.clearRect(0, 0, canvas.width, canvas.height); 
  drawSky(pal); drawMountains(pal);
  if (state === 'playing' || state === 'dead' || state === 'paused') {
    extendTerrain(); spawnObjects();
    if (state === 'playing') {
      updatePlayer(dt); checkCollisions();
      cam.x += (player.wx - (canvas.width/ZOOM) * 0.3 - cam.x) * 0.07;
      cam.y += (player.wy - (canvas.height/ZOOM) * 0.55 - cam.y) * 0.06;
      if (cam.shake > 0) { cam.x += (Math.random()-0.5)*cam.shake; cam.y += (Math.random()-0.5)*cam.shake; cam.shake *= 0.85; if(cam.shake<0.5) cam.shake=0; }
      distance += player.vx * 0.1; dayTime = (dayTime + 0.00003 * dt) % 1;
      scoreValue.textContent = Math.floor(score).toLocaleString(); distanceValue.textContent = Math.floor(distance) + ' m';
      if (combo > 1) { comboDisplay.textContent = `✦ x${combo}`; comboDisplay.classList.add('visible'); } else comboDisplay.classList.remove('visible');
      if (comboTimer > 0 && --comboTimer === 0) combo = 1;
    }
    ctx.save(); ctx.scale(ZOOM, ZOOM); drawTerrain(pal); objects.forEach(o => drawSilhouetteObstacle(o, pal)); drawTrail(); drawPlayer(pal); ctx.restore();
    updateAndDrawWeather();
  }
  requestAnimationFrame(gameLoop);
}

function startGame() {
  state = 'playing'; score = 0; distance = 0; combo = 1; comboTimer = 0; sessionCoins = 0;
  dayTime = 0.15; frameCount = 0; thunderAlpha = 0; rain.length = 0; initTerrain(); resetPlayer();
  cam.x = player.wx - (canvas.width/ZOOM) * 0.3; cam.y = player.wy - (canvas.height/ZOOM) * 0.55; cam.shake = 0;
  gameOverScreen.classList.remove('visible'); hud.classList.add('visible');
}

function handleStartTransition() {
  initAudio();
  if (state === 'start') {
    state = 'transitioning'; startScreen.classList.add('scroll-up');
    setTimeout(() => { startScreen.style.display = 'none'; startGame(); }, 1500); 
  } else if (state === 'playing') { const now = Date.now(); doJump(now - input.lastJumpTime < 300); input.lastJumpTime = now; }
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!input.jumpPressed) handleStartTransition(); input.jumpPressed = true; if (state === 'playing' && !player.onGround) player.spinning = true; }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { input.jumpPressed = false; player.spinning = false; } });
canvas.addEventListener('pointerdown', e => { e.preventDefault(); handleStartTransition(); setTimeout(() => { if (state === 'playing' && !player.onGround) player.spinning = true; }, 120); });
canvas.addEventListener('pointerup', () => player.spinning = false);
pauseBtn.addEventListener('pointerdown', e => { e.stopPropagation(); togglePause(); });
resumeBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', () => { initAudio(); startGame(); });
startScreen.addEventListener('pointerdown', handleStartTransition);

function togglePause() {
  if (state === 'playing') { state = 'paused'; pauseScreen.classList.add('visible'); }
  else if (state === 'paused') { state = 'playing'; pauseScreen.classList.remove('visible'); }
}

function showGameOver() {
  state = 'dead';
  finalScore.textContent = Math.floor(score).toLocaleString();
  finalCoins.textContent = `${sessionCoins} coins earned`;
  finalDistance.textContent = Math.floor(distance) + ' m';
  gameOverScreen.classList.add('visible');
}

const snowContainer = document.getElementById('startSnowflakes');
for (let i = 0; i < 30; i++) {
  const s = document.createElement('div'); s.className = 'start-snowflake'; s.textContent = '❄';
  s.style.left = Math.random() * 100 + 'vw'; s.style.fontSize = (8 + Math.random() * 10) + 'px';
  s.style.animationDuration = (5 + Math.random() * 10) + 's'; s.style.animationDelay = (-Math.random() * 10) + 's';
  snowContainer.appendChild(s);
}

initTerrain(); requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(gameLoop); });