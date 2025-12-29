/**
 * OpenAI 메시지 형식을 Copilot CLI 입력으로 변환
 */
class MessageTransformer {
  /**
   * OpenAI messages 배열을 Copilot CLI 입력으로 변환
   * @param {Array<{role: string, content: string}>} messages - OpenAI 형식 메시지 배열
   * @returns {{ systemPrompt: string, prompt: string }}
   */
  transform(messages) {
    // 1. 시스템 메시지 추출
    const systemMessages = messages.filter(m => m.role === 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    // 2. 대화 메시지 추출
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // 3. 프롬프트 생성
    const prompt = this.buildPrompt(conversationMessages);

    return { systemPrompt, prompt };
  }

  /**
   * 대화 메시지를 프롬프트 텍스트로 변환
   * @param {Array<{role: string, content: string}>} messages
   * @returns {string}
   */
  buildPrompt(messages) {
    if (messages.length === 0) {
      return '';
    }

    // 단일 user 메시지인 경우 직접 반환
    if (messages.length === 1 && messages[0].role === 'user') {
      return messages[0].content;
    }

    // 여러 메시지가 있는 경우
    const parts = [];
    const lastIndex = messages.length - 1;

    // 마지막 메시지를 제외한 히스토리
    if (lastIndex > 0) {
      parts.push('Previous conversation:');
      for (let i = 0; i < lastIndex; i++) {
        const msg = messages[i];
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        parts.push(`${role}: ${msg.content}`);
      }
      parts.push('');
      parts.push('Current request:');
    }

    // 마지막 메시지
    const lastMessage = messages[lastIndex];
    parts.push(lastMessage.content);

    return parts.join('\n');
  }
}

module.exports = new MessageTransformer();
