const Joi = require('joi');
const config = require('../config');
const { isValidModel, getModels } = require('../services/modelDiscovery');

const messageSchema = Joi.object({
  role: Joi.string().valid('system', 'user', 'assistant').required(),
  content: Joi.string().required()
});

const chatCompletionSchema = Joi.object({
  model: Joi.string().optional(),
  messages: Joi.array().items(messageSchema).min(1).required(),
  stream: Joi.boolean().default(false),
  // 무시되지만 허용하는 필드들
  temperature: Joi.number().min(0).max(2),
  max_tokens: Joi.number().integer().positive(),
  top_p: Joi.number().min(0).max(1),
  frequency_penalty: Joi.number(),
  presence_penalty: Joi.number(),
  stop: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string())),
  user: Joi.string(),
  n: Joi.number().integer().positive(),
  logprobs: Joi.boolean(),
  top_logprobs: Joi.number().integer()
}).unknown(true); // 알 수 없는 필드 허용

/**
 * Chat Completion 요청 검증 미들웨어
 */
async function validateChatCompletion(req, res, next) {
  try {
    const { error, value } = chatCompletionSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: {
          message: error.details[0].message,
          type: 'invalid_request_error',
          code: 'validation_error',
          param: error.details[0].path.join('.')
        }
      });
    }

    // 모델이 없으면 기본 모델 사용
    if (!value.model) {
      value.model = config.copilot.defaultModel;
    }

    // 모델 동적 검증
    const valid = await isValidModel(value.model);
    if (!valid) {
      const models = await getModels();
      const validModels = models.map(m => m.id);
      return res.status(404).json({
        error: {
          message: `Model '${value.model}' not found. Available models: ${validModels.join(', ')}`,
          type: 'not_found',
          code: 'model_not_found',
          param: 'model'
        }
      });
    }

    req.validatedBody = value;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { validateChatCompletion };
