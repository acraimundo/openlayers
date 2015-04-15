// FIXME add support for hasM
goog.provide('ol.format.EsriJSON');

goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.object');
goog.require('ol.Feature');
goog.require('ol.extent');
goog.require('ol.format.Feature');
goog.require('ol.format.JSONFeature');
goog.require('ol.geom.GeometryLayout');
goog.require('ol.geom.LineString');
goog.require('ol.geom.LinearRing');
goog.require('ol.geom.MultiLineString');
goog.require('ol.geom.MultiPoint');
goog.require('ol.geom.MultiPolygon');
goog.require('ol.geom.Point');
goog.require('ol.geom.Polygon');
goog.require('ol.geom.flat.orient');
goog.require('ol.proj');



/**
 * @classdesc
 * Feature format for reading and writing data in the EsriJSON format.
 *
 * @constructor
 * @extends {ol.format.JSONFeature}
 * @param {olx.format.EsriJSONOptions=} opt_options Options.
 * @api
 */
ol.format.EsriJSON = function(opt_options) {

  var options = goog.isDef(opt_options) ? opt_options : {};

  goog.base(this);

  /**
   * Name of the geometry attribute for features.
   * @type {string|undefined}
   * @private
   */
  this.geometryName_ = options.geometryName;

};
goog.inherits(ol.format.EsriJSON, ol.format.JSONFeature);


/**
 * @param {EsriJSONGeometry} object Object.
 * @param {olx.format.ReadOptions=} opt_options Read options.
 * @private
 * @return {ol.geom.Geometry} Geometry.
 */
ol.format.EsriJSON.readGeometry_ = function(object, opt_options) {
  if (goog.isNull(object)) {
    return null;
  }
  var type;
  if (goog.isNumber(object.x) && goog.isNumber(object.y)) {
    type = 'Point';
  } else if (goog.isDefAndNotNull(object.points)) {
    type = 'MultiPoint';
  } else if (goog.isDefAndNotNull(object.paths)) {
    if (object.paths.length === 1) {
      type = 'LineString';
    } else {
      type = 'MultiLineString';
    }
  } else if (goog.isDefAndNotNull(object.rings)) {
    var rings = ol.format.EsriJSON.convertRings_(object.rings, object.hasZ);
    object = /** @type {EsriJSONGeometry} */(goog.object.clone(object));
    if (rings.length === 1) {
      type = 'Polygon';
      object.rings = rings[0];
    } else {
      type = 'MultiPolygon';
      object.rings = rings;
    }
  }
  goog.asserts.assert(goog.isDef(type), 'geometry type should be defined');
  var geometryReader = ol.format.EsriJSON.GEOMETRY_READERS_[type];
  goog.asserts.assert(goog.isDef(geometryReader),
      'geometryReader should be defined');
  return /** @type {ol.geom.Geometry} */ (
      ol.format.Feature.transformWithOptions(
          geometryReader(object), false, opt_options));
};


/**
 * Determines inner and outer rings.
 * @param {Array.<!Array.<!Array.<number>>>} rings Rings.
 * @param {boolean|undefined} hasZ Do rings have Z values in them.
 * @private
 * @return {Array.<!Array.<!Array.<number>>>} Transoformed rings.
 */
ol.format.EsriJSON.convertRings_ = function(rings, hasZ) {
  var outerRings = [];
  var holes = [];
  var i, ii;
  for (i = 0, ii = rings.length; i < ii; ++i) {
    var flatRing = goog.array.flatten(rings[i]);
    var clockwise = ol.geom.flat.orient.linearRingIsClockwise(flatRing, 0,
        flatRing.length, hasZ === true ? 3 : 2);
    if (clockwise) {
      outerRings.push([rings[i]]);
    } else {
      holes.push(rings[i]);
    }
  }
  while (holes.length) {
    var hole = holes.shift();
    var matched = false;
    for (i = outerRings.length - 1; i >= 0; i--) {
      var outerRing = outerRings[i][0];
      if (ol.extent.containsExtent(new ol.geom.LinearRing(
          outerRing).getExtent(),
          new ol.geom.LinearRing(hole).getExtent())) {
        outerRings[i].push(hole);
        matched = true;
        break;
      }
    }
    if (!matched) {
      outerRings.push([hole.reverse()]);
    }
  }
  return outerRings;
};


