/**
 * rectangle / line-segment intersection.
 * Adapted from http://stackoverflow.com/questions/99353/how-to-test-if-a-line-segment-intersects-an-axis-aligned-rectange-in-2d
 */

module.exports.isectRectangleLine = function (rMinX, rMinY, rMaxX, rMaxY, x1, y1, x2, y2) {
  // Find min and max X for the segment
  var minX = x1
  var maxX = x2

  if (x1 > x2) {
    minX = x2
    maxX = x1
  }

  // Find the intersection of the segment's and rectangle's x-projections
  if (maxX > rMaxX) maxX = rMaxX

  if (minX < rMinX) minX = rMinX

  // If their projections do not intersect return false
  if (minX > maxX) return false

  // Find corresponding min and max Y for min and max X we found before
  var minY = y1
  var maxY = y2

  var dx = x2 - x1

  if (Math.abs(dx) > 0.0000001) {
    var a = (y2 - y1) / dx
    var b = y1 - a * x1
    minY = a * minX + b
    maxY = a * maxX + b
  }

  if (minY > maxY) {
    var tmp = maxY
    maxY = minY
    minY = tmp
  }

  // Find the intersection of the segment's and rectangle's y-projections
  if (maxY > rMaxY) maxY = rMaxY

  if (minY < rMinY) minY = rMinY

  // If Y-projections do not intersect return false
  if (minY > maxY) return false

  return true
}

/**
 * Closest point on line segment (x1, y1, x2, y2) to another point (x, y)
 * Adapted from http://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment/12185597
 */

var closestPointOnLine = function (x, y, x1, y1, x2, y2) {
  var A = x - x1
  var B = y - y1
  var C = x2 - x1
  var D = y2 - y1

  var dot = A * C + B * D
  var len_sq = C * C + D * D
  var param = -1

  if (len_sq !== 0) { // in case of 0 length line
    param = dot / len_sq
  }

  var xx, yy

  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }

  return [xx, yy]
}

module.exports.closestPointOnLine = closestPointOnLine

/**
 * Basic linear distance function
 */

var distance = function (x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Closest point along a polyline shape to another point
 */

module.exports.closestPoint = function (shape, x, y) {
  let bestDist = Infinity
  let bestPt
  let bestTraversed

  let traversed = 0
  for (let i = 0; i < shape.length - 1; i++) {
    const segPt = closestPointOnLine(x, y, shape[i][0], shape[i][1], shape[i + 1][0], shape[i + 1][1])
    const dist = distance(x, y, segPt[0], segPt[1])
    if (dist < bestDist) {
      bestDist = dist
      bestPt = segPt
      bestTraversed = traversed + distance(shape[i][0], shape[i][1], segPt[0], segPt[1])
    }
    traversed += distance(shape[i][0], shape[i][1], shape[i + 1][0], shape[i + 1][1])
  }
  // console.log('bT=' + bestTraversed)
  return {
    point: bestPt,
    distance: bestDist,
    traversed: bestTraversed
  }
}

/**
 * Finds point along a polyline shape at a given distance from the start
 */

module.exports.pointAlong = function (shape, t) {
  if (t <= 0) return shape[0]

  let traversed = 0
  for (let i = 0; i < shape.length - 1; i++) {
    const segmentLength = distance(shape[i][0], shape[i][1], shape[i + 1][0], shape[i + 1][1])

    if (t < traversed + segmentLength) { // point is on this segment
      const pct = (t - traversed) / segmentLength // pct along this segment
      const x = shape[i][0] + pct * (shape[i + 1][0] - shape[i][0])
      const y = shape[i][1] + pct * (shape[i + 1][1] - shape[i][1])
      return [x, y]
    }
    traversed += segmentLength
  }
  // t is greater than the length of the shape; return the last point
  return shape[shape.length - 1]
}

var bboxIsect = function (a, b) {
  return (Math.abs(a.x - b.x) * 2 < (a.w + b.w)) &&
         (Math.abs(a.y - b.y) * 2 < (a.h + b.h))
}

module.exports.bboxIsect = bboxIsect
