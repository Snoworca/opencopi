const { spawn } = require('child_process');
const config = require('../config');
const { logger } = require('../utils/logger');
const tempDirManager = require('./tempDirManager');
const messageTransformer = require('./messageTransformer');
const responseFormatter = require('./responseFormatter');

/**
 * Copilot CLI 실행 관리자
 */
class CopilotExecutor {
  constructor() {
    this.cliPath = config.copilot.cliPath;
    this.timeout = config.copilot.timeout;
  }

  /**
   * 비스트리밍 실행
   * @param {Array} messages - OpenAI 형식 메시지 배열
   * @param {string} model - 모델 ID
   * @param {Object} req - Express request 객체 (로깅용)
   * @returns {Promise<Object>} OpenAI 형식 응답
   */
  async execute(messages, model, req = null) {
    const { systemPrompt, prompt } = messageTransformer.transform(messages);
    const { dir } = await tempDirManager.create();

    // 로깅용 tempDir 정보 저장
    if (req) {
      req.tempDir = dir;
    }

    try {
      // 시스템 프롬프트가 있으면 AGENTS.md 작성
      await tempDirManager.writeAgentsFile(dir, systemPrompt);

      // Copilot CLI 실행
      const output = await this.runCopilot(prompt, model, dir, false);

      // 응답 포맷팅
      return responseFormatter.formatCompletion(output, model);
    } finally {
      // 임시 디렉토리 정리
      await tempDirManager.cleanup(dir);
    }
  }

