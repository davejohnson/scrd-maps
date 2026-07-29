const BASE = 'https://maps.scrd.ca/arcgis/rest/services';
const PROPERTY = `${BASE}/mySCRDpub_PropertyInformation/FeatureServer`;
const PLANNING = `${BASE}/mySCRDpub_PlanningDevelopment/FeatureServer`;
const PARCEL_FIELDS = [
  'PID',
  'CIVIC_ADDRESS',
  'LOT_SIZE',
  'JURISDICTION',
  'FOLIO',
  'LOT',
  'BLOCK',
  'PLAN_NUMBER',
  'DIST_LOT',
].join(',');
const DIRECTION_ORDER = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
];

// Input sanitization
function sanitizeAddress(addr) {
  return addr.replace(/[^a-zA-Z0-9 \-\.#]/g, '').substring(0, 100);
}

function sanitizePID(pid) {
  if (!/^\d{3}-\d{3}-\d{3}$/.test(pid)) throw new Error('Invalid PID format');
  return pid;
}

function normalizeAddress(address) {
  return sanitizeAddress(address).toUpperCase()
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCRESCENT\b/g, 'CRES')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bHIGHWAY\b/g, 'HWY');
}

async function queryFeatureLayer(url, params) {
  const qs = new URLSearchParams({ f: 'json', ...params });
  const res = await fetch(`${url}/query?${qs}`);
  const data = await res.json();
  return (data.features || []).map(f => f.attributes);
}

async function queryByGeometry(url, lon, lat) {
  return queryFeatureLayer(url, {
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
  });
}

async function searchParcelsRaw(address) {
  const clean = normalizeAddress(address);
  if (!clean) return { features: [] };
  const where = `CIVIC_ADDRESS LIKE '%${clean}%'`;
  const qs = new URLSearchParams({
    f: 'json',
    where,
    outFields: 'PID,CIVIC_ADDRESS,LOT_SIZE,JURISDICTION',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '10',
  });
  const res = await fetch(`${PROPERTY}/0/query?${qs}`);
  return res.json();
}

async function getParcelByPID(pid) {
  const cleanPID = sanitizePID(pid);
  const qs = new URLSearchParams({
    f: 'json',
    where: `PID='${cleanPID}'`,
    outFields: PARCEL_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
  });
  const res = await fetch(`${PROPERTY}/0/query?${qs}`);
  const data = await res.json();
  if (!data.features || !data.features.length) return null;
  const feat = data.features[0];
  const centroid = centroidFromGeometry(feat.geometry);
  return { ...feat.attributes, centroid, geometry: feat.geometry };
}

async function getPlanningContext(lon, lat) {
  const [zoning, ocp, subdivision] = await Promise.all([
    queryByGeometry(`${PLANNING}/14`, lon, lat),
    queryByGeometry(`${PLANNING}/114`, lon, lat),
    queryByGeometry(`${PLANNING}/111`, lon, lat),
  ]);
  return {
    zoning: zoning[0] || null,
    ocp: ocp[0] || null,
    subdivision: subdivision[0] || null,
  };
}

