export function interiorAnchor(geometry) {
  const rings = geometry?.type === 'Polygon' ? geometry.coordinates : geometry?.type === 'MultiPolygon' ? largestPolygon(geometry.coordinates) : null;
  if (!rings?.[0]?.length) throw new Error('feature requires Polygon or MultiPolygon geometry');
  const ring = rings[0];
  const centroid = polygonCentroid(ring);
  if (pointInSurface(centroid, rings)) return centroid;
  const average = ring.slice(0, -1).reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  const fallback = [average[0] / Math.max(ring.length - 1, 1), average[1] / Math.max(ring.length - 1, 1)];
  if (pointInSurface(fallback, rings)) return fallback;
  return gridInteriorPoint(rings, centroid) ?? ring[0];
}

function largestPolygon(polygons) {
  return polygons.reduce((largest, polygon) => polygonArea(polygon) > polygonArea(largest) ? polygon : largest);
}
function polygonArea(rings) { return area(rings[0]) - rings.slice(1).reduce((sum, ring) => sum + area(ring), 0); }
function area(ring) {
  return Math.abs(ring.slice(1).reduce((sum, point, index) => sum + ring[index][0] * point[1] - point[0] * ring[index][1], 0) / 2);
}
function polygonCentroid(ring) {
  let twiceArea = 0; let x = 0; let y = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, y0] = ring[index]; const [x1, y1] = ring[index + 1]; const cross = x0 * y1 - x1 * y0;
    twiceArea += cross; x += (x0 + x1) * cross; y += (y0 + y1) * cross;
  }
  return twiceArea ? [x / (3 * twiceArea), y / (3 * twiceArea)] : ring[0];
}
function pointInPolygon([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index]; const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInSurface(point, rings) {
  return pointInPolygon(point, rings[0]) && !rings.slice(1).some(ring => pointInPolygon(point, ring));
}
function gridInteriorPoint(rings, preferred) {
  const ring = rings[0];
  const xs = ring.map(point => point[0]);
  const ys = ring.map(point => point[1]);
  const [minimumX, maximumX] = [Math.min(...xs), Math.max(...xs)];
  const [minimumY, maximumY] = [Math.min(...ys), Math.max(...ys)];
  let selected;
  let distance = Infinity;
  for (let xIndex = 0; xIndex < 32; xIndex += 1) for (let yIndex = 0; yIndex < 32; yIndex += 1) {
    const point = [minimumX + (xIndex + 0.5) * (maximumX - minimumX) / 32, minimumY + (yIndex + 0.5) * (maximumY - minimumY) / 32];
    const candidateDistance = (point[0] - preferred[0]) ** 2 + (point[1] - preferred[1]) ** 2;
    if (candidateDistance < distance && pointInSurface(point, rings)) { selected = point; distance = candidateDistance; }
  }
  return selected;
}
