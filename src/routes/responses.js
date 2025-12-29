const express = require('express');
const copilotExecutor = require('../services/copilotExecutor');
const { logger } = require('../utils/logger');
const config = require('../config');
const { getModels } = require('../services/modelDiscovery');

const router = express.Router();

/**
 * content를 문자열로 변환
 */
function extractTextContent(content) {
  // 문자열인 경우 그대로 반환
  if (typeof content === 'string') {
    return content;
  }

  // 배열인 경우 (OpenAI Responses API 형식: [{type: "input_text", text: "..."}, ...])
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.text) return item.text;
        if (item.content) return extractTextContent(item.content);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  // 객체인 경우
  if (typeof content === 'object' && content !== null) {
    if (content.text) return content.text;
    if (content.content) return extractTextContent(content.content);
    // JSON으로 변환
    return JSON.stringify(content);
  }

  return String(content || '');
}

/**
 * input을 messages 형식으로 변환
 */
function convertInputToMessages(input, instructions) {
  const messages = [];

  // instructions가 있으면 system 메시지로 추가
  if (instructions) {
    messages.push({ role: 'system', content: extractTextContent(instructions) });
  }

  // input이 없는 경우
  if (input === undefined || input === null) {
    return messages;
  }

  // input이 문자열인 경우
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return messages;
  }

  // input이 배열인 경우
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
      } else if (item && typeof item === 'object') {
        const role = item.role || 'user';
        const content = extractTextContent(item.content);
        if (content) {
          messages.push({ role, content });
        }
      }
    }
    return messages;
  }

  // input이 객체인 경우 (단일 메시지)
  if (typeof input === 'object') {
    const role = input.role || 'user';
    const content = extractTextContent(input.content || input.text || input);
    if (content && content !== '[object Object]') {
      messages.push({ role, content });
    } else {
      // 객체 전체를 JSON 문자열로 변환
      messages.push({ role: 'user', content: JSON.stringify(input) });
    }
    return messages;
  }

  // 기타 경우
  messages.push({ role: 'user', content: String(input) });
  return messages;
}

/**
 * Chat Completion 응답을 Responses API 형식으로 변환
 */
function convertToResponsesFormat(chatResponse, model) {
  const now = Math.floor(Date.now() / 1000);
  const responseId = `resp_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

  const content = chatResponse.choices?.[0]?.message?.content || '';

  return {
    id: responseId,
    object: 'response',
    created_at: now,
    status: 'completed',
    model: model,
    output: [
      {
        type: 'message',
        id: `msg_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`,
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: content
          }
        ]
      }
    ],
    usage: chatResponse.usage || {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    }
  };
}

/**
 * POST /v1/responses
 * Responses API (OpenAI 호환)
 */
router.post('/v1/responses', async (req, res, next) => {
  try {
    let {
      model,
      input,
      instructions,
      stream,
      // OpenAI 호환 파라미터 (Copilot CLI에서 미지원, 무시됨)
      temperature,
      max_output_tokens,
      top_p,
      presence_penalty,
      frequency_penalty,
      store,
      metadata
    } = req.body;

    // 모델 기본값 및 소문자 정규화
    if (!model) {
      model = config.copilot.defaultModel;
    } else {
      model = model.toLowerCase();
    }

    // 모델 유효성 검사
    const models = await getModels();
    const validModel = models.find(m => m.id.toLowerCase() === model.toLowerCase());
    if (!validModel) {
      return res.status(404).json({
        error: {
          message: `Model '${model}' not found`,
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      });
    }

    // input을 messages로 변환
    const messages = convertInputToMessages(input, instructions);

    if (messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Input is required',
          type: 'invalid_request_error',
          code: 'missing_input'
        }
      });
    }

    // 무시되는 파라미터 경고 로그
    const ignoredParams = [];
    if (temperature !== undefined) ignoredParams.push(`temperature=${temperature}`);
    if (max_output_tokens !== undefined) ignoredParams.push(`max_output_tokens=${max_output_tokens}`);
    if (top_p !== undefined) ignoredParams.push(`top_p=${top_p}`);
    if (presence_penalty !== undefined) ignoredParams.push(`presence_penalty=${presence_penalty}`);
    if (frequency_penalty !== undefined) ignoredParams.push(`frequency_penalty=${frequency_penalty}`);

    if (ignoredParams.length > 0) {
      logger.warn(`Responses API: Ignored parameters (not supported by Copilot CLI): ${ignoredParams.join(', ')}`);
    }

    logger.info(`Responses API request: model=${model}, stream=${stream || false}, messages=${messages.length}`);

    if (req.requestLog) {
      req.requestLog.request.model = model;
      req.requestLog.request.messageCount = messages.length;
      req.requestLog.request.stream = stream || false;
      req.requestLog.request.endpoint = 'responses';
    }

    if (stream) {
      // 스트리밍 모드 - SSE 형식으로 Responses API 스트림
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseId = `resp_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
      const msgId = `msg_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

      // 시작 이벤트
      res.write(`data: ${JSON.stringify({
        type: 'response.created',
        response: {
          id: responseId,
          object: 'response',
          status: 'in_progress',
          model: model
        }
      })}\n\n`);

      let fullContent = '';

      // Chat Completion 스트림을 Responses 스트림으로 변환
      await copilotExecutor.executeStreamCallback(messages, model, req, (chunk) => {
        if (chunk.choices?.[0]?.delta?.content) {
          const text = chunk.choices[0].delta.content;
          fullContent += text;
          res.write(`data: ${JSON.stringify({
            type: 'response.output_text.delta',
            delta: text,
            output_index: 0,
            content_index: 0
          })}\n\n`);
        }
      });

      // 완료 이벤트
      res.write(`data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          id: responseId,
          object: 'response',
          status: 'completed',
          model: model,
          output: [{
            type: 'message',
            id: msgId,
            role: 'assistant',
            content: [{ type: 'output_text', text: fullContent }]
          }]
        }
      })}\n\n`);

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // 비스트리밍 모드
      const chatResponse = await copilotExecutor.execute(messages, model, req);
      const responsesFormat = convertToResponsesFormat(chatResponse, model);
      res.json(responsesFormat);
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
