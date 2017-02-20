var L = require('leaflet')

// load the config
var config = require('./config')

// create the map
var map = L.map('map').setView([config.demo.initLat || 0, config.demo.initLon || 0],
  config.demo.initZoom)

// add a base layer
map.addLayer(L.tileLayer(`http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}${config.demo.retina ? '@2x' : ''}.png`, {
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
}))

// add our transit overlay
L.tileLayer(`${config.output.directory}/{z}_{x}_{y}${config.demo.retina ? '@2x' : ''}.png`).addTo(map)