/**
 * @param {EsriJSONPoint} object Object.
 * @private
 * @return {ol.geom.Point} Point.
 */
ol.format.EsriJSON.readPointGeometry_ = function(object) {
  goog.asserts.assert(goog.isNumber(object.x), 'object.x should be number');
  goog.asserts.assert(goog.isNumber(object.y), 'object.y should be number');
  var point;
  if (goog.isDefAndNotNull(object.z)) {
    point = new ol.geom.Point([object.x, object.y, object.z],
        ol.geom.GeometryLayout.XYZ);
  } else {
    point = new ol.geom.Point([object.x, object.y]);
  }
  return point;
};


/**
 * @param {EsriJSONPolyline} object Object.
 * @private
 * @return {ol.geom.LineString} LineString.
 */
ol.format.EsriJSON.readLineStringGeometry_ = function(object) {
  goog.asserts.assert(goog.isArray(object.paths),
      'object.paths should be an array');
  goog.asserts.assert(object.paths.length === 1,
      'object.paths array length should be 1');
  return new ol.geom.LineString(object.paths[0].slice(0),
      object.hasZ === true ? ol.geom.GeometryLayout.XYZ :
      ol.geom.GeometryLayout.XY);
};


/**
 * @param {EsriJSONPolyline} object Object.
 * @private
 * @return {ol.geom.MultiLineString} MultiLineString.
 */
ol.format.EsriJSON.readMultiLineStringGeometry_ = function(object) {
  goog.asserts.assert(goog.isArray(object.paths),
      'object.paths should be an array');
  goog.asserts.assert(object.paths.length > 1,
      'object.paths array length should be more than 1');
  return new ol.geom.MultiLineString(object.paths.slice(0));
};


/**
 * @param {EsriJSONMultipoint} object Object.
 * @private
 * @return {ol.geom.MultiPoint} MultiPoint.
 */
ol.format.EsriJSON.readMultiPointGeometry_ = function(object) {
  goog.asserts.assert(goog.isDefAndNotNull(object.points),
      'object.points should be defined');
  return new ol.geom.MultiPoint(object.points);
};


/**
 * @param {EsriJSONPolygon} object Object.
 * @private
 * @return {ol.geom.MultiPolygon} MultiPolygon.
 */
ol.format.EsriJSON.readMultiPolygonGeometry_ = function(object) {
  goog.asserts.assert(goog.isDefAndNotNull(object.rings));
  goog.asserts.assert(object.rings.length > 1,
      'object.rings should have length larger than 1');
  return new ol.geom.MultiPolygon(
      /** @type {Array.<Array.<Array.<Array.<number>>>>} */(object.rings),
      object.hasZ === true ? ol.geom.GeometryLayout.XYZ :
      ol.geom.GeometryLayout.XY);
};


/**
 * @param {EsriJSONPolygon} object Object.
 * @private
 * @return {ol.geom.Polygon} Polygon.
 */
ol.format.EsriJSON.readPolygonGeometry_ = function(object) {
  goog.asserts.assert(goog.isDefAndNotNull(object.rings));
  return new ol.geom.Polygon(object.rings,
      object.hasZ === true ? ol.geom.GeometryLayout.XYZ :
      ol.geom.GeometryLayout.XY);
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONGeometry} EsriJSON geometry.
 */
ol.format.EsriJSON.writePointGeometry_ = function(geometry, opt_options) {
  goog.asserts.assertInstanceof(geometry, ol.geom.Point,
      'geometry should be an ol.geom.Point');
  var coordinates = geometry.getCoordinates();
  if (geometry.getLayout() === ol.geom.GeometryLayout.XYZ) {
    return /** @type {EsriJSONPoint} */ ({
      'x': coordinates[0],
      'y': coordinates[1],
      'z': coordinates[2]
    });
  } else {
    return /** @type {EsriJSONPoint} */ ({
      'x': coordinates[0],
      'y': coordinates[1]
    });
  }
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONPolyline} EsriJSON geometry.
 */
