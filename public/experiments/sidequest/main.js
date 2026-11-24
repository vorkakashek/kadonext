import { Navigator, distance } from './pathfinding.js';
import { measureInk, measureOutline, relativeRect, segmentCircleHit, BOOK_SPREADS, nextBookState, fallPose } from './scene-geometry.js';
import { shapePoints, distanceToShape, closestOnSegment } from './polygons.js';
import { FieldRadio } from './radio.js';
import { chooseDock } from './interaction.js';
import { PlayBall } from './ball.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene'), ctx = canvas.getContext('2d');
const world = $('#world'), status = $('#status'), panel = $('#panel');
const cursor = { x: innerWidth * .43, y: innerHeight * .77, active: false };
const player = { x: cursor.x - 90, y: cursor.y, angle: -.4, stride: 0, speed: 0, grip: 0, tuck: 0 };
const gripHalfWidth = 26;
const ink = '#20231e';
const ball = new PlayBall(14);
let kickAge = 1, kickSide = 1;
let width, height, nav, solids = [], targets = new Map(), route = [], goal = null;
let approach = null;
let hovered = null, committed = null, pressing = null, lastTime = 0, frameId = 0;
let lastPlan = -Infinity, dirtyGoal = true, debug = false, initialized = false;
let footprints = [], particles = [], lastFoot = 0, footSide = 1;
let panelReturnFocus = null, resizeFrame = 0, celebrated = false;
let bookState = 0, bookBusyUntil = 0, fall = null, hazards = [], hazardArmed = true;
let simTime = 0, speechUntil = 0, speechWidth = 220, speechHeight = 45;
const speech = $('#speech');
const radio = new FieldRadio((playing, error) => {
  $('#radio').classList.toggle('is-playing', playing);
  $('#radio').setAttribute('aria-pressed', String(playing));
  $('#radio').setAttribute('aria-label', playing ? 'Выключить радио' : 'Включить радио');
  $('#radio-label').textContent = playing ? 'В ЭФИРЕ · LOFI' : 'НАСТРОИТЬ ВОЛНУ';
  toast(error ? 'Волну не поймал. Попробуй ещё раз.' : playing ? 'Вот теперь можно гулять.' : 'Тишина тоже хороша.');
});

function setStatus(text) { if (status.textContent !== text) status.textContent = text; }
function toast(text) {
  speech.textContent = text; speech.classList.add('visible');
  speechUntil = simTime + 3.2;
  // Measure once per new phrase. Position follows the character via transforms.
  speechWidth = speech.offsetWidth; speechHeight = speech.offsetHeight;
}

function rebuild() {
  // Remove the press transform before measuring the new static geometry.
  if (pressing) {
    pressing.el.classList.remove('is-pressed', 'is-held');
    pressing = null; committed = null; releaseHover();
  }
  width = world.clientWidth; height = world.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  targets = new Map();
  const origin = world.getBoundingClientRect();
  solids = [...document.querySelectorAll('[data-solid]')].filter(el => el.getClientRects().length).flatMap(el => {
    const r = el.getBoundingClientRect();
    const rect = relativeRect(r, origin);
    const outline = el.dataset.solid === 'ink' ? null : measureOutline(el, origin, world);
    if (el.dataset.action) targets.set(el, { ...rect, ...outline });
    // Cast shadows lie on the floor; only the object's face blocks movement.
    return outline ? [{ points: outline.points }] : measureInk(el, origin);
  });
  if (!panel.hidden) {
    const r = panel.getBoundingClientRect();
    solids.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  }
  nav = new Navigator(solids, { x: 34, y: 28, w: Math.max(1, width - 68), h: Math.max(1, height - 56) });
  // Each item has its own footprint; the empty corners of the pile stay safe.
  hazards = [...document.querySelectorAll('#litter [data-hazard]')].flatMap(el => {
    const r = el.getBoundingClientRect();
    return r.width ? [{ x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2, radius: Math.max(17, Math.min(r.width, r.height) * .36) }] : [];
  });
  const safe = nav.nearest(player);
  if (safe) { player.x = safe.x; player.y = safe.y; }
  ball.setScene(solids, { x: 0, y: 0, w: width, h: height });
  if (!ball.ready) {
    // Spawn above the title, towards the right; keep clear of responsive UI.
    const spawn = nav.nearest({ x: width * .7, y: height * .11 });
    ball.reset(spawn || player);
  } else if (!ball.isFree()) {
    const free = nav.nearest(ball);
    if (free) ball.reset(free);
  }
  route = []; goal = null; approach = null; dirtyGoal = true;
  // Responsive reflow can remove a button or move the docking point mid-action.
  if (hovered && !targets.has(hovered)) releaseHover();
  initialized = true;
}

