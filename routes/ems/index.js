const express = require('express');
const router  = express.Router();

router.use('/documents',  require('./documents'));
router.use('/folders',    require('./folders'));
router.use('/groups',     require('./groups'));
router.use('/signatures', require('./signatures'));
router.use('/users',      require('./users'));
router.use('/audit',      require('./audit'));
router.use('/doctypes',   require('./doctypes'));
router.use('/metadata',   require('./metadata'));

module.exports = router;
