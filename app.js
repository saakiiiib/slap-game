import { GameSession } from './game-core.js';
import { analyzeGesture, toLocal, segmentEllipseHit } from './input.js';
import { character } from './character.js';
import { SoundPlayer } from './audio.js';
import { ReactionMeter, eyeReaction, drawComicEyes, drawDizzyStars } from './reactions.js';
import { HAND_ASSET, HAND_CONTACT_MS, HandAnimator, drawSlappingHand } from './hand.js';
import { SlapTiming } from './slap-timing.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const W = 600, H = 560, now = () => performance.now();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const PREF_KEY = 'slap-game.preferences.v1';
let prefs = { muted: false, volume: 0.65, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
try {
  const stored = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
  if (stored && typeof stored === 'object') {
    if (typeof stored.muted === 'boolean') prefs.muted = stored.muted;
    if (Number.isFinite(stored.volume)) prefs.volume = clamp(stored.volume, 0, 1);
    if (typeof stored.reduceMotion === 'boolean') prefs.reduceMotion = stored.reduceMotion;
  }
} catch { /* Local storage is optional. */ }
const session = new GameSession();
const sound = new SoundPlayer(prefs);
const reactions = new ReactionMeter();
const hand = new HandAnimator();
const slapTiming = new SlapTiming();
const handImage = new Image();
handImage.src = HAND_ASSET;
let selectedMode = 'arcade', activePointer = null, samples = [], keyboardSide = 'left', keyboardAt = null, pointerHandDirection = 1;
let showKeyboardMarker = false, impact = null, blush = { left: 0, right: 0 }, words = [], particles = [], trail = [], gestureFace = null;
let lastFrame = now(), resultShown = false, lastPower = 0, spriteReady = false, flashUntil = 0, mouthUntil = 0;
const portrait = new Image();
portrait.onload = () => { spriteReady = true; $('asset-status').textContent = 'CHARACTER READY. LET’S DO THIS.'; $('start').disabled = false; };
portrait.onerror = () => {
  $('asset-status').textContent = 'Portrait unavailable. You can still play with the demo face.';
  $('start').disabled = false;
};
$('start').disabled = true;
portrait.src = character.image;

function savePreferences() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* In-memory preferences remain usable. */ }
  sound.setPreferences(prefs.muted, prefs.volume);
  $('sound').setAttribute('aria-pressed', String(prefs.muted));
  $('sound').setAttribute('aria-label', prefs.muted ? 'Unmute sound' : 'Mute sound');
  $('sound').style.color = prefs.muted ? '#ed523e' : '';
  $('sound-toggle').checked = !prefs.muted;
  $('volume').value = String(Math.round(prefs.volume * 100));
  $('volume-value').textContent = `${Math.round(prefs.volume * 100)}%`;
  $('motion').checked = prefs.reduceMotion;
}
savePreferences();