ol.format.EsriJSON.writeLineStringGeometry_ = function(geometry, opt_options) {
  goog.asserts.assertInstanceof(geometry, ol.geom.LineString,
      'geometry should be an ol.geom.LineString');
  return /** @type {EsriJSONPolyline} */ ({
    'hasZ': (geometry.getLayout() === ol.geom.GeometryLayout.XYZ),
    'paths': [geometry.getCoordinates()]
  });
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONPolygon} EsriJSON geometry.
 */
ol.format.EsriJSON.writePolygonGeometry_ = function(geometry, opt_options) {
  goog.asserts.assertInstanceof(geometry, ol.geom.Polygon,
      'geometry should be an ol.geom.Polygon');
  // Esri geometries use the left-hand rule
  return /** @type {EsriJSONPolygon} */ ({
    'hasZ': (geometry.getLayout() === ol.geom.GeometryLayout.XYZ),
    'rings': geometry.getCoordinates(false)
  });
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONPolyline} EsriJSON geometry.
 */
ol.format.EsriJSON.writeMultiLineStringGeometry_ =
    function(geometry, opt_options) {
  goog.asserts.assertInstanceof(geometry, ol.geom.MultiLineString,
      'geometry should be an ol.geom.MultiLineString');
  return /** @type {EsriJSONPolyline} */ ({
    'hasZ': (geometry.getLayout() === ol.geom.GeometryLayout.XYZ),
    'paths': geometry.getCoordinates()
  });
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONMultipoint} EsriJSON geometry.
 */
ol.format.EsriJSON.writeMultiPointGeometry_ = function(geometry, opt_options) {
  goog.asserts.assertInstanceof(geometry, ol.geom.MultiPoint,
      'geometry should be an ol.geom.MultiPoint');
  return /** @type {EsriJSONMultipoint} */ ({
    'hasZ': (geometry.getLayout() === ol.geom.GeometryLayout.XYZ),
    'points': geometry.getCoordinates()
  });
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONPolygon} EsriJSON geometry.
 */
ol.format.EsriJSON.writeMultiPolygonGeometry_ = function(geometry,
    opt_options) {
  goog.asserts.assertInstanceof(geometry, ol.geom.MultiPolygon,
      'geometry should be an ol.geom.MultiPolygon');
  var coordinates = geometry.getCoordinates(false);
  var output = [];
  for (var i = 0; i < coordinates.length; i++) {
    for (var x = coordinates[i].length - 1; x >= 0; x--) {
      output.push(coordinates[i][x]);
    }
  }
  return /** @type {EsriJSONPolygon} */ ({
    'hasZ': (geometry.getLayout() === ol.geom.GeometryLayout.XYZ),
    'rings': output
  });
};


/**
 * @const
 * @private
 * @type {Object.<string, function(EsriJSONObject): ol.geom.Geometry>}
 */
ol.format.EsriJSON.GEOMETRY_READERS_ = {
  'Point': ol.format.EsriJSON.readPointGeometry_,
  'LineString': ol.format.EsriJSON.readLineStringGeometry_,
  'Polygon': ol.format.EsriJSON.readPolygonGeometry_,
  'MultiPoint': ol.format.EsriJSON.readMultiPointGeometry_,
  'MultiLineString': ol.format.EsriJSON.readMultiLineStringGeometry_,
  'MultiPolygon': ol.format.EsriJSON.readMultiPolygonGeometry_
};


/**
 * @const
 * @private
 * @type {Object.<string, function(ol.geom.Geometry, olx.format.WriteOptions=): (EsriJSONGeometry)>}
 */
ol.format.EsriJSON.GEOMETRY_WRITERS_ = {
  'Point': ol.format.EsriJSON.writePointGeometry_,
  'LineString': ol.format.EsriJSON.writeLineStringGeometry_,
  'Polygon': ol.format.EsriJSON.writePolygonGeometry_,
  'MultiPoint': ol.format.EsriJSON.writeMultiPointGeometry_,
  'MultiLineString': ol.format.EsriJSON.writeMultiLineStringGeometry_,
  'MultiPolygon': ol.format.EsriJSON.writeMultiPolygonGeometry_
};


