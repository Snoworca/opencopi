const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { logger } = require('../utils/logger');

/**
 * 임시 디렉토리 관리자
 */
class TempDirManager {
  constructor() {
    this.baseDir = config.copilot.tempDirBase;
  }

  /**
   * 새 임시 디렉토리 생성
   * @returns {Promise<{id: string, dir: string}>}
   */
  async create() {
    const id = uuidv4();
    const dir = path.join(this.baseDir, `copilot-${id}`);

    await fs.mkdir(dir, { recursive: true });
    logger.debug(`Created temp directory: ${dir}`);

    return { id, dir };
  }

  /**
   * AGENTS.md 파일 작성 (시스템 프롬프트 - Copilot용)
   * @param {string} dir - 디렉토리 경로
   * @param {string} systemPrompt - 시스템 프롬프트 내용
   */
  async writeAgentsFile(dir, systemPrompt) {
    if (!systemPrompt || systemPrompt.trim() === '') {
      return;
    }

    const filePath = path.join(dir, 'AGENTS.md');
    await fs.writeFile(filePath, systemPrompt, 'utf-8');
    logger.debug(`Written AGENTS.md to: ${filePath}`);
  }

  /**
   * 시스템 프롬프트 파일 작성 (Claude용)
   * @param {string} dir - 디렉토리 경로
   * @param {string} systemPrompt - 시스템 프롬프트 내용
   * @returns {Promise<string|null>} 파일 경로 또는 null
   */
  async writeSystemPromptFile(dir, systemPrompt) {
    if (!systemPrompt || systemPrompt.trim() === '') {
      return null;
    }

    const filePath = path.join(dir, 'system-prompt.txt');
    await fs.writeFile(filePath, systemPrompt, 'utf-8');
    logger.debug(`Written system-prompt.txt to: ${filePath}`);
    return filePath;
  }

  /**
   * 임시 디렉토리 정리
   * @param {string} dir - 디렉토리 경로
   */
  async cleanup(dir) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      logger.debug(`Cleaned up temp directory: ${dir}`);
    } catch (err) {
      logger.warn(`Failed to cleanup temp directory ${dir}: ${err.message}`);
    }
  }
}

module.exports = new TempDirManager();