function facePose(t = now()) {
  if (activePointer !== null && gestureFace) return gestureFace;
  let x = 300, y = 236, angle = 0;
  if (impact && !prefs.reduceMotion) {
    const age = (t - impact.at) / 1000;
    if (age >= 0 && age < 1) {
      const decay = Math.exp(-7 * age), wave = Math.sin(age * 20);
      x += impact.dir * impact.power * 34 * wave * decay;
      angle = impact.dir * impact.power * 0.2 * wave * decay;
    }
  }
  return { x, y, angle, scale: 1, ...character.face };
}
function worldPoint(p, face = facePose()) {
  return { x: face.x + (p.x * Math.cos(face.angle) - p.y * Math.sin(face.angle)) * face.scale,
    y: face.y + (p.x * Math.sin(face.angle) + p.y * Math.cos(face.angle)) * face.scale };
}
function eventPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height, t: now() };
}
function cancelGesture() {
  if (activePointer !== null && canvas.hasPointerCapture(activePointer)) {
    try { canvas.releasePointerCapture(activePointer); } catch { /* Browser cancelled it already. */ }
  }
  activePointer = null; samples = []; keyboardAt = null; trail = []; gestureFace = null;
  hand.endFollow();
}
function selectMode(mode) {
  selectedMode = mode;
  $('mode-arcade').classList.toggle('active', mode === 'arcade');
  $('mode-practice').classList.toggle('active', mode === 'practice');
  $('mode-arcade').setAttribute('aria-pressed', String(mode === 'arcade'));
  $('mode-practice').setAttribute('aria-pressed', String(mode === 'practice'));
}
function start(mode = selectedMode) {
  cancelGesture(); hand.clear(); slapTiming.clear({ resetCooldown: true }); sound.stop(); sound.unlock();
  selectMode(mode); session.start(mode, now());
  reactions.reset(); mouthUntil = 0; lastFrame = now();
  resultShown = false; impact = null; words = []; particles = []; blush = { left: 0, right: 0 }; lastPower = 0;
  setPower(0, 'MAKE YOUR FIRST MOVE');
  $('start-panel').hidden = true; $('pause-cover').hidden = true; $('live-instruction').hidden = false;
  $('pause').disabled = false; $('pause').textContent = mode === 'practice' ? '■' : 'Ⅱ';
  $('pause').setAttribute('aria-label', mode === 'practice' ? 'Finish practice' : 'Pause game');
  $('results-dialog').close(); canvas.focus({ preventScroll: true });
  announce(mode === 'arcade' ? 'Round started. Thirty seconds. Aim for the left cheek.' : 'Free practice started. Aim for the left cheek.');
  updateHUD(now());
}
function pause(reason = 'Your score is right where you left it.') {
  const t = now();
  cancelGesture(); hand.clear(); slapTiming.clear(); sound.stop(); mouthUntil = 0;
  setPower(lastPower);
  if (session.pause(t)) {
    slapTiming.pause(t);
    $('pause-reason').textContent = reason; $('pause-cover').hidden = false; $('live-instruction').hidden = true;
    $('resume').focus({ preventScroll: true }); announce('Game paused.');
  }
}
function resume() {
  if (document.hidden) return;
  const t = now();
  if (session.resume(t)) {
    slapTiming.resume(t);
    lastFrame = t;
    sound.unlock(); $('pause-cover').hidden = true; $('live-instruction').hidden = false;
    canvas.focus({ preventScroll: true }); announce('Game resumed.');
  }
}
function announce(text) { $('announcer').textContent = text; }
function setPower(power, text) {
  const percent = Math.round(power * 100);
  $('power-fill').style.width = `${percent}%`;
  $('power-meter').setAttribute('aria-valuenow', String(percent));
  $('power-label').textContent = text || `${percent}% POWER · ${percent < 34 ? 'A LITTLE TAP' : percent < 72 ? 'NICE SWIPE!' : 'FULL SEND!'}`;
}
function windupHand(direction, power, t) {
  const target = worldPoint(character.cheeks[direction > 0 ? 'left' : 'right']);
  const pullback = prefs.reduceMotion ? 0 : power * 18;
  hand.follow({ x: target.x - direction * (135 + pullback), y: target.y + 55, direction, power }, t);
}
function queueSlap(hit) {
  const t = now();
  if (session.status !== 'playing') return;
  // Anchor the broad palm on the cheek, rather than the path's first edge contact.
  const point = hit.faceHit ? worldPoint(character.cheeks[hit.side]) : hit.point;
  const pose = hand.pose(t, { reduceMotion: prefs.reduceMotion });
  const from = pose?.phase === 'following' ? { x: pose.x, y: pose.y } : undefined;
  const delayMs = prefs.reduceMotion ? 0 : HAND_CONTACT_MS;
  if (!slapTiming.schedule({ ...hit, point, from, contactAt: t + delayMs }, t, { delayMs })) return;
  setPower(hit.power, `${Math.round(hit.power * 100)}% POWER · SWINGING…`);
  hand.strike({ ...point, direction: hit.direction, power: hit.power }, t, { from, reducedMotion: prefs.reduceMotion });
}
function commit(hit, t = now()) {
  const result = session.attempt({ power: hit.power, targetHit: hit.targetHit, faceHit: hit.faceHit }, t);
  if (!result.accepted) return;
  lastPower = hit.power;
  if (!result.hit) {
    setPower(0, 'A SWING AND A MISS');
    words.push({ x: clamp(hit.point.x, 100, 500), y: clamp(hit.point.y, 100, 420), text: 'WHOOSH!', sub: 'FIND THE RING', at: t, miss: true });
    return;
  }
  const previousReaction = eyeReaction(reactions.heat);
  const reaction = reactions.hit(hit.power, t);
  impact = { at: t, power: hit.power, dir: hit.direction, side: hit.side };
  blush[hit.side] = clamp(blush[hit.side] + 0.2 + hit.power * 0.55, 0, 1);
  flashUntil = t + 65;
  const label = hit.power < 0.28 ? 'TAP!' : hit.power < 0.6 ? 'SMACK!' : hit.power < 0.85 ? 'WHACK!' : 'KAPOW!';
  words.push({ x: hit.side === 'left' ? 145 : 450, y: 145, text: label, sub: `+${result.points}${result.targetHit ? ' · ON TARGET' : ''}`, at: t });
  if (!prefs.reduceMotion) for (let i = 0; i < 9; i++) {
    const a = Math.PI * 2 * i / 9;
    particles.push({ x: hit.point.x, y: hit.point.y, vx: Math.cos(a) * (70 + hit.power * 150), vy: Math.sin(a) * (70 + hit.power * 150), at: t, color: i % 2 ? '#f5ce5e' : '#ed523e' });
  }
  const vocal = sound.play(hit.power, reaction.heat);
  mouthUntil = t + (vocal?.duration || 0.55 + hit.power * 0.55) * 1000;
  setPower(hit.power);
  announce(`${result.points} points. ${result.combo} times combo. Aim for the ${session.targetSide} cheek.${!previousReaction.active && eyeReaction(reaction.heat).active ? ' Googly eyes!' : ''}`);
  updateHUD(t);
}

