const express = require('express');
const healthRouter = require('./health');
const modelsRouter = require('./models');
const chatRouter = require('./chat');
const responsesRouter = require('./responses');

const router = express.Router();

// 라우터 등록
router.use(healthRouter);
router.use(modelsRouter);
router.use(chatRouter);
router.use(responsesRouter);

module.exports = router;
