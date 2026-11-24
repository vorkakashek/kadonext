import { shapePoints, polygonBounds, containsPoint, closestOnSegment } from './polygons.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const RESTITUTION = .82;
const MAX_SPEED = 900;

// One rolling circle in the scene's existing, measured world coordinates.
// Substeps keep relative travel below half a radius, including moving feet,
// so even a narrow text stroke cannot be crossed between collision checks.
export class PlayBall {
  constructor(radius = 14) {
    this.radius = radius;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.angle = 0; this.impact = 0; this.cooldown = 0; this.ready = false;
    this.obstacles = []; this.bounds = { x: 0, y: 0, w: 1, h: 1 };
  }

  setScene(shapes, bounds) {
    this.bounds = bounds;
    this.obstacles = shapes.map(shape => {
      const points = shapePoints(shape);
      return { points, bounds: polygonBounds(points) };
    });
    if (this.ready) this.settle();
  }

  reset(point) {
    this.x = point.x; this.y = point.y;
    this.vx = 0; this.vy = 0; this.ready = true;
    this.settle();
  }

  reflect(nx, ny) {
    const inward = this.vx * nx + this.vy * ny;
    if (inward >= 0) return;
    this.vx -= (1 + RESTITUTION) * inward * nx;
    this.vy -= (1 + RESTITUTION) * inward * ny;
    this.impact = Math.min(1, Math.abs(inward) / 450);
  }

  walls() {
    const b = this.bounds, r = this.radius;
    const left = b.x + r, right = Math.max(left, b.x + b.w - r);
    const top = b.y + r, bottom = Math.max(top, b.y + b.h - r);
    if (this.x < left) { this.x = left; this.reflect(1, 0); }
    if (this.x > right) { this.x = right; this.reflect(-1, 0); }
    if (this.y < top) { this.y = top; this.reflect(0, 1); }
    if (this.y > bottom) { this.y = bottom; this.reflect(0, -1); }
  }

  collide(obstacle) {
    const r = this.radius, b = obstacle.bounds;
    if (this.x < b.x - r || this.x > b.x + b.w + r || this.y < b.y - r || this.y > b.y + b.h + r) return false;
    const points = obstacle.points;
    const inside = containsPoint(this, points);
    let nearest = null, length = Infinity, normal = null;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], next = points[(i + 1) % points.length];
      const q = closestOnSegment(this, a, next);
      const distance = Math.hypot(this.x - q.x, this.y - q.y);
      if (distance >= length) continue;
      length = distance; nearest = q;
      const edgeLength = Math.hypot(next.x - a.x, next.y - a.y) || 1;
      normal = { x: (next.y - a.y) / edgeLength, y: -(next.x - a.x) / edgeLength };
    }
    if (!nearest || (!inside && length >= r)) return false;
    if (!inside && length > 1e-7) normal = { x: (this.x - nearest.x) / length, y: (this.y - nearest.y) / length };
    this.x = nearest.x + normal.x * (r + .01);
    this.y = nearest.y + normal.y * (r + .01);
    this.reflect(normal.x, normal.y);
    return true;
  }

  settle() {
    // Multiple passes handle a corner shared by several text/object contours.
    for (let pass = 0; pass < 8; pass++) {
      this.walls();
      let collided = false;
      for (const obstacle of this.obstacles) collided = this.collide(obstacle) || collided;
      if (!collided) break;
    }
    this.walls();
  }

  isFree() {
    const b = this.bounds, r = this.radius;
    if (this.x < b.x + r || this.x > b.x + b.w - r || this.y < b.y + r || this.y > b.y + b.h - r) return false;
    return this.obstacles.every(obstacle => {
      if (containsPoint(this, obstacle.points)) return false;
      return obstacle.points.every((point, i, points) => {
        const q = closestOnSegment(this, point, points[(i + 1) % points.length]);
        return Math.hypot(this.x - q.x, this.y - q.y) >= r - .02;
      });
    });
  }

  step(dt, actor = null) {
    if (!this.ready || dt <= 0) return null;
    dt = Math.min(dt, .05);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.impact *= Math.exp(-dt * 14);
    let kick = null;
    const avx = actor ? (actor.to.x - actor.from.x) / dt : 0;
    const avy = actor ? (actor.to.y - actor.from.y) / dt : 0;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAX_SPEED) { this.vx *= MAX_SPEED / speed; this.vy *= MAX_SPEED / speed; }
    const actorSpeed = Math.hypot(avx, avy);
    const travelSpeed = actor?.enabled && actorSpeed > 25 ? MAX_SPEED : Math.min(speed, MAX_SPEED);
    const steps = Math.max(1, Math.ceil((travelSpeed + actorSpeed) * dt / (this.radius * .45)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.x += this.vx * h; this.y += this.vy * h;
      if (actor?.enabled) {
        const t = (i + 1) / steps;
        const x = actor.from.x + (actor.to.x - actor.from.x) * t;
        const y = actor.from.y + (actor.to.y - actor.from.y) * t;
        const dx = this.x - x, dy = this.y - y, d = Math.hypot(dx, dy);
        const nx = d > .001 ? dx / d : Math.sin(actor.angle);
        const ny = d > .001 ? dy / d : -Math.cos(actor.angle);
        const contact = this.radius + (actor.radius ?? 18);
        const closing = avx * nx + avy * ny;
        const ahead = Math.sin(actor.angle) * nx - Math.cos(actor.angle) * ny;
        if (d < contact + 9 && closing > 25 && ahead > .45 && this.cooldown === 0) {
          const power = clamp(180 + closing * 1.7, 220, 780);
          this.vx = nx * power + (avx - closing * nx) * .25;
          this.vy = ny * power + (avy - closing * ny) * .25;
          this.cooldown = .24; this.impact = .5;
          kick = { nx, ny, power };
        }
        if (d < contact) {
          // A kinematic body can squeeze the ball against a wall. Limit this
          // correction too: a full separation jump could cross a thin letter.
          const correction = Math.min(contact + .01 - d, this.radius * .35);
          this.x += nx * correction; this.y += ny * correction;
          const inward = (this.vx - avx) * nx + (this.vy - avy) * ny;
          if (inward < 0) { this.vx -= inward * 1.65 * nx; this.vy -= inward * 1.65 * ny; }
        }
      }
      this.settle();
      this.angle += (this.vx * .7 + this.vy * .3) / this.radius * h;
      const friction = Math.exp(-.85 * h);
      this.vx *= friction; this.vy *= friction;
    }
    if (Math.hypot(this.vx, this.vy) < 5) this.vx = this.vy = 0;
    return kick;
  }
}