function releaseHover() {
  if (hovered) hovered.classList.remove('is-held');
  hovered = null;
}

function docking(el) {
  const r = targets.get(el);
  if (!r) return null;
  return chooseDock(nav, player, r, { inset: gripHalfWidth });
}

function updateGoal(now) {
  if (pressing || (!dirtyGoal && now - lastPlan < 110)) return;
  const target = committed || hovered;
  // Keep the chosen grip stable during approach and while holding the button.
  // Recompute on a new target, layout change, or an invalidated route only.
  if (target && !dirtyGoal && goal) return;
  const dock = target ? docking(target) : null;
  approach = dock ? { el: target, edge: dock.edge } : null;
  let next = target ? dock?.goal : cursor.active ? nav.nearest(cursor) : null;
  if (target && !next) {
    if (committed) { toast('Здесь тесновато. Попробуй развернуть окно пошире.'); committed = null; }
    releaseHover();
    next = nav.nearest(cursor);
  }
  if (!next) { route = []; goal = null; return; }
  if (dirtyGoal || !goal || distance(next, goal) > 6) {
    route = dock ? dock.route : nav.route(player, next);
    goal = next;
  }
  dirtyGoal = false; lastPlan = now;
  if (target && !route.length && distance(player, next) > 4) {
    if (committed) toast('Путь перекрыт. Нужен другой заход.');
    committed = null; releaseHover(); goal = null;
  }
}

function openPanel(kind, source) {
  if (kind === 'radio') { void radio.toggle(); return; }
  if (kind === 'book') { turnBook(); return; }
  if (kind === 'debug') {
    debug = !debug;
    $('#debug').setAttribute('aria-pressed', String(debug));
    return;
  }
  const content = {
    guide: ['ПОЛЕВОЙ СПРАВОЧНИК / 01', 'Двигай курсор.\nЯ за тобой.', 'Проведи меня через мяч — пну его. Он отскакивает от предметов и краёв поля. Кликни на радио — включим музыку. Книжку справа можно открыть и перелистнуть. А бумажку лучше обойти: я могу споткнуться.'],
    mission: ['МИССИЯ / 001', 'Свернуть\nс привычного пути.', 'Здесь можно никуда не спешить. Проведи напарника вокруг заголовка, загляни за радиостанцию, доберись до кнопки. У этого приключения нет неправильного маршрута.'],
    menu: ['SIDEQUEST / НАВИГАЦИЯ', 'Ты уже\nна месте.', 'Это целый маленький мир размером с один экран. «Миссия» расскажет, зачем мы здесь. «Как играть» — как подружиться с напарником. А большая кнопка запустит приключение.'],
    start: ['ПРИКЛЮЧЕНИЕ / НАЧАЛО', 'Первый шаг\nуже сделан.', 'Напарник добрался до кнопки и нажал её за тебя. Теперь исследуй поле: обходи предметы, меняй направление, находи короткие пути. Это концепт — весь мир пока на этом экране.']
  };
  if (kind === 'home') {
    closePanel(false); celebrated = false;
    toast('Снова на старте. Куда теперь?'); return;
  }
  const data = content[kind];
  if (!data) return;
  $('#panel-index').textContent = data[0];
  $('#panel-title').textContent = data[1]; $('#panel-title').style.whiteSpace = 'pre-line';
  $('#panel-copy').textContent = data[2];
  panel.hidden = false; panelReturnFocus = source;
  $('.menu-button').setAttribute('aria-expanded', kind === 'menu' ? 'true' : 'false');
  $('#panel-close').focus({ preventScroll: true });
  releaseHover(); rebuild();
}

