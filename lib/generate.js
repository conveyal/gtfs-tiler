const Canvas = require('canvas-prebuilt')
const fs = require('fs')
const GlobalMercator = require('globalmercator')
const fetch = require('isomorphic-fetch')

const linegeom = require('./linegeom')

let tileCount = 0 // a counter for the number of tiles rendered

// load the config
const config = require('../config')

// create the tile output and/or feed data cache directories if needed
if (!fs.existsSync('./cache')) fs.mkdirSync('./cache')
if (!fs.existsSync(`./${config.output.directory}`)) fs.mkdirSync(`./${config.output.directory}`)

// convert the bounds (if specified) to meters
let swBounds, neBounds
if (config.bounds) {
  swBounds = GlobalMercator.latLonToMeters(config.bounds.south, config.bounds.west)
  neBounds = GlobalMercator.latLonToMeters(config.bounds.north, config.bounds.east)
}

loadFeedsAndGenerateTiles()

/**
 * The main function for this process; loads all patterns/feeds from the
 * specified feeds and kicks off the recursive tile generation
 */

function loadFeedsAndGenerateTiles () {
  const feedIds = config.feeds
  let patterns = []
  let stops = []

  // helper function to add processed routes/stops and move on to next feed
  const addFeedAndProceed = (processedFeed, i, done) => {
    patterns = patterns.concat(processedFeed.patterns)
    stops = stops.concat(processedFeed.stops)
    if (i < feedIds.length - 1) {
      loadNextFeed(i + 1, done)
    } else {
      done()
    }
  }

  // helper function to load a single feed, trying cache first, then API
  const loadNextFeed = (i, done) => {
    console.log(`Checking cache for ${feedIds[i]}`)
    const filepath = `./cache/${feedIds[i]}.json`
    if (fs.existsSync(filepath)) {
      console.log('- found, reading from cache..')
      const feedData = JSON.parse(fs.readFileSync(filepath))
      addFeedAndProceed(processFeed(feedData), i, done)
    } else {
      console.log('- not found, querying GTFS API..')
      queryFeed(feedIds[i]).then(processedFeed => {
        addFeedAndProceed(processedFeed, i, done)
      })
    }
  }

  // kick off the loading process with the first feed
  loadNextFeed(0, () => {
    // all feeds loaded
    console.log('total patterns processed: ' + patterns.length)
    console.log('total stops processed: ' + stops.length)
    processTile(0, 0, 0, patterns, stops) // start at the 'root' tile
  })
}

/**
 * Query a single feed via the GTFS API, load the stops/routes, and preprocess
 * for rendering
 *
 * @param {String} feedId the feed's unique ID in the GTFS API
 */

function queryFeed (feedId) {
  return new Promise((resolve, reject) => {
    // set up the graphql query/variables and construct the url
    const routeQuery = `
      query routeQuery ($feedId: String) {
        feeds (feed_id: [$feedId]) {
          feed_id,
          routes {
            route_id
            route_short_name
            route_long_name
            patterns {
              pattern_id
              geometry
            }
          }
          stops {
            stop_lat
            stop_lon
          }
        }
      }
    `

    const vars = `{ "feedId": "${feedId}" }`

    const url = `${config.api.gtfs}?query=${encodeURIComponent(routeQuery)}&variables=${encodeURIComponent(vars)}`

    fetch(url).then(res => {
      return res.json()
    })
      .then(response => {
        // write json to cache
        fs.writeFile(`cache/${feedId}.json`, JSON.stringify(response), err => {
          if (err) console.log(err)
        })

        resolve(processFeed(response))
      })
      .catch(err => {
        console.error(err)
      })
  })
}

/**
 * Process a single feed
 *
 * @param {object} feedData the data returned by the graphql query for this feed
 * @return {object} an object containing arrays of processed patterns and stops
 */

