const express = require('express');
const { getModels, getModel } = require('../services/modelDiscovery');

const router = express.Router();

/**
 * GET /v1/models
 * 사용 가능한 모델 목록 반환 (동적 탐색)
 */
router.get('/v1/models', async (req, res, next) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const modelList = await getModels();

    const models = modelList.map(model => ({
      id: model.id,
      object: 'model',
      created: now,
      owned_by: model.owned_by,
      permission: [],
      root: model.id,
      parent: null,
      max_model_len: 128000
    }));

    res.json({
      object: 'list',
      data: models
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/models/:model
 * 특정 모델 정보 반환
 */
router.get('/v1/models/:model', async (req, res, next) => {
  try {
    const modelId = req.params.model;
    const model = await getModel(modelId);

    if (!model) {
      return res.status(404).json({
        error: {
          message: `Model '${modelId}' not found`,
          type: 'not_found',
          code: 'model_not_found'
        }
      });
    }

    res.json({
      id: model.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: model.owned_by,
      permission: [],
      root: model.id,
      parent: null,
      max_model_len: 128000
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