  /**
   * 스트리밍 실행
   * @param {Array} messages - OpenAI 형식 메시지 배열
   * @param {string} model - 모델 ID
   * @param {Object} res - Express response 객체
   * @param {Object} req - Express request 객체 (로깅용)
   */
  async executeStream(messages, model, res, req = null) {
    const { systemPrompt, prompt } = messageTransformer.transform(messages);
    const { dir } = await tempDirManager.create();
    const streamId = responseFormatter.generateStreamId();
    let isFirstChunk = true;

    // 로깅용 tempDir 정보 저장
    if (req) {
      req.tempDir = dir;
    }

    try {
      // 시스템 프롬프트가 있으면 AGENTS.md 작성
      await tempDirManager.writeAgentsFile(dir, systemPrompt);

      // SSE 헤더 설정
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      await new Promise((resolve, reject) => {
        const args = [
          '-p', prompt,
          '--model', model,
          '--silent',
          '--allow-all-tools',
          '--stream', 'on'
        ];

        logger.debug(`Spawning copilot with args: ${args.join(' ')}`);

        const proc = spawn(this.cliPath, args, {
          cwd: dir,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error('Request timeout'));
        }, this.timeout);

        proc.stdout.on('data', (data) => {
          const content = data.toString();
          // 빈 문자열이 아니면 전송 (공백/줄바꿈도 유지)
          if (content.length > 0) {
            const chunk = responseFormatter.formatStreamChunk(
              content,
              model,
              streamId,
              isFirstChunk,
              false
            );
            res.write(chunk);
            isFirstChunk = false;
          }
        });

        proc.stderr.on('data', (data) => {
          logger.warn(`Copilot stderr: ${data.toString()}`);
        });

        proc.on('close', (code) => {
          clearTimeout(timeoutId);

          if (code === 0) {
            // 종료 청크 전송
            res.write(responseFormatter.formatStreamChunk('', model, streamId, false, true));
            res.write(responseFormatter.formatStreamEnd());
            res.end();
            resolve();
          } else {
            reject(new Error(`Copilot process exited with code ${code}`));
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });

        // 클라이언트 연결 종료 시 프로세스 종료
        res.on('close', () => {
          clearTimeout(timeoutId);
          if (!proc.killed) {
            proc.kill('SIGTERM');
          }
        });
      });
    } catch (err) {
      // 스트리밍 중 에러 발생 시
      if (!res.headersSent) {
        throw err;
      } else {
        // 이미 스트리밍 시작된 경우 에러 청크 전송
        const errorChunk = {
          error: {
            message: err.message,
            type: 'server_error',
            code: 'stream_error'
          }
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.end();
      }
    } finally {
      // 임시 디렉토리 정리
      await tempDirManager.cleanup(dir);
    }
  }

  /**
   * 스트리밍 실행 (콜백 방식)
   * @param {Array} messages - OpenAI 형식 메시지 배열
   * @param {string} model - 모델 ID
   * @param {Object} req - Express request 객체 (로깅용)
   * @param {Function} onChunk - 청크 콜백 함수
   */
  async executeStreamCallback(messages, model, req, onChunk) {
    const { systemPrompt, prompt } = messageTransformer.transform(messages);
    const { dir } = await tempDirManager.create();
    const streamId = responseFormatter.generateStreamId();

    if (req) {
      req.tempDir = dir;
    }

    try {
      await tempDirManager.writeAgentsFile(dir, systemPrompt);

      await new Promise((resolve, reject) => {
        const args = [
          '-p', prompt,
          '--model', model,
          '--silent',
          '--allow-all-tools',
          '--stream', 'on'
        ];

        const proc = spawn(this.cliPath, args, {
          cwd: dir,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error('Request timeout'));
        }, this.timeout);

        proc.stdout.on('data', (data) => {
          const content = data.toString();
          if (content.length > 0) {
            onChunk({
              choices: [{
                delta: { content },
                index: 0
              }]
            });
          }
        });

        proc.stderr.on('data', (data) => {
          logger.warn(`Copilot stderr: ${data.toString()}`);
        });

        proc.on('close', (code) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Copilot process exited with code ${code}`));
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
    } finally {
      await tempDirManager.cleanup(dir);
    }
  }

  /**
   * Copilot CLI 실행 (비스트리밍)
   * @param {string} prompt - 프롬프트
   * @param {string} model - 모델 ID
   * @param {string} cwd - 작업 디렉토리
   * @param {boolean} stream - 스트리밍 여부
   * @returns {Promise<string>} CLI 출력
   */
  runCopilot(prompt, model, cwd, stream = false) {
    return new Promise((resolve, reject) => {
      const args = [
        '-p', prompt,
        '--model', model,
        '--silent',
        '--allow-all-tools',
        '--stream', stream ? 'on' : 'off'
      ];

      logger.debug(`Spawning copilot with args: ${args.join(' ')}`);

      const proc = spawn(this.cliPath, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(this.createError('Request timeout', 504, 'timeout_error', 'timeout'));
      }, this.timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          // 출력 정리 (불필요한 메시지 제거)
          const cleanOutput = this.cleanOutput(stdout);
          resolve(cleanOutput);
        } else {
          logger.error(`Copilot failed with code ${code}: ${stderr}`);
          reject(this.createError(
            `Copilot execution failed: ${stderr || 'Unknown error'}`,
            503,
            'service_unavailable',
            'copilot_execution_error'
          ));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error(`Copilot spawn error: ${err.message}`);
        reject(this.createError(
          `Failed to execute Copilot CLI: ${err.message}`,
          503,
          'service_unavailable',
          'copilot_spawn_error'
        ));
      });
    });
  }

  /**
   * 출력 정리
   * @param {string} output - 원본 출력
   * @returns {string} 정리된 출력
   */
  cleanOutput(output) {
    // Shell cwd 메시지 제거
    let cleaned = output.replace(/Shell cwd was reset to .+\n?/g, '');
    // system-reminder 태그 제거
    cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
    return cleaned.trim();
  }

  /**
   * 에러 객체 생성
   */
  createError(message, status, type, code) {
    const error = new Error(message);
    error.status = status;
    error.type = type;
    error.code = code;
    return error;
  }
}

module.exports = new CopilotExecutor();
