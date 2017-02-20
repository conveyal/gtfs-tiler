const fs = require('node-fs-extra')
const GlobalMercator = require('globalmercator')

// load the config
const config = require('../config')

const swm = GlobalMercator.latLonToMeters(config.bounds.south, config.bounds.west)
const nem = GlobalMercator.latLonToMeters(config.bounds.north, config.bounds.east)

copyBlanks()

function copyBlanks () {
  for (let zoom = config.render.minZoom; zoom <= config.render.maxZoom; zoom++) {
    var swt = GlobalMercator.metersToTile(swm[0], swm[1], zoom)
    var net = GlobalMercator.metersToTile(nem[0], nem[1], zoom)
    const total = (net[0] - swt[0] + 1) * (net[1] - swt[1] + 1)
    console.log(`examining ${total} tiles for zoom level ${zoom}`)

    // convert the coords list to pixels
    for (let tx = swt[0]; tx <= net[0]; tx++) {
      for (let ty = swt[1]; ty <= net[1]; ty++) {
        let tyg = Math.pow(2, zoom) - ty - 1
        const path = `${config.output.directory}/${zoom}_${tx}_${tyg}.png`
        if (!fs.existsSync(path)) {
          console.log('  missing: ' + path)
          fs.copySync('./img/empty.png', path)
          fs.copySync('./img/empty@2x.png', `${config.output.directory}/${zoom}_${tx}_${tyg}@2x.png`)
        }
      }
    }
  }
}