function turnBook() {
  if (simTime < bookBusyUntil) return;
  bookState = nextBookState(bookState);
  bookBusyUntil = simTime + .6;
  const el = $('#book'), open = bookState > 0;
  el.classList.toggle('is-open', open);
  el.setAttribute('aria-expanded', String(open));
  $('.book-spread').setAttribute('aria-hidden', String(!open));
  $('.book-cover').setAttribute('aria-hidden', String(open));
  if (open) {
    const spread = BOOK_SPREADS[bookState - 1];
    $('#book-heading').textContent = spread.heading;
    $('#book-copy').textContent = spread.copy;
    $('#book-doodle').textContent = spread.doodle;
    $('#book-left-number').textContent = String(bookState * 2 - 1).padStart(2, '0');
    $('#book-right-number').textContent = String(bookState * 2).padStart(2, '0');
    el.classList.remove('is-turning');
    requestAnimationFrame(() => el.classList.add('is-turning'));
  }
  const next = !open ? 'ОТКРЫТЬ ↗' : bookState < BOOK_SPREADS.length ? 'ЛИСТАТЬ ↗' : 'ЗАКРЫТЬ ×';
  $('#book-hint').textContent = next;
  el.setAttribute('aria-label', open ? `${BOOK_SPREADS[bookState - 1].heading} ${BOOK_SPREADS[bookState - 1].copy} ${bookState < BOOK_SPREADS.length ? 'Перелистнуть' : 'Закрыть книжку'}` : 'Открыть книжку «Вне плана»');
  toast(!open ? 'Поставим закладку на сегодня.' : bookState === 1 ? 'О, кое-что вне плана.' : bookState === 2 ? 'Это как раз про наше радио.' : 'Хм. Смотри под ноги, говоришь…');
  rebuild();
}

function trip() {
  if (fall || !hazardArmed) return;
  fall = { age: 0, angle: player.angle, impact: false };
  hazardArmed = false; player.grip = 0;
  (committed || hovered)?.classList.remove('is-held');
  $('#litter').classList.remove('is-kicked');
  requestAnimationFrame(() => $('#litter').classList.add('is-kicked'));
  toast('Ой. Кто это здесь оставил?');
}

function updateFall(dt) {
  fall.age += dt;
  if (fall.age < .45) {
    const next = { x: player.x + Math.sin(fall.angle) * 45 * dt, y: player.y - Math.cos(fall.angle) * 45 * dt };
    if (nav.valid(next) && nav.clear(player, next)) { player.x = next.x; player.y = next.y; }
  }
  if (fall.age >= .5 && !fall.impact) {
    fall.impact = true;
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2;
      particles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 38, vy: Math.sin(angle) * 30, life: .6, color: '#8a9656', angle });
    }
  }
  setStatus(fall.age < 1.05 ? 'ЧЕЛОВЕК НА ПОЛУ' : 'СЕЙЧАС ВСТАНУ');
  if (fall.age >= 1.7) { fall = null; dirtyGoal = true; toast('Всё хорошо. Продолжаем.'); }
}

function closePanel(restoreFocus = true) {
  if (panel.hidden) return;
  panel.hidden = true; $('.menu-button').setAttribute('aria-expanded', 'false');
  if (restoreFocus) panelReturnFocus?.focus({ preventScroll: true });
  rebuild();
}

function burst(x, y) {
  const colors = [ink, '#f67c47', '#b8a5d5', '#f9f7ed'];
  for (let i = 0; i < 28; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 50 + Math.random() * 150;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 70, life: 1, color: colors[i % 4], angle });
  }
}

function startPress(el, now) {
  if (pressing) return;
  pressing = { el, edge: approach.edge, start: now, fired: false };
  setStatus('НАЖИМАЮ. ДЕРЖИСЬ.');
}

