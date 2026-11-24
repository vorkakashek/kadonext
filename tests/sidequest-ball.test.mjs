import test from 'node:test'
import assert from 'node:assert/strict'
import { PlayBall } from '../public/experiments/sidequest/ball.js'
import { shapePoints } from '../public/experiments/sidequest/polygons.js'

const bounds = { x: 0, y: 0, w: 500, h: 350 }
function create(point = { x: 100, y: 100 }, shapes = [], box = bounds) {
  const ball = new PlayBall(14)
  ball.setScene(shapes, box)
  ball.reset(point)
  return ball
}
function advance(ball, seconds) {
  for (let time = 0; time < seconds - 1e-8; time += 1 / 120) ball.step(Math.min(1 / 120, seconds - time))
}

test('ball rebounds from all four page edges, losing energy', () => {
  for (const [vx, vy] of [[900, 0], [-900, 0], [0, 900], [0, -900]]) {
    const ball = create({ x: 100, y: 100 }, [], { x: 0, y: 0, w: 200, h: 200 })
    ball.vx = vx; ball.vy = vy
    advance(ball, .15)
    assert.ok(ball.vx * vx + ball.vy * vy < 0, 'Velocity should point away from the wall')
    assert.ok(Math.hypot(ball.vx, ball.vy) < 900)
    assert.ok(ball.isFree())
  }
})

test('fast ball cannot tunnel through a one-pixel text obstacle at a slow frame rate', () => {
  const ball = create({ x: 150, y: 100 }, [{ x: 180, y: 40, w: 1, h: 150 }])
  ball.vx = 900
  ball.step(.05)
  assert.ok(ball.vx < 0)
  assert.ok(ball.x <= 180 - ball.radius)
  assert.ok(ball.isFree())
})

test('rotated objects reflect along their actual edge normal', () => {
  const angle = Math.PI / 4
  const points = shapePoints({ x: 0, y: 0, w: 150, h: 25 }).map(p => ({
    x: 210 + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: 100 + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }))
  const ball = create({ x: 170, y: 150 }, [{ points }])
  ball.vx = 700
  advance(ball, .18)
  assert.ok(ball.vy > 200, 'The sloped edge should deflect the ball downwards')
  assert.ok(ball.isFree())
})

test('moving companion kicks on contact and a standing companion does not generate kicks', () => {
  const ball = create()
  const kick = ball.step(.02, { from: { x: 62, y: 100 }, to: { x: 67, y: 100 }, angle: Math.PI / 2, enabled: true })
  assert.ok(kick)
  assert.ok(ball.vx > 400)
  assert.ok(ball.x > 100)
  const resting = create()
  assert.equal(resting.step(.02, { from: { x: 65, y: 100 }, to: { x: 65, y: 100 }, angle: Math.PI / 2, enabled: true }), null)
  assert.equal(resting.vx, 0)
})

test('falling or pressing companion cannot kick, and a nearby ball behind the companion is not kicked', () => {
  for (const [enabled, angle] of [[false, Math.PI / 2], [true, -Math.PI / 2]]) {
    const ball = create()
    assert.equal(ball.step(.02, { from: { x: 62, y: 100 }, to: { x: 67, y: 100 }, angle, enabled }), null)
  }
})

test('resting body reflects an incoming ball without repeatedly accelerating it', () => {
  const ball = create({ x: 145, y: 100 })
  ball.vx = -600
  for (let i = 0; i < 8; i++) {
    assert.equal(ball.step(.01, { from: { x: 100, y: 100 }, to: { x: 100, y: 100 }, angle: 0, enabled: true }), null)
  }
  assert.ok(ball.vx > 0 && ball.vx < 600)
  assert.ok(ball.x > 132)
})

test('companion cannot push the ball through thin text when it is trapped against a wall', () => {
  const ball = create({ x: 165, y: 100 }, [{ x: 180, y: 40, w: 1, h: 150 }])
  for (let i = 0; i < 60; i++) {
    const x = Math.min(160, 125 + i)
    ball.step(.01, { from: { x, y: 100 }, to: { x: Math.min(160, x + 1), y: 100 }, angle: Math.PI / 2, enabled: true })
    assert.ok(ball.x <= 166, `Pushed through text at step ${i}`)
    assert.ok(ball.isFree())
  }
})

test('layout changes eject the ball from moved objects and resized boundaries', () => {
  const ball = create({ x: 450, y: 300 })
  ball.setScene([], { x: 0, y: 0, w: 300, h: 200 })
  assert.ok(ball.isFree())
  ball.reset({ x: 140, y: 100 })
  ball.setScene([{ x: 120, y: 80, w: 80, h: 60 }], bounds)
  assert.ok(ball.isFree())
})

test('rolling stops under friction and remains stable through repeated corner impacts', () => {
  const ball = create({ x: 80, y: 60 }, [{ x: 170, y: 100, w: 95, h: 35 }, { x: 350, y: 130, w: 25, h: 130 }])
  ball.vx = 780; ball.vy = 610
  for (let i = 0; i < 1800; i++) {
    ball.step(i % 3 === 0 ? .035 : 1 / 120)
    assert.ok(Number.isFinite(ball.x + ball.y + ball.angle))
    assert.ok(ball.isFree(), `Ball penetrated a solid at step ${i}`)
  }
  assert.equal(ball.vx, 0)
  assert.equal(ball.vy, 0)
  assert.notEqual(ball.angle, 0)
})
