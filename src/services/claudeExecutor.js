const { spawn } = require('child_process');
const config = require('../config');
const { logger } = require('../utils/logger');
const tempDirManager = require('./tempDirManager');
const messageTransformer = require('./messageTransformer');
const responseFormatter = require('./responseFormatter');

/**
 * Claude CLI 실행 관리자
 * Claude CLI를 래핑하여 OpenAI API 호환 응답 생성
 */
class ClaudeExecutor {
  constructor() {
    this.cliPath = config.claude.cliPath;
    this.timeout = config.claude.timeout;
    // Claude는 단일 모델만 지원
    this.model = config.claude.defaultModel;
  }

  /**
   * 비스트리밍 실행
   * @param {Array} messages - OpenAI 형식 메시지 배열
   * @param {string} model - 모델 ID (무시됨, 항상 고정 모델 사용)
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
      // 시스템 프롬프트가 있으면 임시 파일로 작성
      const systemPromptFile = await tempDirManager.writeSystemPromptFile(dir, systemPrompt);

      // Claude CLI 실행
      const output = await this.runClaude(prompt, dir, systemPromptFile);

      // 응답 포맷팅
      return responseFormatter.formatCompletion(output, this.model);
    } finally {
      // 임시 디렉토리 정리 (시스템 프롬프트 파일 포함)
      await tempDirManager.cleanup(dir);
    }
  }

  /**
   * 스트리밍 실행
   * @param {Array} messages - OpenAI 형식 메시지 배열
   * @param {string} model - 모델 ID (무시됨)
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
      // 시스템 프롬프트가 있으면 임시 파일로 작성
      const systemPromptFile = await tempDirManager.writeSystemPromptFile(dir, systemPrompt);

      // SSE 헤더 설정
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      await new Promise((resolve, reject) => {
        const args = this.buildArgs(prompt, systemPromptFile);

        logger.debug(`Spawning claude with args: ${args.join(' ')}`);

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
            const chunk = responseFormatter.formatStreamChunk(
              content,
              this.model,
              streamId,
              isFirstChunk,
              false
            );
            res.write(chunk);
            isFirstChunk = false;
          }
        });

        proc.stderr.on('data', (data) => {
          logger.warn(`Claude stderr: ${data.toString()}`);
        });

        proc.on('close', (code) => {
          clearTimeout(timeoutId);

          if (code === 0) {
            // 종료 청크 전송
            res.write(responseFormatter.formatStreamChunk('', this.model, streamId, false, true));
            res.write(responseFormatter.formatStreamEnd());
            res.end();
            resolve();
          } else {
            reject(new Error(`Claude process exited with code ${code}`));
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
   * @param {string} model - 모델 ID (무시됨)
   * @param {Object} req - Express request 객체 (로깅용)
   * @param {Function} onChunk - 청크 콜백 함수
   */
  async executeStreamCallback(messages, model, req, onChunk) {
    const { systemPrompt, prompt } = messageTransformer.transform(messages);
    const { dir } = await tempDirManager.create();

    if (req) {
      req.tempDir = dir;
    }

    try {
      const systemPromptFile = await tempDirManager.writeSystemPromptFile(dir, systemPrompt);

      await new Promise((resolve, reject) => {
        const args = this.buildArgs(prompt, systemPromptFile);

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
          logger.warn(`Claude stderr: ${data.toString()}`);
        });

        proc.on('close', (code) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Claude process exited with code ${code}`));
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
   * Claude CLI 명령 인자 생성
   * @param {string} prompt - 프롬프트
   * @param {string|null} systemPromptFile - 시스템 프롬프트 파일 경로
   * @returns {string[]} 명령 인자 배열
   */
  buildArgs(prompt, systemPromptFile) {
    const args = [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', this.model
    ];

    if (systemPromptFile) {
      args.push('--system-prompt-file', systemPromptFile);
    }

    return args;
  }

  /**
   * Claude CLI 실행 (비스트리밍)
   * @param {string} prompt - 프롬프트
   * @param {string} cwd - 작업 디렉토리
   * @param {string|null} systemPromptFile - 시스템 프롬프트 파일 경로
   * @returns {Promise<string>} CLI 출력
   */
  runClaude(prompt, cwd, systemPromptFile) {
    return new Promise((resolve, reject) => {
      const args = this.buildArgs(prompt, systemPromptFile);

      logger.debug(`Spawning claude with args: ${args.join(' ')}`);

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
          // 출력 정리
          const cleanOutput = this.cleanOutput(stdout);
          resolve(cleanOutput);
        } else {
          logger.error(`Claude failed with code ${code}: ${stderr}`);
          reject(this.createError(
            `Claude execution failed: ${stderr || 'Unknown error'}`,
            503,
            'service_unavailable',
            'claude_execution_error'
          ));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error(`Claude spawn error: ${err.message}`);
        reject(this.createError(
          `Failed to execute Claude CLI: ${err.message}`,
          503,
          'service_unavailable',
          'claude_spawn_error'
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
    // system-reminder 태그 제거
    let cleaned = output.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
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

module.exports = new ClaudeExecutor();