/**
 * Read a feature from a EsriJSON Feature source.  Only works for Feature,
 * use `readFeatures` to read FeatureCollection source.
 *
 * @function
 * @param {ArrayBuffer|Document|Node|Object|string} source Source.
 * @param {olx.format.ReadOptions=} opt_options Read options.
 * @return {ol.Feature} Feature.
 * @api
 */
ol.format.EsriJSON.prototype.readFeature;


/**
 * Read all features from a EsriJSON source.  Works with both Feature and
 * FeatureCollection sources.
 *
 * @function
 * @param {ArrayBuffer|Document|Node|Object|string} source Source.
 * @param {olx.format.ReadOptions=} opt_options Read options.
 * @return {Array.<ol.Feature>} Features.
 * @api
 */
ol.format.EsriJSON.prototype.readFeatures;


/**
 * @inheritDoc
 */
ol.format.EsriJSON.prototype.readFeatureFromObject = function(
    object, opt_options) {
  var esriJSONFeature = /** @type {EsriJSONFeature} */ (object);
  goog.asserts.assert(goog.isDefAndNotNull(esriJSONFeature.geometry) ||
      goog.isDefAndNotNull(esriJSONFeature.compressedGeometry) ||
      goog.isDefAndNotNull(esriJSONFeature.attributes),
      'geometry, compressedGeometry or attributes should be defined');
  var geometry = ol.format.EsriJSON.readGeometry_(esriJSONFeature.geometry,
      opt_options);
  var feature = new ol.Feature();
  if (goog.isDef(this.geometryName_)) {
    feature.setGeometryName(this.geometryName_);
  }
  feature.setGeometry(geometry);
  if (goog.isDef(opt_options) && goog.isDef(opt_options.idField) &&
      goog.isDef(esriJSONFeature.attributes[opt_options.idField])) {
    goog.asserts.assert(
        goog.isNumber(esriJSONFeature.attributes[opt_options.idField]),
        'objectIdFieldName value should be a number');
    feature.setId(/** @type {number} */(
        esriJSONFeature.attributes[opt_options.idField]));
  }
  if (goog.isDef(esriJSONFeature.attributes)) {
    feature.setProperties(esriJSONFeature.attributes);
  }
  return feature;
};


/**
 * @inheritDoc
 */
ol.format.EsriJSON.prototype.readFeaturesFromObject = function(
    object, opt_options) {
  var esriJSONObject = /** @type {EsriJSONObject} */ (object);
  var options = goog.isDef(opt_options) ? opt_options : {};
  if (goog.isDefAndNotNull(esriJSONObject.features)) {
    var esriJSONFeatureCollection = /** @type {EsriJSONFeatureCollection} */
        (object);
    /** @type {Array.<ol.Feature>} */
    var features = [];
    var esriJSONFeatures = esriJSONFeatureCollection.features;
    var i, ii;
    options.idField = object.objectIdFieldName;
    for (i = 0, ii = esriJSONFeatures.length; i < ii; ++i) {
      features.push(this.readFeatureFromObject(esriJSONFeatures[i],
          options));
    }
    return features;
  } else {
    return [this.readFeatureFromObject(object, options)];
  }
};


/**
 * Read a geometry from a EsriJSON source.
 *
 * @function
 * @param {ArrayBuffer|Document|Node|Object|string} source Source.
 * @param {olx.format.ReadOptions=} opt_options Read options.
 * @return {ol.geom.Geometry} Geometry.
 * @api
 */
ol.format.EsriJSON.prototype.readGeometry;


/**
 * @inheritDoc
 */
ol.format.EsriJSON.prototype.readGeometryFromObject = function(
    object, opt_options) {
  return ol.format.EsriJSON.readGeometry_(
      /** @type {EsriJSONGeometry} */ (object), opt_options);
};