function update(dt, now) {
  if (!initialized) return;
  const previousPlayer = { x: player.x, y: player.y };
  kickAge += dt;
  const recovering = !!fall;
  if (fall) updateFall(dt);
  if (!recovering) updateGoal(now);
  let moved = 0;
  const target = committed || hovered;
  if (!recovering && !pressing && route.length) {
    let budget = 245 * dt;
    const finalDistance = goal ? distance(player, goal) : 100;
    // Slow only at the final destination, never at each pathfinding waypoint.
    budget *= Math.min(1, .25 + finalDistance / 70);
    while (budget > 0 && route.length) {
      const point = route[0], d = distance(player, point);
      if (d < .1) { route.shift(); continue; }
      const step = Math.min(budget, d);
      const next = { x: player.x + (point.x - player.x) / d * step, y: player.y + (point.y - player.y) / d * step };
      if (!nav.clear(player, next)) { route = []; dirtyGoal = true; break; }
      const desired = Math.atan2(point.y - player.y, point.x - player.x) + Math.PI / 2;
      player.angle += Math.atan2(Math.sin(desired - player.angle), Math.cos(desired - player.angle)) * Math.min(1, dt * 17);
      const previous = { x: player.x, y: player.y };
      player.x = next.x; player.y = next.y; moved += step; budget -= step;
      if (step >= d) route.shift();
      if (hazardArmed && hazards.some(hazard => segmentCircleHit(previous, next, hazard))) { trip(); break; }
    }
  }
  player.speed += ((moved / Math.max(dt, .001)) - player.speed) * Math.min(1, dt * 14);
  const kick = ball.step(dt, { from: previousPlayer, to: player, angle: player.angle, radius: 18, enabled: !fall && !recovering && !pressing && player.grip < .5 });
  if (kick) {
    kickAge = 0;
    kickSide = Math.cos(player.angle) * kick.nx + Math.sin(player.angle) * kick.ny < 0 ? -1 : 1;
  }
  // Fold the walking pose near solids so the smaller clearance is also visual.
  // These are cached scene rectangles, without any per-frame layout reads.
  let clearance = Infinity;
  for (const shape of solids) clearance = Math.min(clearance, distanceToShape(player, shape));
  const tuck = Math.max(0, Math.min(1, (38 - clearance) / 12));
  player.tuck += (tuck - player.tuck) * Math.min(1, dt * 18);
  player.stride += moved * .105;
  const arrived = !fall && !recovering && target && goal && distance(player, goal) < 1.5 && route.length === 0;
  const gripTarget = arrived || pressing ? 1 : 0;
  player.grip += (gripTarget - player.grip) * Math.min(1, dt * 11);
  if (arrived || pressing) {
    const n = (pressing?.edge || approach?.edge)?.normal || { x: 0, y: -1 };
    const facing = Math.atan2(-n.y, -n.x) + Math.PI / 2;
    player.angle += Math.atan2(Math.sin(facing - player.angle), Math.cos(facing - player.angle)) * Math.min(1, dt * 15);
    if (target) target.classList.add('is-held');
    if (committed && player.grip > .94 && Math.cos(player.angle - facing) > .98) startPress(committed, now);
    else if (!pressing) setStatus('ДЕРЖУ. МОЖНО КЛИКАТЬ.');
  } else if (!fall && !recovering && moved > .2) setStatus(committed ? 'БЕГУ К ЦЕЛИ' : hovered ? 'СЕЙЧАС ПОДОЙДУ' : 'ИЩУ СВОЙ ПУТЬ');
  else if (!fall && !recovering && !pressing) setStatus('НАПАРНИК НА СВЯЗИ');
  if (!fall && hazards.every(hazard => distance(player, hazard) > hazard.radius + 48)) hazardArmed = true;
  if (pressing) {
    const age = now - pressing.start;
    if (age > 120) pressing.el.classList.add('is-pressed');
    if (age > 410 && !pressing.fired) {
      pressing.fired = true;
      if (pressing.el.dataset.action === 'start' && !celebrated) { burst(player.x, player.y); celebrated = true; }
    }
    if (age > 640) {
      const el = pressing.el;
      el.classList.remove('is-pressed', 'is-held');
      pressing = null; committed = null; releaseHover();
      route = []; goal = null; dirtyGoal = true;
      openPanel(el.dataset.action, el);
    }
  }
  if (moved > .5 && now - lastFoot > 125) {
    const side = (footSide *= -1) * 7;
    footprints.push({ x: player.x + Math.cos(player.angle) * side, y: player.y + Math.sin(player.angle) * side, angle: player.angle, life: 1 });
    lastFoot = now;
    if (footprints.length > 32) footprints.shift();
  }
  for (const f of footprints) f.life -= dt / 2.2;
  footprints = footprints.filter(f => f.life > 0);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 145 * dt; p.life -= dt * 1.1; p.angle += dt * 4; }
  particles = particles.filter(p => p.life > 0);
}

