const express = require('express');
const { validateChatCompletion } = require('../middleware/validateRequest');
const copilotExecutor = require('../services/copilotExecutor');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * POST /v1/chat/completions
 * Chat Completion API (OpenAI 호환)
 */
router.post('/v1/chat/completions', validateChatCompletion, async (req, res, next) => {
  const { model, messages, stream, temperature, max_tokens, top_p, presence_penalty, frequency_penalty } = req.validatedBody;

  // 무시되는 파라미터 경고 로그
  const ignoredParams = [];
  if (temperature !== undefined) ignoredParams.push(`temperature=${temperature}`);
  if (max_tokens !== undefined) ignoredParams.push(`max_tokens=${max_tokens}`);
  if (top_p !== undefined) ignoredParams.push(`top_p=${top_p}`);
  if (presence_penalty !== undefined) ignoredParams.push(`presence_penalty=${presence_penalty}`);
  if (frequency_penalty !== undefined) ignoredParams.push(`frequency_penalty=${frequency_penalty}`);

  if (ignoredParams.length > 0) {
    logger.warn(`Chat Completions: Ignored parameters (not supported by Copilot CLI): ${ignoredParams.join(', ')}`);
  }

  logger.info(`Chat completion request: model=${model}, stream=${stream}, messages=${messages.length}`);

  // 요청 로그에 모델과 메시지 수 추가
  if (req.requestLog) {
    req.requestLog.request.model = model;
    req.requestLog.request.messageCount = messages.length;
    req.requestLog.request.stream = stream;
  }

  try {
    if (stream) {
      // 스트리밍 모드
      await copilotExecutor.executeStream(messages, model, res, req);
    } else {
      // 비스트리밍 모드
      const response = await copilotExecutor.execute(messages, model, req);
      res.json(response);
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