function processFeed (feedData) {
  // process patterns
  const patterns = []
  for (let rte of feedData.feeds[0].routes) {
    for (let ptn of rte.patterns) {
      ptn.route_short_name = rte.route_short_name

      // convert to Global Mercator meters
      ptn.coordsGM = ptn.geometry.coordinates.map(c =>
        GlobalMercator.latLonToMeters(c[1], c[0]))

      // convert to pixels for each zoom level up to the max
      ptn.coordsPx = {} // maps zoom level to array of pixel coords
      for (let zoom = 0; zoom <= config.render.maxZoom; zoom++) {
        ptn.coordsPx[zoom] = ptn.coordsGM.map(c => GlobalMercator.metersToPixels(c[0], c[1], zoom))
      }

      patterns.push(ptn)
    }
  }
  console.log('- read ' + patterns.length + ' patterns')

  // process stops
  const stops = feedData.feeds[0].stops.map(stop => {
    // convert to Mercator meters
    stop.coord = GlobalMercator.latLonToMeters(parseFloat(stop.stop_lat), parseFloat(stop.stop_lon))

    // convert to pixels for each zoom level up to the max
    stop.coordsPx = {} // maps zoom level to array of pixel coords
    for (let zoom = 0; zoom <= config.render.maxZoom; zoom++) {
      stop.coordsPx[zoom] = GlobalMercator.metersToPixels(stop.coord[0], stop.coord[1], zoom)
    }
    return stop
  })
  console.log('- read ' + stops.length + ' stops')

  return { patterns, stops }
}

/**
 * Creates specified tile and recursively invokes self on all child tiles
 * within the rendering bounds
 *
 * @param {int} tx the tile x coordinate (relative to zoom level)
 * @param {int} ty the tile y coordinate (relative to zoom level)
 * @param {zoom} tx the current zoom level
 * @param {array} patterns a collection of patterns that potentially overlap tile
 * @param {array} stops a collection of stops that potentially overlap tile
 */

function processTile (tx, ty, zoom, patterns, stops) {
  const bounds = GlobalMercator.tileBounds(tx, ty, zoom)
  const pixelOffsets = GlobalMercator.metersToPixels(bounds[0], bounds[1], zoom)

  // filter stops by whether they are visible in this tile
  stops = stops.filter(stop => {
    const x = stop.coordsPx[zoom][0] - pixelOffsets[0]
    const y = 256 - (stop.coordsPx[zoom][1] - pixelOffsets[1])
    const tol = 5
    return x > -tol && x < 256 + tol && y > -tol && y < 256 + tol
  })

  // filter patterns by whether they are visible in this tile
  let visiblePatterns = []
  patterns.forEach(ptn => {
    const coordsPx = ptn.coordsPx[zoom]
    let isect = false
    for (let c = 0; c < coordsPx.length - 1; c++) {
      if (
        linegeom.isectRectangleLine(
          pixelOffsets[0], pixelOffsets[1], pixelOffsets[0] + 256, pixelOffsets[1] + 256,
          coordsPx[c][0], coordsPx[c][1], coordsPx[c + 1][0], coordsPx[c + 1][1]
        )
      ) {
        isect = true
        break
      }
    }
    if (!isect) return
    visiblePatterns.push(ptn)
  })

  // don't continue w/ this tile if there are no visible patterns or stops
  if (visiblePatterns.length === 0 && stops.length === 0) return

  // don't continue if bounds are specified and this tile is outside of them
  if (config.bounds) {
    if (bounds[3] < swBounds[1]) return // tile is south of bounds
    if (bounds[1] > neBounds[1]) return // tile is north of bounds
    if (bounds[0] > neBounds[0]) return // tile is east of bounds
    if (bounds[2] < swBounds[0]) return // tile is west of bounds
  }

  // draw the tile, if we are at/past the minZoom level
  if (zoom >= config.render.minZoom) renderTile(tx, ty, zoom, visiblePatterns, stops)

  // recursively invoke on child tiles, if we have not yet reached the maxZoom level
  if (zoom < config.render.maxZoom) {
    for (let x = tx * 2; x <= tx * 2 + 1; x++) {
      for (let y = ty * 2; y <= ty * 2 + 1; y++) {
        processTile(x, y, zoom + 1, visiblePatterns, stops)
      }
    }
  }
}