function ellipse(x, y, rx, ry, fill, stroke = ink, line = 1.7) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
}
function rounded(x, y, w, h, r, fill, stroke = ink, outline = 1.7) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = outline; ctx.stroke(); }
}
function line(a, b, color, width) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}
function localPoint(p) {
  const x = p.x - player.x, y = p.y - player.y;
  return { x: x * Math.cos(player.angle) + y * Math.sin(player.angle), y: -x * Math.sin(player.angle) + y * Math.cos(player.angle) };
}

// A two-bone arm, solved in character-local space. Hands meet the actual DOM
// button edge, rather than playing an unrelated looping pose over the scene.
function arm(side, hand, fold = 0) {
  const shoulder = { x: side * 12.5, y: 0 };
  const dx = hand.x - shoulder.x, dy = hand.y - shoulder.y;
  const d = Math.max(.01, Math.hypot(dx, dy));
  // Compact, nearly straight sleeves like the case illustrations; arms unfold
  // only as far as needed to reach the actual interaction edge.
  const length = d / 2 + .2 + fold * 2.2;
  const elbowOffset = Math.sqrt(Math.max(0, length * length - Math.min(d, length * 2) ** 2 / 4));
  const bend = side * (1 - fold * 2);
  const elbow = { x: (shoulder.x + hand.x) / 2 + (-dy / d) * elbowOffset * bend, y: (shoulder.y + hand.y) / 2 + (dx / d) * elbowOffset * bend };
  for (const [color, size] of [[ink, 9], ['#2c332b', 5.5]]) {
    line(shoulder, elbow, color, size); line(elbow, hand, color, size);
  }
  ellipse(hand.x, hand.y, 4.3, 4.3, '#fbf2d8', ink, 2.2);
}

function drawCharacter(now) {
  const pose = fall ? fallPose(fall.age) : { tilt: 0, stretch: 0, rise: 0, impact: 0 };
  const running = fall ? 0 : Math.min(1, player.speed / 150), gait = Math.sin(player.stride) * running;
  const tuck = player.tuck * (1 - player.grip);
  const bounce = Math.sin(player.stride * 2) * running * .75;
  const pressAge = pressing ? now - pressing.start : -1;
  const push = pressAge > 100 && pressAge < 430 ? Math.sin((pressAge - 100) / 330 * Math.PI) * 3.5 : 0;
  const button = pressing?.el || committed || hovered;
  const edge = button && (pressing?.el === button ? pressing.edge : approach?.el === button ? approach.edge : null);
  const n = edge?.normal || { x: 0, y: -1 };
  ctx.save(); ctx.translate(player.x + 5, player.y + 7);
  ctx.rotate(player.angle); ellipse(0, 2, 19 + pose.impact * 7, 15, '#20231e2d', null); ctx.restore();
  if (fall && fall.age >= .5 && fall.age < 1.15) {
    ctx.save(); ctx.translate(player.x, player.y - 24); ctx.rotate(fall.age * 2);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI * 2 / 3);
      line({ x: 13, y: -2 }, { x: 13, y: 2 }, '#d7793e', 1.8);
      line({ x: 11, y: 0 }, { x: 15, y: 0 }, '#d7793e', 1.8);
    }
    ctx.restore();
  }
  ctx.save(); ctx.translate(player.x - n.x * push, player.y + bounce - n.y * push - pose.rise); ctx.rotate(player.angle + pose.tilt);
  ctx.scale(1 + pose.impact * .12, 1 - pose.impact * .22);
  // The illustration's silhouette: broad boots, orange crescent, light head.
  const footBase = 6 - tuck * 4, footSwing = 5 - tuck * 4;
  const bootHeight = 16 - tuck * 3;
  const kick = !fall && !pressing && kickAge < .25 ? Math.cos(kickAge / .25 * Math.PI / 2) : 0;
  const flail = fall && fall.age < .5 ? Math.sin(fall.age * 38) * 6 : 0;
  rounded(-12.5 + tuck - pose.stretch * 3, footBase + gait * footSwing + flail + pose.stretch * 4 - (kickSide < 0 ? kick * 31 : 0), 9.5 - tuck, bootHeight, 3.4, '#343b34', ink, 2.3);
  rounded(3 + pose.stretch * 3, footBase - gait * footSwing - flail + pose.stretch * 4 - (kickSide > 0 ? kick * 31 : 0), 9.5 - tuck, bootHeight, 3.4, '#343b34', ink, 2.3);
  ellipse(0, 0, 15.5, 12.7 + pose.stretch * 4, '#f67c47', ink, 2.4);
  const contact = edge ? closestOnSegment(player, edge.a, edge.b) : null;
  const handSpacing = edge ? Math.min(14, Math.max(3, edge.length / 2 - 5)) : 14;
  for (const side of [-1, 1]) {
    const normal = { x: side * (24 - tuck * 11 + pose.stretch * 5), y: -9 - tuck * 3 + side * gait * (6 - tuck * 5) - pose.stretch * 10 };
    const reach = 3 + (push ? 3 : 0);
    const target = contact ? localPoint({ x: contact.x - edge.tangent.x * side * handSpacing - n.x * reach, y: contact.y - edge.tangent.y * side * handSpacing - n.y * reach }) : normal;
    const grip = player.grip;
    arm(side, { x: normal.x + (target.x - normal.x) * grip, y: normal.y + (target.y - normal.y) * grip }, tuck);
  }
  ctx.save(); ctx.translate(0, -pose.stretch * 5);
  ellipse(0, -5, 12.5, 12.5, '#fbf2d8', ink, 2.4);
  rounded(-8.5, -16.5, 17, 6, 2.2, '#39463c', ink, 2.2);
  ctx.restore();
  ctx.restore();
}

