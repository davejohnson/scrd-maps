const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cardinalDirection,
  centroidFromGeometry,
  distanceInMeters,
  getNeighbours,
  pointInGeometry,
  selectSurroundingProperties,
} = require('../services/scrd-api');

function rectangle(minX, minY, maxX, maxY) {
  return {
    rings: [[
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ]],
  };
}

function response(features) {
  return Promise.resolve({
    json: () => Promise.resolve({ features }),
  });
}

test('calculates parcel centroids, compass directions, and approximate distance', () => {
  const subject = centroidFromGeometry(rectangle(-0.0001, -0.0001, 0.0001, 0.0001));
  const north = centroidFromGeometry(rectangle(-0.0001, 0.0009, 0.0001, 0.0011));

  assert.ok(Math.abs(subject[0]) < 1e-12);
  assert.ok(Math.abs(subject[1]) < 1e-12);
  assert.equal(cardinalDirection(subject, north), 'north');
  assert.ok(distanceInMeters(subject, north) > 110);
  assert.ok(distanceInMeters(subject, north) < 112);
});

test('matches points in multipart polygon geometry with holes', () => {
  const geometry = {
    rings: [
      rectangle(0, 0, 10, 10).rings[0],
      rectangle(4, 4, 6, 6).rings[0],
    ],
  };

  assert.equal(pointInGeometry([2, 2], geometry), true);
  assert.equal(pointInGeometry([5, 5], geometry), false);
  assert.equal(pointInGeometry([12, 12], geometry), false);
});

test('retains the nearest property in every represented compass direction', () => {
  const selected = selectSurroundingProperties([
    { pid: 'north-far', direction: 'north', distance_meters: 90, nearest_in_direction: false },
    { pid: 'east', direction: 'east', distance_meters: 50, nearest_in_direction: false },
    { pid: 'north-near', direction: 'north', distance_meters: 30, nearest_in_direction: false },
  ]);

  assert.equal(selected.find(property => property.pid === 'north-near').nearest_in_direction, true);
  assert.equal(selected.find(property => property.pid === 'north-far').nearest_in_direction, false);
  assert.equal(selected.find(property => property.pid === 'east').nearest_in_direction, true);
  assert.deepEqual(selected.map(property => property.pid), ['north-near', 'north-far', 'east']);
});

test('loads complete planning context for surrounding properties with one query per layer', async t => {
  const originalFetch = global.fetch;
  const requestedUrls = [];
  t.after(() => {
    global.fetch = originalFetch;
  });

  const subjectGeometry = rectangle(-0.0001, -0.0001, 0.0001, 0.0001);
  const northGeometry = rectangle(-0.0001, 0.0007, 0.0001, 0.0009);
  const eastGeometry = rectangle(0.0007, -0.0001, 0.0009, 0.0001);
  const planningGeometry = rectangle(-0.01, -0.01, 0.01, 0.01);

  global.fetch = url => {
    requestedUrls.push(url);
    if (url.includes('PropertyInformation/FeatureServer/0')) {
      return response([
        { attributes: { PID: 'subject', CIVIC_ADDRESS: 'SUBJECT' }, geometry: subjectGeometry },
        {
          attributes: {
            PID: 'north',
            CIVIC_ADDRESS: 'NORTH PROPERTY',
            LOT_SIZE: '1 ACRE',
            JURISDICTION: 'SCRD',
            FOLIO: 'north-folio',
            LOT: '2',
            BLOCK: 'A',
            PLAN_NUMBER: 'PLAN1',
            DIST_LOT: '100',
          },
          geometry: northGeometry,
        },
        {
          attributes: {
            PID: 'east',
            CIVIC_ADDRESS: 'EAST PROPERTY',
            LOT_SIZE: '2 ACRES',
          },
          geometry: eastGeometry,
        },
      ]);
    }
    if (url.includes('PlanningDevelopment/FeatureServer/14')) {
      return response([{
        attributes: {
          LANDUSE: 'R2',
          DESCRIP: 'Residential Two',
          SCHEDULE: 'A',
          BYLAW: '722',
        },
        geometry: planningGeometry,
      }]);
    }
    if (url.includes('PlanningDevelopment/FeatureServer/114')) {
      return response([{
        attributes: { LANDUSE: 'Residential B', OCP_NAME: 'Roberts Creek OCP' },
        geometry: planningGeometry,
      }]);
    }
    if (url.includes('PlanningDevelopment/FeatureServer/111')) {
      return response([{
        attributes: { SUBDIVISIO: 'D', BYLAW: '722' },
        geometry: planningGeometry,
      }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const neighbours = await getNeighbours(subjectGeometry, 'subject');

  assert.equal(requestedUrls.length, 4);
  assert.deepEqual(neighbours.map(property => property.direction), ['north', 'east']);
  assert.equal(neighbours[0].address, 'NORTH PROPERTY');
  assert.equal(neighbours[0].plan_number, 'PLAN1');
  assert.equal(neighbours[0].zoning, 'R2 (Residential Two)');
  assert.equal(neighbours[0].zoning_bylaw, '722');
  assert.equal(neighbours[0].ocp, 'Residential B');
  assert.equal(neighbours[0].ocp_area, 'Roberts Creek OCP');
  assert.equal(neighbours[0].subdivision_district, 'D');
  assert.equal(neighbours[0].subdivision_bylaw, '722');
  assert.equal(neighbours[0].nearest_in_direction, true);
  assert.ok(neighbours[0].distance_meters > 80);
  assert.ok(neighbours[0].distance_meters < 100);
});
