import { roundedRectangle, shapePoints, polygonBounds } from './polygons.js';

// Text containers often include empty layout space (e.g. a full-width flex
// caption). Measure actual text runs, never turn that empty space into a wall.
export function measureInk(element, origin) {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, 4 /* SHOW_TEXT */);
  const rects = [];
  let text;
  while ((text = walker.nextNode())) {
    const value = text.textContent, first = value.search(/\S/);
    if (first < 0) continue;
    const range = doc.createRange();
    range.setStart(text, first);
    range.setEnd(text, value.trimEnd().length);
    for (const r of range.getClientRects()) {
      if (r.width > .5 && r.height > .5) rects.push(relativeRect(r, origin));
    }
  }
  for (const graphic of element.querySelectorAll('svg, .live-dot')) {
    rects.push(relativeRect(graphic.getBoundingClientRect(), origin));
  }
  return rects;
}

export function relativeRect(rect, origin) {
  return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
}

// Pure mapping of an element-local outline into the page. The measured AABB is
// used only to recover translation; collisions use the transformed contour.
export function transformedOutline(width, height, radii, matrix, bounds, origin) {
  const linear = p => ({ x: matrix.a * p.x + matrix.c * p.y, y: matrix.b * p.x + matrix.d * p.y });
  const outer = shapePoints({ x: 0, y: 0, w: width, h: height }).map(linear);
  const linearBounds = polygonBounds(outer);
  const dx = bounds.left - origin.left - linearBounds.x, dy = bounds.top - origin.top - linearBounds.y;
  const map = p => { const q = linear(p); return { x: q.x + dx, y: q.y + dy }; };
  const points = roundedRectangle(width, height, radii).map(map);
  if (matrix.a * matrix.d - matrix.b * matrix.c < 0) points.reverse();
  const corners = shapePoints({ x: 0, y: 0, w: width, h: height }).map(map);
  const center = map({ x: width / 2, y: height / 2 });
  const edges = corners.map((point, index) => {
    let a = point, b = corners[(index + 1) % corners.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const normal = { x: tangent.y, y: -tangent.x };
    if ((center.x - a.x) * normal.x + (center.y - a.y) * normal.y > 0) {
      normal.x *= -1; normal.y *= -1; tangent.x *= -1; tangent.y *= -1;
      [a, b] = [b, a];
    }
    return { a, b, tangent, normal, length, side: ['top', 'right', 'bottom', 'left'][index] };
  });
  return { points, edges, edge: edges[0] };
}

export function measureOutline(element, origin, root) {
  const style = getComputedStyle(element);
  let matrix = new DOMMatrixReadOnly();
  for (let node = element; node && node !== root; node = node.parentElement) {
    const transform = (node === element ? style : getComputedStyle(node)).transform;
    if (transform && transform !== 'none') matrix = new DOMMatrixReadOnly(transform).multiply(matrix);
  }
  const cornerElement = element.id === 'book' ? element.querySelector(element.classList.contains('is-open') ? '.book-spread' : '.book-cover') : element;
  const corners = cornerElement === element ? style : getComputedStyle(cornerElement);
  const radii = [corners.borderTopLeftRadius, corners.borderTopRightRadius, corners.borderBottomRightRadius, corners.borderBottomLeftRadius].map(value => parseFloat(value) || 0);
  return transformedOutline(parseFloat(style.width) || element.offsetWidth, parseFloat(style.height) || element.offsetHeight,
    radii, matrix, element.getBoundingClientRect(), origin);
}

export function segmentCircleHit(a, b, circle) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((circle.x - a.x) * dx + (circle.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(a.x + dx * t - circle.x, a.y + dy * t - circle.y) <= circle.radius;
}

export const BOOK_SPREADS = [
  { heading: 'Сверни с маршрута.', copy: 'Самые интересные места редко стоят первыми в списке.', doodle: '↗' },
  { heading: 'Настрой свою волну.', copy: 'Хорошая музыка делает даже короткую прогулку чуть длиннее.', doodle: '♫' },
  { heading: 'Смотри под ноги.', copy: 'Если споткнулся — выдохни, поднимись и продолжай. Здесь никто не торопит.', doodle: '✳' }
];

// Closed → first spread → second → third → closed.
export const nextBookState = state => (state + 1) % (BOOK_SPREADS.length + 1);

export function fallPose(age) {
  const smooth = t => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
  if (age < .22) { const t = smooth(age / .22); return { tilt: t * .6, stretch: t, rise: 0, impact: 0 }; }
  if (age < .5) { const t = smooth((age - .22) / .28); return { tilt: .6 + t * .9, stretch: 1, rise: Math.sin(t * Math.PI) * 3, impact: t }; }
  if (age < 1.05) return { tilt: 1.5, stretch: 1, rise: 0, impact: 1 };
  const t = smooth((age - 1.05) / .65);
  return { tilt: (1 - t) * 1.5, stretch: 1 - t, rise: Math.sin(t * Math.PI) * 2, impact: 1 - t };
}
