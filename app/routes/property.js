const { Router } = require('express');
const { searchParcelsRaw, getParcelByPID, getPlanningContext, getNeighbours } = require('../services/scrd-api');

const router = Router();

// GET /api/property/search?q=2720+Lower
router.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q || typeof q !== 'string' || q.length < 3 || q.length > 100) {
    return res.json({ features: [] });
  }
  try {
    const data = await searchParcelsRaw(q);
    res.json(data);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

// GET /api/property/:pid
router.get('/:pid', async (req, res) => {
  const pid = req.params.pid;
  if (!/^\d{3}-\d{3}-\d{3}$/.test(pid)) {
    return res.status(400).json({ error: 'Invalid PID format. Expected NNN-NNN-NNN.' });
  }
  try {
    const parcel = await getParcelByPID(pid);
    if (!parcel) return res.status(404).json({ error: 'Parcel not found.' });

    const [planning, neighbours] = await Promise.all([
      getPlanningContext(parcel.centroid[0], parcel.centroid[1]),
      getNeighbours(parcel.geometry, parcel.PID),
    ]);

    res.json({ parcel, planning, neighbours });
  } catch (err) {
    console.error('Property lookup error:', err);
    res.status(500).json({ error: 'Property lookup failed. Please try again.' });
  }
});

module.exports = router;
