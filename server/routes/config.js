const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getConfig } = require('../controllers/configController');
const { apiCacheMiddleware } = require('../middleware/cache');

// GET /api/config — returns all dynamic configuration values (cached 5 min)
router.get('/', protect, apiCacheMiddleware(300), getConfig);

module.exports = router;
