module.exports = {
  /* The list of GTFS Feed IDs to be read from the API */
  feeds: [
    'Feed1',
    'Feed2'
  ],

  /* The GTFS API endpoint to query. */
  api: {
    gtfs: 'https://localhost:9966/api/manager/graphql'
  },

  /* The directory where the rendered tiles will be written */
  output: {
    directory: 'tiles'
  },

  /* (optional) A bounding box within which to generate tiles. If not provided,
     tiles will be written for the extent of the feed(s). */
  bounds: {
    west: -73.8789,
    south: 42.6218,
    east: -73.662,
    north: 42.7883
  },

  /* Various rendering / styling settings */
  render: {
    /* the minimum and maximum zoom levels at which to draw tiles */
    minZoom: 1,
    maxZoom: 14,
    /* the minimum zoom level at which to draw route labels */
    minLabelZoom: 8,
    /* the minimum zoom level at which to draw route labels */
    minStopZoom: 14,
    /* the color used when drawing route alignments and route label backgrounds */
    routeColor: 'navy',
    /* the color used when drawing route label text  */
    textColor: 'white',
    /* the font size to use when drawing route label text */
    fontSize: 9
  },

  /* Settings specific to the 'demo' map application used for testing, etc. */
  demo: {
    /* initial center lat/lon coordinates for map */
    initLat: 42.6525,
    initLon: -73.757222,
    /* initial zoom level for the map */
    initZoom: 8,
    /* whether to use 2x-resolution 'retina' tiles */
    retina: true
  }
}