/**
 * Render a single tile and write the files (one standard, one 2x) to disk
 *
 * @param {int} tx the tile x coordinate (relative to zoom level)
 * @param {int} ty the tile y coordinate (relative to zoom level)
 * @param {zoom} tx the current zoom level
 * @param {array} patterns the patterns to be drawn
 * @param {array} stops the stops to be drawn
 */

function renderTile (tx, ty, zoom, patterns, stops) {
  // convert TMS to XYZ (expected by Leaflet). See https://gist.github.com/tmcw/4954720
  let tyg = Math.pow(2, zoom) - ty - 1

  // don't render if tile already exists
  const filepath = `${config.output.directory}/${zoom}_${tx}_${tyg}.png`
  if (fs.existsSync(filepath)) return

  const bounds = GlobalMercator.tileBounds(tx, ty, zoom)
  const pixelOffsets = GlobalMercator.metersToPixels(bounds[0], bounds[1], zoom)

  const canvas = new Canvas(256, 256)
  const ctx = canvas.getContext('2d')

  const canvas2x = new Canvas(512, 512)
  const ctx2x = canvas2x.getContext('2d')

  const stroke = config.render.routeColor
  let width = 1
  if (zoom >= 14) width = 2
  if (zoom >= 16) width = 3

  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.antialias = 'subpixel'
  ctx.patternQuality = 'best'

  ctx2x.strokeStyle = stroke
  ctx2x.lineWidth = 2 * width
  ctx2x.antialias = 'subpixel'
  ctx2x.patternQuality = 'best'

  // draw the patterns
  for (let ptn of patterns) {
    const coordsPx = ptn.coordsPx[zoom]

    ctx.beginPath()
    ctx2x.beginPath()

    for (let c = 0; c < coordsPx.length; c++) {
      const x = coordsPx[c][0] - pixelOffsets[0]
      const y = 256 - (coordsPx[c][1] - pixelOffsets[1])

      ctx.lineTo(x, y)
      ctx2x.lineTo(x * 2, y * 2)
    }
    ctx.stroke()
    ctx2x.stroke()
  }

  // draw the stops
  if (zoom >= config.render.minStopZoom) {
    for (let stop of stops) {
      let r = 2
      let w = 1

      if (zoom >= 16) {
        r = 3
        w = 1.5
      }
      let cx = stop.coordsPx[zoom][0] - pixelOffsets[0]
      let cy = 256 - (stop.coordsPx[zoom][1] - pixelOffsets[1])

      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, 2 * Math.PI, false)
      ctx.fillStyle = 'white'
      ctx.fill()
      ctx.lineWidth = w
      ctx.strokeStyle = config.render.routeColor
      ctx.stroke()

      ctx2x.beginPath()
      ctx2x.arc(cx * 2, cy * 2, r * 2, 0, 2 * Math.PI, false)
      ctx2x.fillStyle = 'white'
      ctx2x.fill()
      ctx2x.lineWidth = w * 2
      ctx2x.strokeStyle = config.render.routeColor
      ctx2x.stroke()
    }
  }

  // place labels
  if (zoom >= config.render.minLabelZoom) {
    const placedNames = []
    const placedBBoxes = []
    for (let ptn of patterns) {
      const routeShortName = ptn.route_short_name
      // Skip label if there is no short name
      // TODO: add logic to handle long name
      if (!routeShortName) continue
      // check if already placed label for this route in this tile
      if (placedNames.indexOf(routeShortName) !== -1) continue

      // compute default location
      const closest = linegeom.closestPoint(ptn.coordsPx[zoom],
        pixelOffsets[0] + 128, pixelOffsets[1] + 128)

      let shapeX = closest.point[0]
      let shapeY = closest.point[1]

      let foundPlace = false
      let offset = 0
      let x
      let y
      for (let i = 0; i < 10; i++) { // try up to 10 alternate locations along shape before giving up
        // convert to tile-relative coordiantes
        x = shapeX - pixelOffsets[0]
        y = 256 - (shapeY - pixelOffsets[1])

        // get bbox for trial placement
        const testBbox = getLabelBbox(x, y, routeShortName, ctx)

        // check if this label is off the edge of this tile; if so, abort placement
        if (testBbox.x < 0 || testBbox.x + testBbox.w > 256 ||
            testBbox.y < 0 || testBbox.y + testBbox.h > 256) {
          break
        }

        // check for collisions with already-placed labels on this tile
        let foundCollision = false
        for (let bbox of placedBBoxes) {
          if (linegeom.bboxIsect(bbox, testBbox)) { // collision
            foundCollision = true
            break
          }
        }

        if (foundCollision) { // try another x/y along this shape
          if (i % 2 === 0) offset += 25
          offset = offset * -1
          const pt = linegeom.pointAlong(ptn.coordsPx[zoom], closest.traversed + offset)
          shapeX = pt[0]
          shapeY = pt[1]
        } else { // this location works!
          foundPlace = true
          break
        }
      }

      if (foundPlace) { // place label
        const bbox = placeLabel(ctx, ctx2x, x, y, routeShortName)
        placedBBoxes.push(bbox)
        placedNames.push(routeShortName)
      }
    }
  }

  fs.writeFileSync(`${config.output.directory}/${zoom}_${tx}_${tyg}.png`, canvas.toBuffer())
  fs.writeFileSync(`${config.output.directory}/${zoom}_${tx}_${tyg}@2x.png`, canvas2x.toBuffer())

  if (tileCount % 100 === 0) console.log('wrote ' + tileCount + ' tiles')
  tileCount++
}

