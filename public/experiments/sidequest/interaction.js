// A single docking policy for every interactive object in the scene.
// Compare complete collision-free paths to all four sides, not direct distance.
export function chooseDock(nav, start, target, { inset = 26, standOff = 30 } = {}) {
  let best = null;
  for (const edge of target.edges) {
    const { a, b, tangent: u, normal: n, length } = edge;
    const margin = Math.min(inset, length / 2);
    const plan = nav.routeToSegment(start, {
      a: { x: a.x + u.x * margin + n.x * standOff, y: a.y + u.y * margin + n.y * standOff },
      b: { x: b.x - u.x * margin + n.x * standOff, y: b.y - u.y * margin + n.y * standOff }
    });
    if (plan && (!best || plan.length < best.length - 1e-6)) best = { ...plan, edge };
  }
  return best;
}
