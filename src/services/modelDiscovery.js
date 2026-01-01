/**
 * Model Discovery Service
 * Copilot CLI에서 사용 가능한 모델 목록을 동적으로 탐색
 * Claude 모드에서는 단일 모델만 반환
 */

const { spawn } = require('child_process');
const config = require('../config');
const { logger } = require('../utils/logger');

// 캐시된 모델 목록
let cachedModels = null;

// Claude 모드용 단일 모델
const CLAUDE_MODEL = {
  id: 'claude-haiku-4-5-20251001',
  owned_by: 'anthropic'
};

// 폴백 모델 목록 (CLI 호출 실패 시)
const FALLBACK_MODELS = [
  { id: 'claude-sonnet-4.5', owned_by: 'anthropic' },
  { id: 'claude-haiku-4.5', owned_by: 'anthropic' },
  { id: 'claude-opus-4.5', owned_by: 'anthropic' },
  { id: 'claude-sonnet-4', owned_by: 'anthropic' },
  { id: 'gpt-5.1-codex-max', owned_by: 'openai' },
  { id: 'gpt-5.1-codex', owned_by: 'openai' },
  { id: 'gpt-5.2', owned_by: 'openai' },
  { id: 'gpt-5.1', owned_by: 'openai' },
  { id: 'gpt-5', owned_by: 'openai' },
  { id: 'gpt-5.1-codex-mini', owned_by: 'openai' },
  { id: 'gpt-5-mini', owned_by: 'openai' },
  { id: 'gpt-4.1', owned_by: 'openai' },
  { id: 'gemini-3-pro-preview', owned_by: 'google' }
];

/**
 * 모델 ID로 제공사 추론
 */
function inferOwner(modelId) {
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gpt')) return 'openai';
  if (modelId.startsWith('gemini')) return 'google';
  if (modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) return 'openai';
  return 'unknown';
}

/**
 * Copilot CLI를 호출하여 모델 목록 파싱
 */
function discoverModels() {
  return new Promise((resolve, reject) => {
    const copilotPath = config.copilot.cliPath;
    const proc = spawn(copilotPath, ['--model', 'invalid-model-for-discovery'], {
      timeout: 10000
    });

    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      logger.error(`Failed to spawn copilot CLI: ${err.message}`);
      reject(err);
    });

    proc.on('close', (code) => {
      // stderr 또는 stdout에서 모델 목록 파싱
      const output = stderr + stdout;

      // "Allowed choices are X, Y, Z." 패턴 파싱
      // 모델 이름에 점(.)이 포함될 수 있으므로 마지막 마침표까지 매칭
      const match = output.match(/Allowed choices are (.+)\.$/m);

      if (match) {
        const modelIds = match[1].split(',').map(m => m.trim()).filter(m => m.length > 0);
        const models = modelIds.map(id => ({
          id,
          owned_by: inferOwner(id)
        }));

        logger.info(`Discovered ${models.length} models from Copilot CLI`);
        resolve(models);
      } else {
        logger.warn('Failed to parse model list from Copilot CLI output');
        reject(new Error('Failed to parse model list'));
      }
    });
  });
}

/**
 * 모델 목록 조회 (캐싱)
 * Claude 모드에서는 단일 모델만 반환
 */
async function getModels() {
  // Claude 모드: 단일 모델만 반환
  if (config.service === 'claude') {
    return [CLAUDE_MODEL];
  }

  // Copilot 모드: 동적 탐색
  if (cachedModels) {
    return cachedModels;
  }

  try {
    const models = await discoverModels();
    cachedModels = models;
    return models;
  } catch (error) {
    logger.warn(`Using fallback model list: ${error.message}`);
    cachedModels = FALLBACK_MODELS;
    return FALLBACK_MODELS;
  }
}

/**
 * 모델 ID가 유효한지 확인
 */
async function isValidModel(modelId) {
  const models = await getModels();
  return models.some(m => m.id === modelId);
}

/**
 * 특정 모델 정보 조회
 */
async function getModel(modelId) {
  const models = await getModels();
  return models.find(m => m.id === modelId) || null;
}

/**
 * 캐시 초기화 (테스트용)
 */
function clearCache() {
  cachedModels = null;
}

/**
 * 서버 시작 시 모델 목록 미리 로드
 */
async function preloadModels() {
  try {
    const models = await getModels();
    logger.info(`Preloaded ${models.length} models`);
    return models;
  } catch (error) {
    logger.error(`Failed to preload models: ${error.message}`);
    return FALLBACK_MODELS;
  }
}

module.exports = {
  getModels,
  getModel,
  isValidModel,
  clearCache,
  preloadModels,
  inferOwner,
  FALLBACK_MODELS
};