/**
 * Write a label to a given position within a tile
 *
 * @param {object} ctx the Canvas context for the standard-resolution tile
 * @param {object} ctx2x the Canvas context for the high-resolution tile
 * @param {number} x the x-coordinate in standard-resolution pixels
 * @param {number} y the y-coordinate in standard-resolution pixels
 * @param {string} name the text to be drawn
 * @return {object} the bounds of the rendered label in standard-resolution pixels
 */

function placeLabel (ctx, ctx2x, x, y, name) {
  const labelHeight = config.render.fontSize + 2
  const labelWidth = ctx.measureText(name).width + 2

  // draw on the standard-resolution tile
  ctx.fillStyle = config.render.routeColor
  ctx.fillRect(x - labelWidth / 2, y - labelHeight / 2, labelWidth, labelHeight)
  ctx.font = `${config.render.fontSize}px Helvetica`
  ctx.fillStyle = config.render.textColor
  ctx.fillText(name, x - ctx.measureText(name).width / 2, y + config.render.fontSize * 0.4)

  // draw on the high-resolution tile
  const x2x = x * 2
  const y2x = y * 2
  const w2x = labelWidth * 2
  const h2x = labelHeight * 2
  ctx2x.fillStyle = config.render.routeColor
  ctx2x.fillRect(x2x - w2x / 2, y2x - h2x / 2, w2x, h2x)
  ctx2x.font = `${config.render.fontSize * 2}px Helvetica`
  ctx2x.fillStyle = config.render.textColor
  ctx2x.fillText(name, x2x - ctx2x.measureText(name).width / 2, y2x + 2 * config.render.fontSize * 0.35)

  // return bounding box (in standard-resolution pixels)
  return getLabelBbox(x, y, name, ctx)
}

/**
 * Compute the bounding box for a label
 *
 * @param {number} x the label x-coordinate in standard-resolution pixels
 * @param {number} y the label y-coordinate in standard-resolution pixels
 * @return {object} the bounds of the rendered label in standard-resolution pixels
 */

function getLabelBbox (x, y, text, ctx) {
  const labelHeight = config.render.fontSize + 2
  const labelWidth = ctx.measureText(text).width + 2

  return {
    x: x - labelWidth / 2,
    y: y - labelHeight / 2,
    w: labelWidth,
    h: labelHeight
  }
}
