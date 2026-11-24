const EPS = 1e-8;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const lerpPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function shapePoints(shape) {
  if (shape.points) return shape.points;
  const { x, y, w, h } = shape;
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

export function polygonBounds(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function containsPoint(p, points) {
  for (let i = 0; i < points.length; i++) {
    if (cross(sub(points[(i + 1) % points.length], points[i]), sub(p, points[i])) < -EPS) return false;
  }
  return true;
}

// Expand in the contour's own normals, preserving rotation and rounded corners.
export function offsetPolygon(points, amount) {
  if (!amount) return points.map(p => ({ ...p }));
  const edges = points.map((p, i) => {
    const v = sub(points[(i + 1) % points.length], p), length = Math.hypot(v.x, v.y);
    return { v, n: { x: v.y / length, y: -v.x / length } };
  });
  return points.map((p, i) => {
    const before = edges[(i + points.length - 1) % points.length], after = edges[i];
    const a = { x: p.x + before.n.x * amount, y: p.y + before.n.y * amount };
    const b = { x: p.x + after.n.x * amount, y: p.y + after.n.y * amount };
    const denominator = cross(before.v, after.v);
    if (Math.abs(denominator) < EPS) return b;
    const t = cross(sub(b, a), after.v) / denominator;
    return { x: a.x + before.v.x * t, y: a.y + before.v.y * t };
  });
}

// The portion of a segment inside a convex polygon, including tangency.
export function clipSegment(a, b, points) {
  let enter = 0, exit = 1;
  const direction = sub(b, a);
  for (let i = 0; i < points.length; i++) {
    const edge = sub(points[(i + 1) % points.length], points[i]);
    const fromEdge = cross(edge, sub(a, points[i])), slope = cross(edge, direction);
    if (Math.abs(slope) < EPS) { if (fromEdge < -EPS) return null; }
    else {
      const t = -fromEdge / slope;
      if (slope > 0) enter = Math.max(enter, t);
      else exit = Math.min(exit, t);
      if (enter > exit + EPS) return null;
    }
  }
  return [Math.max(0, enter), Math.min(1, exit)];
}

export function closestOnSegment(p, a, b) {
  const v = sub(b, a), squared = v.x * v.x + v.y * v.y;
  const t = squared ? Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / squared)) : 0;
  return lerpPoint(a, b, t);
}

export function distanceToShape(p, shape) {
  const points = shapePoints(shape);
  if (containsPoint(p, points)) return 0;
  let result = Infinity;
  for (let i = 0; i < points.length; i++) {
    const q = closestOnSegment(p, points[i], points[(i + 1) % points.length]);
    result = Math.min(result, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return result;
}

export function roundedRectangle(width, height, radii = [0, 0, 0, 0], steps = 3) {
  const [tl, tr, br, bl] = radii.map(r => Math.max(0, Math.min(r, width / 2, height / 2)));
  const corners = [
    { x: width - tr, y: tr, r: tr, angle: -Math.PI / 2 },
    { x: width - br, y: height - br, r: br, angle: 0 },
    { x: bl, y: height - bl, r: bl, angle: Math.PI / 2 },
    { x: tl, y: tl, r: tl, angle: Math.PI }
  ];
  const points = [];
  for (const corner of corners) {
    for (let i = 0; i <= (corner.r ? steps : 0); i++) {
      const angle = corner.angle + i / steps * Math.PI / 2;
      const p = { x: corner.x + Math.cos(angle) * corner.r, y: corner.y + Math.sin(angle) * corner.r };
      if (!points.length || Math.hypot(p.x - points.at(-1).x, p.y - points.at(-1).y) > EPS) points.push(p);
    }
  }
  return points;
}
