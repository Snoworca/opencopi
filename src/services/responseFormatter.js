const { v4: uuidv4 } = require('uuid');

/**
 * OpenAI API 호환 응답 포맷터
 */
class ResponseFormatter {
  /**
   * 비스트리밍 응답 생성
   * @param {string} content - 응답 내용
   * @param {string} model - 모델 ID
   * @returns {Object} OpenAI 형식 응답
   */
  formatCompletion(content, model) {
    return {
      id: `chatcmpl-copilot-${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: -1,
        completion_tokens: -1,
        total_tokens: -1
      }
    };
  }

  /**
   * 스트리밍 청크 생성
   * @param {string} content - 청크 내용
   * @param {string} model - 모델 ID
   * @param {string} id - 응답 ID
   * @param {boolean} isFirst - 첫 번째 청크 여부
   * @param {boolean} isLast - 마지막 청크 여부
   * @returns {string} SSE 형식 청크
   */
  formatStreamChunk(content, model, id, isFirst = false, isLast = false) {
    const chunk = {
      id: id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          delta: isFirst
            ? { role: 'assistant', content: content }
            : isLast
              ? {}
              : { content: content },
          finish_reason: isLast ? 'stop' : null
        }
      ]
    };

    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  /**
   * 스트리밍 종료 마커
   * @returns {string}
   */
  formatStreamEnd() {
    return 'data: [DONE]\n\n';
  }

  /**
   * 새 스트리밍 응답 ID 생성
   * @returns {string}
   */
  generateStreamId() {
    return `chatcmpl-copilot-${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  }
}

module.exports = new ResponseFormatter();
