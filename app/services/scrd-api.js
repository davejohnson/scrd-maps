const BASE = 'https://maps.scrd.ca/arcgis/rest/services';
const PROPERTY = `${BASE}/mySCRDpub_PropertyInformation/FeatureServer`;
const PLANNING = `${BASE}/mySCRDpub_PlanningDevelopment/FeatureServer`;

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
    outFields: 'PID,CIVIC_ADDRESS,LOT_SIZE,JURISDICTION,FOLIO,LOT,PLAN_NUMBER,DIST_LOT',
    returnGeometry: 'true',
    outSR: '4326',
  });
  const res = await fetch(`${PROPERTY}/0/query?${qs}`);
  const data = await res.json();
  if (!data.features || !data.features.length) return null;
  const feat = data.features[0];
  const rings = feat.geometry.rings[0];
  const xs = rings.map(p => p[0]);
  const ys = rings.map(p => p[1]);
  const centroid = [xs.reduce((a,b) => a+b) / xs.length, ys.reduce((a,b) => a+b) / ys.length];
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
  const rings = geometry.rings[0];
  const xs = rings.map(p => p[0]);
  const ys = rings.map(p => p[1]);
  return [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length];
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

  const qs = new URLSearchParams({
    f: 'json',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PID,CIVIC_ADDRESS,LOT_SIZE',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '20',
  });

  const res = await fetch(`${PROPERTY}/0/query?${qs}`);
  const data = await res.json();
  if (!data.features) return [];

  const subjectCentroid = centroidFromGeometry(geometry);
  const seen = new Set();
  const neighbours = [];

  for (const feat of data.features) {
    const pid = feat.attributes.PID;
    if (pid === subjectPID) continue;

    const addr = feat.attributes.CIVIC_ADDRESS || '';
    const baseAddr = addr.replace(/^[A-Z]?\d+-/, '').trim();
    const key = baseAddr || pid;
    if (seen.has(key)) continue;
    seen.add(key);

    const nCentroid = centroidFromGeometry(feat.geometry);
    const direction = cardinalDirection(subjectCentroid, nCentroid);

    const planning = await getPlanningContext(nCentroid[0], nCentroid[1]);

    neighbours.push({
      pid,
      address: feat.attributes.CIVIC_ADDRESS || 'No address',
      lot_size: feat.attributes.LOT_SIZE || null,
      direction,
      zoning: planning.zoning ? `${planning.zoning.LANDUSE} (${planning.zoning.DESCRIP})` : 'Unknown',
      ocp: planning.ocp ? planning.ocp.LANDUSE : 'Unknown',
      subdivision_district: planning.subdivision ? planning.subdivision.SUBDIVISIO : 'Unknown',
    });
  }

  const dirOrder = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  neighbours.sort((a, b) => dirOrder.indexOf(a.direction) - dirOrder.indexOf(b.direction));

  return neighbours;
}

module.exports = { searchParcelsRaw, getParcelByPID, getPlanningContext, getNeighbours };