canvas.addEventListener('pointerdown', e => {
  if (session.status !== 'playing' || slapTiming.pending || activePointer !== null || keyboardAt !== null || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); canvas.focus({ preventScroll: true }); sound.unlock(); showKeyboardMarker = false;
  gestureFace = facePose(); activePointer = e.pointerId; samples = [eventPoint(e)]; canvas.setPointerCapture(e.pointerId);
  pointerHandDirection = samples[0].x <= gestureFace.x ? 1 : -1;
  windupHand(pointerHandDirection, .1, samples[0].t);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer) return;
  e.preventDefault();
  const events = e.getCoalescedEvents?.() || [e];
  for (const item of (events.length ? events : [e])) {
    const p = eventPoint(item);
    // Use event timestamps for coalesced events; they share the performance clock.
    if (Number.isFinite(item.timeStamp) && Math.abs(item.timeStamp - p.t) < 1000) p.t = item.timeStamp;
    const previous = samples.at(-1);
    if (p.t >= previous.t) {
      const dx = p.x - previous.x, dy = p.y - previous.y;
      if (Math.abs(dx) > 2) pointerHandDirection = Math.sign(dx);
      const speed = Math.hypot(dx, dy) / Math.max(1, p.t - previous.t);
      samples.push(p);
      windupHand(pointerHandDirection, clamp(speed / 3.2, 0, 1), p.t);
    }
  }
  trail = samples.slice(-12);
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== activePointer) return;
  e.preventDefault(); samples.push(eventPoint(e));
  const points = samples; const face = facePose();
  const analyzed = analyzeGesture(points, { face, cheeks: character.cheeks, targetSide: session.targetSide });
  if (analyzed.valid) queueSlap(analyzed);
  else if (analyzed.reason === 'tooShort') {
    const first = points[0], last = points.at(-1), distance = Math.hypot(last.x - first.x, last.y - first.y);
    const local = toLocal(last, face);
    if (distance < 12 && last.t - first.t < 450 && local) {
      const faceHit = !!segmentEllipseHit(local, local, { x: 0, y: 0, ...character.face });
      const side = local.x < 0 ? 'left' : 'right';
      const targetHit = side === session.targetSide && !!segmentEllipseHit(local, local, character.cheeks[side]);
      queueSlap({ power: 0.1, faceHit, targetHit, side, direction: side === 'left' ? 1 : -1, point: last });
    }
  }
  cancelGesture();
});
canvas.addEventListener('pointercancel', e => { if (e.pointerId === activePointer) cancelGesture(); });
canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === activePointer) cancelGesture(); });
canvas.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault(); keyboardSide = e.code === 'ArrowLeft' ? 'left' : 'right'; showKeyboardMarker = true;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat && session.status === 'playing' && !slapTiming.pending && keyboardAt === null && activePointer === null) { keyboardAt = now(); showKeyboardMarker = true; sound.unlock(); }
  }
});
canvas.addEventListener('keyup', e => {
  if (e.code !== 'Space' || keyboardAt === null) return;
  e.preventDefault(); const power = clamp((now() - keyboardAt) / 900, 0.1, 1); keyboardAt = null;
  setPower(lastPower);
  const point = worldPoint(character.cheeks[keyboardSide]);
  queueSlap({ power, faceHit: true, targetHit: keyboardSide === session.targetSide, side: keyboardSide, direction: keyboardSide === 'left' ? 1 : -1, point });
  hand.endFollow();
});
canvas.addEventListener('blur', () => { cancelGesture(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (session.status === 'playing') { e.preventDefault(); pause(); }
  else if (session.status === 'paused') { e.preventDefault(); resume(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('You switched tabs, so we paused the clock. Ready for another swipe?'); });
window.addEventListener('blur', () => { if (session.status === 'playing') pause('We paused while you stepped away. Your time and score are safe.'); });
$('start').onclick = () => start();
$('resume').onclick = resume;
$('restart-paused').onclick = () => start();
$('pause').onclick = () => { if (session.mode === 'practice' && session.status === 'playing') { session.finish(now()); showResults(); } else pause(); };
$('mode-arcade').onclick = () => switchMode('arcade');
$('mode-practice').onclick = () => switchMode('practice');
function switchMode(mode) {
  if (selectedMode === mode) return;
  // Switching modes ends the current run without turning a partial run into a record.
  cancelGesture(); hand.clear(); slapTiming.clear({ resetCooldown: true }); sound.stop(); session.reset(); selectMode(mode); resultShown = false;
  reactions.reset(); mouthUntil = 0;
  $('start-panel').hidden = false; $('pause-cover').hidden = true; $('live-instruction').hidden = true; $('pause').disabled = true;
  words = []; particles = []; impact = null; blush = { left: 0, right: 0 }; lastPower = 0;
  updateHUD(now()); announce(mode === 'practice' ? 'Practice selected. Press Let’s Play to begin.' : 'Arcade selected. Press Let’s Play to begin.');
}
$('sound').onclick = () => { prefs.muted = !prefs.muted; savePreferences(); if (!prefs.muted) sound.unlock(); };
$('sound-toggle').onchange = e => { prefs.muted = !e.target.checked; savePreferences(); if (!prefs.muted) sound.unlock(); };
$('volume').oninput = e => { prefs.volume = Number(e.target.value) / 100; savePreferences(); };
$('motion').onchange = e => { prefs.reduceMotion = e.target.checked; savePreferences(); };
function openDialog(id) { if (session.status === 'playing') pause(); $(id).showModal(); }
$('settings-open').onclick = () => openDialog('settings-dialog');
$('keyboard-open').onclick = () => openDialog('keyboard-dialog');
for (const button of document.querySelectorAll('.close-dialog')) button.onclick = () => button.closest('dialog').close();
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', e => { if (e.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); });
}
$('results-close').onclick = () => $('results-dialog').close();
$('results-dialog').addEventListener('close', () => {
  if (session.status !== 'over') return;
  $('start-panel').hidden = false;
  $('start').textContent = 'PLAY AGAIN ↗';
  $('asset-status').textContent = 'A FRESH ROUND IS A SWIPE AWAY.';
});
$('play-again').onclick = () => start(session.mode);
$('try-practice').onclick = () => start('practice');

function updateHUD(t) {
  const mode = session.status === 'ready' ? selectedMode : session.mode;
  const remaining = mode === 'practice' ? null : session.remaining(t);
  $('time').textContent = remaining === null ? '∞' : String(Math.ceil(remaining / 1000)).padStart(2, '0');
  $('time-unit').textContent = remaining === null ? 'FREE' : 'SEC';
  document.querySelector('.timer').classList.toggle('urgent', remaining !== null && remaining <= 5000 && session.status === 'playing');
  $('round-status').textContent = session.status === 'ready' ? 'READY WHEN YOU ARE' : session.status === 'paused' ? 'TAKING A BREATHER' : session.status === 'over' ? 'THAT’S A WRAP' : mode === 'practice' ? 'NO CLOCK. ALL PLAY.' : 'MAKE EVERY SWIPE COUNT';
  $('score').textContent = String(session.score).padStart(5, '0');
  $('mobile-score').textContent = String(session.score).padStart(5, '0');
  $('combo').textContent = `×${session.combo}`;
  $('combo-label').textContent = session.combo >= 5 ? 'Unstoppable hands!' : session.combo > 1 ? 'Keep it going!' : 'Find your rhythm.';
  $('best').textContent = session.best.toLocaleString();
  $('accuracy').textContent = session.attempts ? `${Math.round(session.targetHits / session.attempts * 100)}%` : '—';
  $('slaps').textContent = String(session.slaps);
  $('target-note').lastChild.textContent = session.status === 'ready' ? ' Aim for the glowing cheek' : ` Aim for the ${session.targetSide} cheek`;
  const comicEyes = eyeReaction(reactions.heat, prefs.reduceMotion);
  $('reaction-caption').hidden = !comicEyes.active;
  $('reaction-caption').textContent = reactions.heat > .8 ? 'GOOGLY MODE!' : 'EYES ON THE PRIZE!';
  $('stage').dataset.reaction = reactions.heat > .8 ? 'wild' : comicEyes.active ? 'surprised' : 'calm';
  if (keyboardAt !== null) setPower(clamp((t - keyboardAt) / 900, 0.1, 1), 'HOLD… RELEASE TO SLAP');
  else if (session.status === 'ready') setPower(0, 'MAKE YOUR FIRST MOVE');
}
function showResults() {
  if (resultShown || !session.result) return;
  resultShown = true; cancelGesture(); hand.clear(); slapTiming.clear(); sound.stop(); $('pause').disabled = true; $('live-instruction').hidden = true;
  const r = session.result;
  $('result-kicker').textContent = r.mode === 'practice' ? 'PRACTICE MAKES PERSONAL BESTS' : 'THAT’S A WRAP';
  $('results-title').textContent = r.newBest ? 'New personal best!' : r.score > 0 ? 'Nice handiwork.' : 'Warming up?';
  $('result-score').textContent = r.score.toLocaleString();
  $('new-best').textContent = r.mode === 'practice' ? 'Free practice · your arcade record stays unchanged.' : r.newBest ? '✦ A new high score. That’s the spirit.' : `Personal best: ${r.best.toLocaleString()} · One more try?`;
  $('result-accuracy').textContent = `${Math.round(r.accuracy)}%`;
  $('result-power').textContent = `${Math.round(r.strongest * 100)}%`;
  $('result-combo').textContent = `×${r.maxCombo}`; $('result-slaps').textContent = String(r.slaps);
  $('download-status').textContent = '';
  $('results-dialog').showModal();
  announce(`Finished. ${r.score} points. ${Math.round(r.accuracy)} percent accuracy.${r.newBest ? ' New personal best.' : ''}`);
}
$('download-card').onclick = () => {
  const r = session.result; if (!r) return;
  const card = document.createElement('canvas'); card.width = 1000; card.height = 700;
  const g = card.getContext('2d');
  g.fillStyle = '#f4f0e7'; g.fillRect(0, 0, 1000, 700);
  g.fillStyle = '#ed523e'; g.fillRect(0, 0, 1000, 13);
  g.fillStyle = '#20231f'; g.font = 'bold 36px Arial'; g.fillText('SLAP GAME', 55, 83);
  g.font = '16px monospace'; g.fillText(r.mode === 'arcade' ? '30 SECOND ARCADE' : 'FREE PRACTICE', 55, 125);
  g.font = '18px monospace'; g.fillText('MY SCORE', 55, 222);
  g.font = 'bold 112px Arial'; g.fillText(r.score.toLocaleString(), 48, 338);
  g.font = 'bold 22px Arial'; g.fillText(`${Math.round(r.accuracy)}% ACCURACY     ×${r.maxCombo} COMBO`, 55, 415);
  g.font = '17px Arial'; g.fillText(`${r.slaps} slaps landed · ${Math.round(r.strongest * 100)}% strongest slap`, 55, 455);
  if (spriteReady) { const sw = portrait.width / 2, sh = portrait.height / 2; g.drawImage(portrait, 0, 0, sw, sh, 590, 155, 370, 370 * sh / sw); }
  g.fillStyle = '#207b70'; g.font = 'italic bold 26px Georgia'; g.fillText('A little swipe. A big reaction.', 55, 580);
  g.fillStyle = '#747666'; g.font = '14px monospace';
  const link = location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname) ? location.href.split(/[?#]/)[0] : 'Made for a little comic relief.';
  g.fillText(link.length > 95 ? link.slice(0, 92) + '…' : link, 55, 640);
  card.toBlob(blob => {
    if (!blob) { $('download-status').textContent = 'Could not create the card. Please try again.'; return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `slap-game-${r.score}.png`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('download-status').textContent = 'Score card saved as a PNG image.';
  }, 'image/png');
};

function ellipse(g, x, y, rx, ry, fill) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } }
function star(g, x, y, r, color, rotation = 0) {
  g.save(); g.translate(x, y); g.rotate(rotation); g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, size = i % 2 ? r * .25 : r; const px = Math.cos(a) * size, py = Math.sin(a) * size; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fillStyle = color; g.fill(); g.restore();
}
function draw(t, dt) {
  ctx.clearRect(0, 0, W, H);
  ellipse(ctx, 303, 480, 170, 14, '#8a7b551d');
  star(ctx, 85, 185, 20, '#9d9a7740', -.12); star(ctx, 505, 330, 15, '#9d9a7750', .2);
  ctx.save(); ctx.strokeStyle = '#9a947350'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(110, 345, 11, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(460, 125); ctx.lineTo(478, 107); ctx.moveTo(463, 107); ctx.lineTo(480, 124); ctx.stroke(); ctx.restore();
  const face = facePose(t), age = impact ? t - impact.at : 9999;
  const comicEyes = eyeReaction(reactions.heat, prefs.reduceMotion);
  const index = comicEyes.active ? 3 : t < mouthUntil ? (impact?.power > .72 || age > 180 ? 3 : impact?.dir > 0 ? 1 : 2) : 0;
  ctx.save(); ctx.translate(face.x, face.y); ctx.rotate(face.angle);
  if (spriteReady) {
    const sw = portrait.naturalWidth / 2, sh = portrait.naturalHeight / 2, dw = character.width, dh = dw * sh / sw;
    ctx.drawImage(portrait, (index % 2) * sw, Math.floor(index / 2) * sh, sw, sh,
      -character.pivot.x * dw, -character.pivot.y * dh, dw, dh);
  } else {
    ctx.fillStyle = '#893f3e'; ctx.beginPath(); ctx.roundRect(-160, 120, 320, 140, [70, 70, 0, 0]); ctx.fill();
    ellipse(ctx, 0, -15, 110, 145, '#c28a5d');
    ctx.fillStyle = '#20231f'; ctx.beginPath(); ctx.ellipse(0, -125, 110, 60, -.1, 0, Math.PI * 2); ctx.fill();
    ellipse(ctx, -38, -35, 9, 9, '#20231f'); ellipse(ctx, 38, -35, 9, 9, '#20231f');
    ctx.strokeStyle = '#20231f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 16, 32, .2, Math.PI - .2); ctx.stroke();
  }
  for (const side of ['left', 'right']) {
    const cheek = character.cheeks[side];
    if (blush[side] > .005) {
      const grad = ctx.createRadialGradient(cheek.x, cheek.y, 2, cheek.x, cheek.y, 48);
      grad.addColorStop(0, `rgba(239,52,50,${blush[side] * .65})`); grad.addColorStop(1, 'rgba(239,52,50,0)');
      ellipse(ctx, cheek.x, cheek.y, 48, 43, grad);
      if (age < 330 && impact?.side === side) {
        ctx.save(); ctx.translate(cheek.x, cheek.y); ctx.rotate(impact.dir * .25); ctx.globalAlpha = .25 * impact.power;
        ellipse(ctx, 0, 0, 13, 16, '#d62525'); for (let i = 0; i < 4; i++) ellipse(ctx, -12 + i * 7, -18, 3, 10, '#d62525'); ctx.restore();
      }
    }
  }
  drawComicEyes(ctx, { heat: reactions.heat, time: t / 1000, reduceMotion: prefs.reduceMotion, eyes: character.eyes });
  drawDizzyStars(ctx, { heat: reactions.heat, time: t / 1000, reduceMotion: prefs.reduceMotion, x: -10, y: -173 });
  if (session.status === 'playing' || session.status === 'ready') {
    const c = character.cheeks[session.targetSide], pulse = prefs.reduceMotion ? 0 : Math.sin(t / 200) * 2;
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#fffdf5'; ellipse(ctx, c.x, c.y, 30 + pulse, 30 + pulse); ctx.stroke();
    ctx.strokeStyle = '#207b70'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ellipse(ctx, c.x, c.y, 36 + pulse, 36 + pulse); ctx.stroke(); ctx.setLineDash([]);
    ellipse(ctx, c.x, c.y, 4, 4, '#fffdf5');
    if (showKeyboardMarker) { const k = character.cheeks[keyboardSide]; ctx.strokeStyle = '#f5ce5e'; ctx.lineWidth = 2; ctx.strokeRect(k.x - 42, k.y - 42, 84, 84); }
  }
  ctx.restore();
  if (!prefs.reduceMotion && trail.length > 1) {
    ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y); for (const p of trail.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = '#fffdf5bb'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#207b70'; ctx.stroke();
  }
  const palmPose = hand.pose(t, { reduceMotion: prefs.reduceMotion });
  $('stage').dataset.hand = palmPose?.phase || 'idle';
  drawSlappingHand(ctx, { image: handImage, pose: palmPose, width: 205 });
  particles = particles.filter(p => t - p.at < 450);
  for (const p of particles) { const age = (t - p.at) / 1000; ctx.globalAlpha = 1 - age / .45; star(ctx, p.x + p.vx * age, p.y + p.vy * age + age * age * 100, 4, p.color, age * 3); }
  ctx.globalAlpha = 1;
  words = words.filter(word => t - word.at < 850);
  for (const w of words) {
    const a = (t - w.at) / 850; ctx.save(); ctx.translate(w.x, w.y - (prefs.reduceMotion ? 0 : a * 38)); ctx.rotate(w.miss ? -.08 : -.12);
    ctx.globalAlpha = Math.min(1, (1 - a) * 3); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = `${w.miss ? 28 : 39}px Impact, Arial Black, sans-serif`; ctx.strokeStyle = '#20231f'; ctx.lineWidth = 6; ctx.fillStyle = w.miss ? '#fffdf5' : '#f5ce5e'; ctx.strokeText(w.text, 0, 0); ctx.fillText(w.text, 0, 0);
    ctx.font = 'bold 13px Arial'; ctx.lineWidth = 4; ctx.fillStyle = '#fffdf5'; ctx.strokeText(w.sub, 0, 25); ctx.fillText(w.sub, 0, 25); ctx.restore();
  }
  if (!prefs.reduceMotion && flashUntil > t && impact?.power > .75) { ctx.fillStyle = '#fffdf530'; ctx.fillRect(0, 0, W, H); }
  blush.left = Math.max(0, blush.left - dt * .14); blush.right = Math.max(0, blush.right - dt * .14);
}
function frame(t) {
  const elapsed = Math.max(0, (t - lastFrame) / 1000);
  const dt = Math.min(.05, elapsed); lastFrame = t;
  if (keyboardAt !== null && session.status === 'playing') {
    const direction = keyboardSide === 'left' ? 1 : -1;
    windupHand(direction, clamp((t - keyboardAt) / 900, .1, 1), t);
  }
  reactions.update(elapsed, { paused: session.status === 'paused' });
  // Use the scheduled contact time so frame jitter cannot change cooldowns or
  // discard a contact that was due just before the arcade deadline.
  const ready = session.status === 'playing' ? slapTiming.take(t) : null;
  if (ready) commit(ready, ready.contactAt);
  session.tick(t); updateHUD(t); draw(t, session.status === 'paused' ? 0 : dt);
  if (session.status === 'over') showResults();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