/**
 * Read the projection from a EsriJSON source.
 *
 * @function
 * @param {ArrayBuffer|Document|Node|Object|string} source Source.
 * @return {ol.proj.Projection} Projection.
 * @api
 */
ol.format.EsriJSON.prototype.readProjection;


/**
 * @inheritDoc
 */
ol.format.EsriJSON.prototype.readProjectionFromObject = function(object) {
  var esriJSONObject = /** @type {EsriJSONObject} */ (object);
  if (goog.isDefAndNotNull(esriJSONObject.spatialReference) &&
      goog.isDefAndNotNull(esriJSONObject.spatialReference.wkid)) {
    var crs = esriJSONObject.spatialReference.wkid;
    return ol.proj.get('EPSG:' + crs);
  } else {
    return null;
  }
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @private
 * @return {EsriJSONGeometry} EsriJSON geometry.
 */
ol.format.EsriJSON.writeGeometry_ = function(geometry, opt_options) {
  var geometryWriter = ol.format.EsriJSON.GEOMETRY_WRITERS_[geometry.getType()];
  goog.asserts.assert(goog.isDef(geometryWriter),
      'geometryWriter should be defined');
  return geometryWriter(/** @type {ol.geom.Geometry} */ (
      ol.format.Feature.transformWithOptions(geometry, true, opt_options)),
      opt_options);
};


/**
 * Encode a geometry as a EsriJSON string.
 *
 * @function
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @return {string} EsriJSON.
 * @api
 */
ol.format.EsriJSON.prototype.writeGeometry;


/**
 * Encode a geometry as a EsriJSON object.
 *
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @return {EsriJSONGeometry} Object.
 * @api
 */
ol.format.EsriJSON.prototype.writeGeometryObject = function(geometry,
    opt_options) {
  return ol.format.EsriJSON.writeGeometry_(geometry,
      this.adaptOptions(opt_options));
};


/**
 * Encode a feature as a EsriJSON Feature string.
 *
 * @function
 * @param {ol.Feature} feature Feature.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @return {string} EsriJSON.
 * @api
 */
ol.format.EsriJSON.prototype.writeFeature;


/**
 * Encode a feature as a esriJSON Feature object.
 *
 * @param {ol.Feature} feature Feature.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @return {Object} Object.
 * @api
 */
ol.format.EsriJSON.prototype.writeFeatureObject = function(
    feature, opt_options) {
  opt_options = this.adaptOptions(opt_options);
  var object = {};
  var geometry = feature.getGeometry();
  if (goog.isDefAndNotNull(geometry)) {
    object['geometry'] =
        ol.format.EsriJSON.writeGeometry_(geometry, opt_options);
  }
  var properties = feature.getProperties();
  goog.object.remove(properties, feature.getGeometryName());
  if (!goog.object.isEmpty(properties)) {
    object['attributes'] = properties;
  } else {
    object['attributes'] = {};
  }
  if (goog.isDef(opt_options) && goog.isDef(opt_options.featureProjection)) {
    object['spatialReference'] = /** @type {EsriJSONCRS} */({
      wkid: ol.proj.get(
          opt_options.featureProjection).getCode().split(':').pop()
    });
  }
  return object;
};


/**
 * Encode an array of features as EsriJSON.
 *
 * @function
 * @param {Array.<ol.Feature>} features Features.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @return {string} EsriJSON.
 * @api
 */
ol.format.EsriJSON.prototype.writeFeatures;


/**
 * Encode an array of features as a EsriJSON object.
 *
 * @param {Array.<ol.Feature>} features Features.
 * @param {olx.format.WriteOptions=} opt_options Write options.
 * @return {Object} EsriJSON Object.
 * @api
 */
ol.format.EsriJSON.prototype.writeFeaturesObject =
    function(features, opt_options) {
  opt_options = this.adaptOptions(opt_options);
  var objects = [];
  var i, ii;
  for (i = 0, ii = features.length; i < ii; ++i) {
    objects.push(this.writeFeatureObject(features[i], opt_options));
  }
  return /** @type {EsriJSONFeatureCollection} */ ({
    'features': objects
  });
};