function centroidFromGeometry(geometry) {
  const ring = geometry && geometry.rings && geometry.rings[0];
  if (!ring || !ring.length) return null;

  // Translate around the first point to avoid precision loss with lon/lat values.
  const [originX, originY] = ring[0];
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    const x1 = current[0] - originX;
    const y1 = current[1] - originY;
    const x2 = next[0] - originX;
    const y2 = next[1] - originY;
    const cross = (x1 * y2) - (x2 * y1);
    twiceArea += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  if (Math.abs(twiceArea) > Number.EPSILON) {
    return [
      originX + (centroidX / (3 * twiceArea)),
      originY + (centroidY / (3 * twiceArea)),
    ];
  }

  const points = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

function cardinalDirection(fromCentroid, toCentroid) {
  const dLon = toCentroid[0] - fromCentroid[0];
  const dLat = toCentroid[1] - fromCentroid[1];
  const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
  if (angle > -22.5 && angle <= 22.5) return 'north';
  if (angle > 22.5 && angle <= 67.5) return 'northeast';
  if (angle > 67.5 && angle <= 112.5) return 'east';
  if (angle > 112.5 && angle <= 157.5) return 'southeast';
  if (angle > 157.5 || angle <= -157.5) return 'south';
  if (angle > -157.5 && angle <= -112.5) return 'southwest';
  if (angle > -112.5 && angle <= -67.5) return 'west';
  return 'northwest';
}

function distanceInMeters(fromCentroid, toCentroid) {
  const toRadians = degrees => degrees * (Math.PI / 180);
  const earthRadiusMeters = 6371000;
  const lat1 = toRadians(fromCentroid[1]);
  const lat2 = toRadians(toCentroid[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(toCentroid[0] - fromCentroid[0]);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  if (!geometry || !Array.isArray(geometry.rings)) return false;
  // Toggling across every ring handles both multipart polygons and holes.
  return geometry.rings.reduce(
    (inside, ring) => pointInRing(point, ring) ? !inside : inside,
    false,
  );
}

function findPlanningFeature(point, features) {
  return features.find(feature => pointInGeometry(point, feature.geometry)) || null;
}

function summarizePlanningContext(point, planningLayers) {
  const zoningFeature = findPlanningFeature(point, planningLayers.zoning);
  const ocpFeature = findPlanningFeature(point, planningLayers.ocp);
  const subdivisionFeature = findPlanningFeature(point, planningLayers.subdivision);
  const zoning = zoningFeature && zoningFeature.attributes;
  const ocp = ocpFeature && ocpFeature.attributes;
  const subdivision = subdivisionFeature && subdivisionFeature.attributes;

  return {
    zoning: zoning ? `${zoning.LANDUSE} (${zoning.DESCRIP})` : 'Unknown',
    zoning_code: zoning ? zoning.LANDUSE : null,
    zoning_description: zoning ? zoning.DESCRIP : null,
    zoning_schedule: zoning ? zoning.SCHEDULE : null,
    zoning_bylaw: zoning ? zoning.BYLAW : null,
    ocp: ocp ? ocp.LANDUSE : 'Unknown',
    ocp_area: ocp ? ocp.OCP_NAME : null,
    subdivision_district: subdivision ? subdivision.SUBDIVISIO : 'Unknown',
    subdivision_bylaw: subdivision ? subdivision.BYLAW : null,
  };
}

async function queryFeaturesByEnvelope(layer, bbox, outFields) {
  const qs = new URLSearchParams({
    f: 'json',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'true',
    outSR: '4326',
  });
  const response = await fetch(`${layer}/query?${qs}`);
  const data = await response.json();
  return data.features || [];
}

function selectSurroundingProperties(properties, limit = 20) {
  const byDistance = [...properties].sort((a, b) => a.distance_meters - b.distance_meters);
  const nearestByDirection = new Map();

  for (const property of byDistance) {
    if (!nearestByDirection.has(property.direction)) {
      nearestByDirection.set(property.direction, property);
      property.nearest_in_direction = true;
    }
  }

  const selected = [
    ...nearestByDirection.values(),
    ...byDistance.filter(property => !property.nearest_in_direction),
  ].slice(0, limit);

  return selected.sort((a, b) => {
    const directionDifference =
      DIRECTION_ORDER.indexOf(a.direction) - DIRECTION_ORDER.indexOf(b.direction);
    return directionDifference || a.distance_meters - b.distance_meters;
  });
}

async function getNeighbours(geometry, subjectPID) {
  const rings = geometry.rings[0];
  const xs = rings.map(p => p[0]);
  const ys = rings.map(p => p[1]);
  const buffer = 0.001;
  const bbox = [
    Math.min(...xs) - buffer,
    Math.min(...ys) - buffer,
    Math.max(...xs) + buffer,
    Math.max(...ys) + buffer,
  ];

  // Query each map layer once for the whole area, then match each parcel centroid
  // to its planning polygons locally. This avoids three requests per neighbour.
  const [parcelFeatures, zoningFeatures, ocpFeatures, subdivisionFeatures] = await Promise.all([
    queryFeaturesByEnvelope(`${PROPERTY}/0`, bbox, PARCEL_FIELDS),
    queryFeaturesByEnvelope(
      `${PLANNING}/14`,
      bbox,
      'LANDUSE,DESCRIP,SCHEDULE,BYLAW',
    ),
    queryFeaturesByEnvelope(`${PLANNING}/114`, bbox, 'OCP_NAME,LANDUSE'),
    queryFeaturesByEnvelope(`${PLANNING}/111`, bbox, 'SUBDIVISIO,BYLAW'),
  ]);

  const subjectCentroid = centroidFromGeometry(geometry);
  if (!subjectCentroid) return [];

  const planningLayers = {
    zoning: zoningFeatures,
    ocp: ocpFeatures,
    subdivision: subdivisionFeatures,
  };
  const seen = new Set();
  const neighbours = [];

  for (const feat of parcelFeatures) {
    const pid = feat.attributes.PID;
    if (pid === subjectPID) continue;

    const addr = feat.attributes.CIVIC_ADDRESS || '';
    const baseAddr = addr.replace(/^[A-Z]?\d+-/, '').trim();
    const key = baseAddr || pid;
    if (seen.has(key)) continue;
    seen.add(key);

    const nCentroid = centroidFromGeometry(feat.geometry);
    if (!nCentroid) continue;
    const direction = cardinalDirection(subjectCentroid, nCentroid);
    const distanceMeters = Math.round(distanceInMeters(subjectCentroid, nCentroid));

    neighbours.push({
      pid,
      address: feat.attributes.CIVIC_ADDRESS || 'No address',
      lot_size: feat.attributes.LOT_SIZE || null,
      jurisdiction: feat.attributes.JURISDICTION || null,
      folio: feat.attributes.FOLIO || null,
      lot: feat.attributes.LOT || null,
      block: feat.attributes.BLOCK || null,
      plan_number: feat.attributes.PLAN_NUMBER || null,
      district_lot: feat.attributes.DIST_LOT || null,
      direction,
      distance_meters: distanceMeters,
      nearest_in_direction: false,
      ...summarizePlanningContext(nCentroid, planningLayers),
    });
  }

  return selectSurroundingProperties(neighbours);
}

module.exports = {
  searchParcelsRaw,
  getParcelByPID,
  getPlanningContext,
  getNeighbours,
  cardinalDirection,
  centroidFromGeometry,
  distanceInMeters,
  pointInGeometry,
  selectSurroundingProperties,
  summarizePlanningContext,
};