function drawBall() {
  if (!ball.ready) return;
  const r = ball.radius;
  ellipse(ball.x + 4, ball.y + 5, r, r * .8, '#20231e28', null);
  ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.angle);
  ctx.scale(1 + ball.impact * .06, 1 - ball.impact * .06);
  ellipse(0, 0, r, r, '#f9f7ed', ink, 2);
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.clip();
  const vertices = Array.from({ length: 5 }, (_, i) => ({ x: Math.cos(i / 5 * Math.PI * 2 - Math.PI / 2) * r * .43, y: Math.sin(i / 5 * Math.PI * 2 - Math.PI / 2) * r * .43 }));
  ctx.beginPath(); ctx.moveTo(vertices[0].x, vertices[0].y);
  for (const p of vertices.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath(); ctx.fillStyle = '#39463c'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 - Math.PI / 2;
    const p = { x: Math.cos(a) * r * .88, y: Math.sin(a) * r * .88 };
    line(vertices[i], p, ink, 1.1);
    ellipse(p.x, p.y, r * .2, r * .2, i === 2 ? '#f67c47' : '#39463c', ink, 1);
  }
  ctx.restore();
  ellipse(-r * .35, -r * .36, r * .16, r * .11, '#ffffff9c', null);
  ctx.restore();
}

