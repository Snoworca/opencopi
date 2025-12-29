const express = require('express');
const healthRouter = require('./health');
const modelsRouter = require('./models');
const chatRouter = require('./chat');

const router = express.Router();

// 라우터 등록
router.use(healthRouter);
router.use(modelsRouter);
router.use(chatRouter);

module.exports = router;
