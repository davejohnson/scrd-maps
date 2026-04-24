const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', 'data', 'scrd.sqlite'),
  logging: false,
});

const Zone = sequelize.define('Zone', {
  code:           { type: DataTypes.STRING, primaryKey: true },
  name:           { type: DataTypes.STRING },
  bylaw:          { type: DataTypes.STRING },
  section:        { type: DataTypes.STRING },
  intent:         { type: DataTypes.TEXT },
  permitted_uses: { type: DataTypes.TEXT },   // JSON
  density:        { type: DataTypes.TEXT },   // JSON
  max_coverage:   { type: DataTypes.TEXT },
}, { tableName: 'zones', timestamps: false });

const SubdivisionDistrict = sequelize.define('SubdivisionDistrict', {
  code:       { type: DataTypes.STRING, primaryKey: true },
  min_area:   { type: DataTypes.INTEGER },
  avg_area:   { type: DataTypes.INTEGER },
  conditions: { type: DataTypes.TEXT },
}, { tableName: 'subdivision_districts', timestamps: false });

const OcpDesignation = sequelize.define('OcpDesignation', {
  id:              { type: DataTypes.STRING, primaryKey: true },
  name:            { type: DataTypes.STRING },
  ocp_bylaw:       { type: DataTypes.STRING },
  electoral_area:  { type: DataTypes.STRING },
  min_lot_m2:      { type: DataTypes.INTEGER },
  description:     { type: DataTypes.TEXT },
}, { tableName: 'ocp_designations', timestamps: false });

const BylawSection = sequelize.define('BylawSection', {
  id:        { type: DataTypes.STRING, primaryKey: true },  // e.g. '722:4.5'
  bylaw:     { type: DataTypes.STRING },
  section:   { type: DataTypes.STRING },
  title:     { type: DataTypes.STRING },
  content:   { type: DataTypes.TEXT },
  keywords:  { type: DataTypes.TEXT },  // comma-separated for search
}, { tableName: 'bylaw_sections', timestamps: false });

module.exports = { sequelize, Zone, SubdivisionDistrict, OcpDesignation, BylawSection };