function draw(now) {
  ctx.clearRect(0, 0, width, height);
  if (debug) {
    const contour = points => { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) ctx.lineTo(p.x, p.y); ctx.closePath(); };
    // Solid line: visible object. Dashed line: safe path for the body's center.
    ctx.fillStyle = '#f67c4710'; ctx.strokeStyle = '#d15c3b66'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    for (const obstacle of nav.obstacles) { contour(obstacle.points); ctx.fill(); ctx.stroke(); }
    ctx.setLineDash([]); ctx.strokeStyle = '#d15c3bcc';
    for (const shape of solids) { contour(shapePoints(shape)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(player.x, player.y);
    for (const p of route) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#694d9c'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    for (const p of route) ellipse(p.x, p.y, 3, 3, '#b8a5d5', null);
  }
  for (const f of footprints) {
    ctx.save(); ctx.globalAlpha = f.life * .15; ctx.translate(f.x, f.y); ctx.rotate(f.angle);
    rounded(-2, -3, 4, 7, 1, ink, null); ctx.restore();
  }
  if (cursor.active && !hovered && !committed && !pressing && panel.hidden) {
    const g = nav.nearest(cursor);
    if (g && distance(player, g) > 30) {
      ctx.save(); ctx.translate(g.x, g.y); ctx.strokeStyle = '#20231e70'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 5 + Math.sin(now / 200) * .7, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); line({ x: 9, y: 0 }, { x: 12, y: 0 }, '#20231e55', 1); }
      ctx.restore();
    }
  }
  if (ball.y <= player.y) drawBall();
  drawCharacter(now);
  if (ball.y > player.y) drawBall();
  for (const p of particles) {
    ctx.save(); ctx.globalAlpha = p.life; ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillStyle = p.color; ctx.fillRect(-2, -3, 4, 6); ctx.restore();
  }
  if (speechUntil > simTime) {
    const x = Math.max(speechWidth / 2 + 10, Math.min(width - speechWidth / 2 - 10, player.x));
    const below = player.y < speechHeight + 48;
    speech.classList.toggle('below', below);
    speech.style.setProperty('--tail-x', `${player.x - x}px`);
    speech.style.transform = `translate3d(${x}px,${player.y + (below ? 36 : -35)}px,0) translate(-50%,${below ? '0' : '-100%'})`;
  } else speech.classList.remove('visible');
}

function frame(now) {
  const dt = Math.min((now - (lastTime || now)) / 1000, .035); lastTime = now;
  simTime += dt;
  update(dt, simTime * 1000); draw(simTime * 1000);
  frameId = requestAnimationFrame(frame);
}

// Pointer events never cause layout reads; only resize/font/panel changes do.
document.addEventListener('pointermove', event => {
  cursor.x = event.clientX; cursor.y = event.clientY + scrollY; cursor.active = true;
  $('#coord-x').textContent = String(Math.round(cursor.x)).padStart(3, '0');
  $('#coord-y').textContent = String(Math.round(cursor.y)).padStart(3, '0');
  if (committed || pressing) return;
  const el = event.target.closest('[data-action]');
  const next = el && targets.has(el) ? el : null;
  if (next !== hovered) { releaseHover(); hovered = next; dirtyGoal = true; }
});
document.documentElement.addEventListener('pointerleave', () => {
  cursor.active = false;
  if (!committed && !pressing) { releaseHover(); route = []; goal = null; dirtyGoal = true; }
});
document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  event.preventDefault();
  if (el.dataset.action === 'radio') void radio.prepare().catch(() => toast('Не удалось поймать волну. Попробуй ещё раз.'));
  if (event.detail === 0 || matchMedia('(pointer: coarse)').matches) { openPanel(el.dataset.action, el); return; }
  if (pressing || committed || fall) { toast(fall ? 'Секунду, сначала встану.' : 'Секунду, уже выполняю.'); return; }
  if (el.dataset.action === 'book' && simTime < bookBusyUntil) { toast('Сейчас переверну страницу.'); return; }
  if (!targets.has(el)) return;
  if (!panel.hidden) closePanel(false);
  const keepDock = hovered === el && goal && !dirtyGoal;
  releaseHover(); hovered = el; committed = el; dirtyGoal = !keepDock;
  if (!keepDock) goal = null;
  setStatus('БЕГУ К ЦЕЛИ');
});
$('#panel-close').addEventListener('click', () => closePanel());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!panel.hidden) closePanel();
    else if (!pressing) { committed = null; releaseHover(); route = []; goal = null; cursor.active = false; dirtyGoal = true; }
  }
});
addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(rebuild); });
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frameId); lastTime = 0;
  document.body.classList.toggle('is-hidden', document.hidden);
  radio.visibility(document.hidden);
  if (!document.hidden) frameId = requestAnimationFrame(frame);
});
$('#book').addEventListener('animationend', event => { if (event.animationName === 'page-turn') $('#book').classList.remove('is-turning'); });
addEventListener('pagehide', event => { cancelAnimationFrame(frameId); if (event.persisted) radio.visibility(true); else radio.dispose(); });
addEventListener('pageshow', event => { if (event.persisted && !document.hidden) { lastTime = 0; cancelAnimationFrame(frameId); radio.visibility(false); frameId = requestAnimationFrame(frame); } });
rebuild();
document.fonts.ready.then(rebuild);
frameId = requestAnimationFrame(frame);
