import { shapePoints, polygonBounds, containsPoint, offsetPolygon, clipSegment, closestOnSegment, lerpPoint } from './polygons.js';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const inside = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
export const inflate = (r, amount) => ({ x: r.x - amount, y: r.y - amount, w: r.w + amount * 2, h: r.h + amount * 2 });
export const intersects = (a, b, shape) => clipSegment(a, b, shapePoints(shape)) !== null;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export class Navigator {
  constructor(shapes, bounds, radius = 18) {
    this.bounds = bounds;
    // Compact body footprint plus a small gap; grip width stays independent.
    this.radius = radius;
    this.obstacles = shapes.map(shape => {
      const points = offsetPolygon(shapePoints(shape), radius);
      return { points, bounds: polygonBounds(points), routingPoints: offsetPolygon(points, .7) };
    });
    this.nodes = [];
    for (const obstacle of this.obstacles) for (const p of obstacle.routingPoints) if (this.valid(p)) this.nodes.push(p);
    for (const x of [bounds.x, bounds.x + bounds.w]) for (const y of [bounds.y, bounds.y + bounds.h]) {
      if (this.valid({ x, y })) this.nodes.push({ x, y });
    }
    this.edges = this.nodes.map(() => []);
    for (let i = 0; i < this.nodes.length; i++) for (let j = i + 1; j < this.nodes.length; j++) {
      if (!this.clear(this.nodes[i], this.nodes[j])) continue;
      const cost = distance(this.nodes[i], this.nodes[j]);
      this.edges[i].push([j, cost]); this.edges[j].push([i, cost]);
    }
  }

  valid(p) {
    const b = this.bounds;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
      && !this.obstacles.some(o => this.inBounds(p, o.bounds) && containsPoint(p, o.points));
  }

  inBounds(p, b) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }

  clear(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
    return !this.obstacles.some(o => {
      const r = o.bounds;
      if (right < r.x || x > r.x + r.w || bottom < r.y || y > r.y + r.h) return false;
      return clipSegment(a, b, o.points) !== null;
    });
  }

  nearest(p) {
    const b = this.bounds, base = { x: clamp(p.x, b.x, b.x + b.w), y: clamp(p.y, b.y, b.y + b.h) };
    if (this.valid(base)) return base;
    const candidates = [...this.nodes];
    for (const { routingPoints: points } of this.obstacles) for (let i = 0; i < points.length; i++) {
      candidates.push(closestOnSegment(base, points[i], points[(i + 1) % points.length]));
    }
    return candidates.filter(c => this.valid(c)).sort((a, c) => distance(a, base) - distance(c, base))[0] ?? null;
  }

  // Shortest route to any free point along an edge, including rotated edges.
  routeToSegment(start, segment) {
    const a = segment.a ?? { x: segment.x1, y: segment.y };
    const b = segment.b ?? { x: segment.x2, y: segment.y };
    if (!this.valid(start)) return null;
    const bounded = clipSegment(a, b, shapePoints(this.bounds));
    if (!bounded) return null;
    let intervals = [bounded];
    for (const obstacle of this.obstacles) {
      const blocked = clipSegment(a, b, obstacle.routingPoints);
      if (!blocked) continue;
      const [left, right] = blocked;
      intervals = intervals.flatMap(([low, high]) => {
        if (right < low || left > high) return [[low, high]];
        const pieces = [];
        if (low < left) pieces.push([low, left]);
        if (right < high) pieces.push([right, high]);
        return pieces;
      });
    }
    if (!intervals.length) return null;
    const nodes = [...this.nodes, start], startId = nodes.length - 1;
    const costs = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
    const open = new Set([startId]);
    const startEdges = this.nodes.flatMap((p, i) => this.clear(start, p) ? [[i, distance(start, p)]] : []);
    costs[startId] = 0;
    let best = null;
    while (open.size) {
      let current = -1, lowest = Infinity;
      for (const id of open) if (costs[id] < lowest) { current = id; lowest = costs[id]; }
      if (best && lowest >= best.length) break;
      open.delete(current);
      const from = nodes[current];
      for (const [low, high] of intervals) {
        const first = lerpPoint(a, b, low), last = lerpPoint(a, b, high);
        for (const goal of [closestOnSegment(from, first, last), first, last]) {
          const length = lowest + distance(from, goal);
          if ((!best || length < best.length) && this.valid(goal) && this.clear(from, goal)) best = { goal, length, via: current };
        }
      }
      for (const [next, step] of current === startId ? startEdges : this.edges[current]) {
        const cost = lowest + step;
        if (cost >= costs[next] || (best && cost >= best.length)) continue;
        costs[next] = cost; prev[next] = current; open.add(next);
      }
    }
    if (!best) return null;
    const route = [best.goal];
    for (let at = best.via; at !== startId; at = prev[at]) route.unshift(nodes[at]);
    return { goal: best.goal, route, length: best.length };
  }

  route(start, requestedEnd) {
    const end = this.nearest(requestedEnd);
    if (!end || !this.valid(start)) return [];
    if (this.clear(start, end)) return [end];
    const nodes = [...this.nodes, start, end], startId = nodes.length - 2, endId = nodes.length - 1;
    const edges = this.edges.map(e => [...e]); edges.push([], []);
    for (let i = 0; i < startId; i++) for (const id of [startId, endId]) {
      if (!this.clear(nodes[i], nodes[id])) continue;
      const cost = distance(nodes[i], nodes[id]);
      edges[i].push([id, cost]); edges[id].push([i, cost]);
    }
    const cost = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
    const open = new Set([startId]); cost[startId] = 0;
    while (open.size) {
      let current = -1, score = Infinity;
      for (const id of open) {
        const f = cost[id] + distance(nodes[id], end);
        if (f < score) { score = f; current = id; }
      }
      if (current === endId) {
        const result = [];
        for (let at = endId; at !== startId; at = prev[at]) result.unshift(nodes[at]);
        return result;
      }
      open.delete(current);
      for (const [next, step] of edges[current]) {
        if (cost[current] + step >= cost[next]) continue;
        cost[next] = cost[current] + step; prev[next] = current; open.add(next);
      }
    }
    return [];
  }
}
