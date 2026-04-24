const { sequelize, Zone, SubdivisionDistrict, OcpDesignation } = require('../models');

async function seed() {
  await sequelize.sync({ force: true });

  // Zones from Bylaw 722
  await Zone.bulkCreate([
    {
      code: 'R1', name: 'Residential One', bylaw: '722', section: '7.1',
      intent: 'To permit Single-Unit dwellings in residential areas with additional dwellings on larger residential lots.',
      permitted_uses: JSON.stringify({
        principal: [
          { use: 'single-unit dwelling' },
          { use: 'additional single-unit dwellings', conditions: 'Parcel area must exceed 3500 m2' },
        ],
        auxiliary: [
          { use: 'auxiliary dwelling unit', conditions: 'Parcel area must exceed 2000 m2, max 90 m2' },
          { use: 'short term rental', conditions: 'Parcel area must exceed 2000 m2' },
          { use: 'residential agriculture' },
          { use: 'keeping of livestock', conditions: 'Parcel area must exceed 3500 m2' },
        ],
      }),
      density: JSON.stringify([
        { parcel_area: '<=2000 m2', max_units: 1, types: 'Single-unit dwelling' },
        { parcel_area: '>2000 m2', max_units: 2, types: '1 Single-unit + 1 Auxiliary dwelling unit' },
        { parcel_area: '>3500 m2', max_units: 2, types: '2 Single-unit dwellings' },
      ]),
      max_coverage: '<750 m2: 45%, >=750 m2: 35%',
    },
    {
      code: 'R2', name: 'Residential Two', bylaw: '722', section: '7.2',
      intent: 'To permit Single-Unit dwellings in low density residential areas.',
      permitted_uses: JSON.stringify({
        principal: [
          { use: 'single-unit dwelling' },
          { use: 'additional single-unit dwelling or two-unit dwelling', conditions: 'Parcel area must exceed 3500 m2. May be used as community care facility.' },
        ],
        auxiliary: [
          { use: 'auxiliary dwelling unit', conditions: 'Parcel area must exceed 2000 m2, max 90 m2' },
          { use: 'short term rental' },
          { use: 'residential agriculture' },
          { use: 'keeping of livestock', conditions: 'Parcel area must exceed 3500 m2' },
        ],
      }),
      density: JSON.stringify([
        { parcel_area: '<=2000 m2', max_units: 1, types: 'Single-unit dwelling' },
        { parcel_area: '>2000 m2', max_units: 2, types: '1 Single-unit + 1 Auxiliary dwelling unit; or 1 two-unit dwelling' },
        { parcel_area: '>3500 m2', max_units: 2, types: '2 Single-unit dwelling units; or 1 single-unit + 1 community care facility' },
      ]),
      max_coverage: '<3500 m2: 35%, >=3500 m2: 15%',
    },
    {
      code: 'R3', name: 'Residential Three', bylaw: '722', section: '7.3',
      intent: 'To permit Single-Unit dwellings with restricted second floor areas in low density residential areas.',
      permitted_uses: JSON.stringify({
        principal: [{ use: 'single-unit dwelling' }],
        auxiliary: [{ use: 'short term rental' }],
      }),
      density: JSON.stringify([{ parcel_area: 'any', max_units: 1, types: 'Single-unit dwelling' }]),
      max_coverage: '45%. Max floor area = parcel area x 0.40, max 300 m2.',
    },
    {
      code: 'CR1', name: 'Country Residential One', bylaw: '722', section: '7.7',
      intent: 'To permit residential and rural uses on large rural lots.',
      permitted_uses: JSON.stringify({
        principal: [
          { use: 'single-unit dwelling' },
          { use: 'second single-unit dwelling or two-unit dwelling', conditions: 'Parcel area must exceed 8000 m2' },
          { use: 'agriculture' },
          { use: 'keeping of livestock' },
        ],
        auxiliary: [
          { use: 'auxiliary dwelling unit', conditions: 'Parcel area must exceed 3500 m2' },
          { use: 'residential agriculture' },
          { use: 'short term rental' },
        ],
      }),
      density: JSON.stringify([
        { parcel_area: '<=3500 m2', max_units: 1, types: 'Single-unit dwelling' },
        { parcel_area: '>3500 m2', max_units: 2, types: '1 Single-unit + 1 Auxiliary' },
        { parcel_area: '>8000 m2', max_units: 2, types: '2 Single-unit dwellings' },
      ]),
      max_coverage: '<=3500 m2: 35%, >3500 m2: 15%',
    },
    {
      code: 'CR2', name: 'Country Residential Two', bylaw: '722', section: '7.8',
      intent: 'To permit residential and rural uses on large rural lots with agriculture.',
      permitted_uses: JSON.stringify({
        principal: [{ use: 'single-unit dwelling' }, { use: 'agriculture' }, { use: 'keeping of livestock' }],
        auxiliary: [{ use: 'auxiliary dwelling unit', conditions: 'Parcel area must exceed 3500 m2' }, { use: 'short term rental' }],
      }),
      density: JSON.stringify([
        { parcel_area: '<=3500 m2', max_units: 1 },
        { parcel_area: '>3500 m2', max_units: 2 },
      ]),
      max_coverage: '<=3500 m2: 35%, >3500 m2: 15%',
    },
    {
      code: 'RU1', name: 'Rural Residential One', bylaw: '722', section: '7.9',
      intent: 'To permit residential and rural uses with limited commercial activity.',
      permitted_uses: JSON.stringify({
        principal: [{ use: 'single-unit dwelling' }, { use: 'agriculture' }, { use: 'keeping of livestock' }],
        auxiliary: [{ use: 'auxiliary dwelling unit' }, { use: 'short term rental' }, { use: 'bed and breakfast' }],
      }),
      density: JSON.stringify([
        { parcel_area: '<=3500 m2', max_units: 1 },
        { parcel_area: '>3500 m2', max_units: 2 },
      ]),
      max_coverage: '15%',
    },
    {
      code: 'RU2', name: 'Rural Residential Two', bylaw: '722', section: '7.11',
      intent: 'To permit residential and rural uses on very large rural lots.',
      permitted_uses: JSON.stringify({
        principal: [{ use: 'single-unit dwelling' }, { use: 'agriculture' }],
        auxiliary: [{ use: 'auxiliary dwelling unit' }],
      }),
      density: JSON.stringify([{ parcel_area: 'any', max_units: 1 }]),
      max_coverage: '10%',
    },
  ]);

  // Subdivision Districts from Bylaw 722 Section 4.2
  await SubdivisionDistrict.bulkCreate([
    { code: 'A', min_area: 1000, avg_area: null, conditions: null },
    { code: 'B', min_area: 1500, avg_area: null, conditions: null },
    { code: 'C', min_area: 2000, avg_area: null, conditions: null },
    { code: 'D', min_area: 2800, avg_area: 3500, conditions: null },
    { code: 'E', min_area: 4000, avg_area: 5000, conditions: null },
    { code: 'E1', min_area: 8000, avg_area: null, conditions: null },
    { code: 'E2', min_area: 8000, avg_area: null, conditions: 'Except Block 30 District Lot 695 Plan 2746' },
    { code: 'F', min_area: 8000, avg_area: 10000, conditions: null },
    { code: 'G', min_area: 17500, avg_area: null, conditions: null },
    { code: 'G1', min_area: 10000, avg_area: 17000, conditions: 'Parcels donated as park may count toward avg.' },
    { code: 'I', min_area: 40000, avg_area: null, conditions: null },
    { code: 'J', min_area: 250000, avg_area: null, conditions: 'May reduce to 10 ha with 15% park dedication.' },
    { code: 'Z', min_area: 1000000, avg_area: null, conditions: null },
  ]);

  // OCP Designations — Roberts Creek (Bylaw 641)
  await OcpDesignation.bulkCreate([
    {
      id: 'rc-res-a', name: 'Residential A', ocp_bylaw: '641', electoral_area: 'D',
      min_lot_m2: 2000,
      description: 'Soil types and terrain support on-site sewage disposal at 2000 m2 minimum. Supports community goal of maintaining larger residential parcels.',
    },
    {
      id: 'rc-res-b', name: 'Residential B', ocp_bylaw: '641', electoral_area: 'D',
      min_lot_m2: 3500,
      description: 'Lack of soil depth for adequate on-site sewage disposal requires 3500 m2 minimum.',
    },
    {
      id: 'rc-res-c', name: 'Residential C', ocp_bylaw: '641', electoral_area: 'D',
      min_lot_m2: 5000,
      description: 'Lack of soil depth for adequate on-site sewage disposal combined with near-surface bedrock requires 5000 m2 (1.235 acres) minimum.',
    },
    {
      id: 'rc-res-d', name: 'Residential D', ocp_bylaw: '641', electoral_area: 'D',
      min_lot_m2: 10000,
      description: 'Sloping terrain or shallow bedrock and lack of soil depth requires 10000 m2 (2.47 acres) minimum.',
    },
    {
      id: 'rc-country-res', name: 'Country Residential', ocp_bylaw: '641', electoral_area: 'D',
      min_lot_m2: 10000,
      description: 'Adjacent to Sunshine Coast Highway. Parcels of ~1 ha and larger maintained for rural atmosphere. Limited highway access, agriculture, and small-scale home occupations.',
    },
    // Halfmoon Bay (Bylaw 675)
    {
      id: 'hb-res-a', name: 'Residential A', ocp_bylaw: '675', electoral_area: 'B',
      min_lot_m2: 2000,
      description: 'Residential areas where soil and terrain support 2000 m2 minimum lots.',
    },
    {
      id: 'hb-res-b', name: 'Residential B', ocp_bylaw: '675', electoral_area: 'B',
      min_lot_m2: 3500,
      description: 'Residential areas requiring larger lots due to soil constraints.',
    },
  ]);

  console.log('Seeded: zones, subdivision districts, OCP designations');
  await sequelize.close();
}

seed().catch(err => { console.error(err); process.exit(1); });
