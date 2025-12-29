const responseFormatter = require('../../src/services/responseFormatter');

describe('ResponseFormatter', () => {
  describe('formatCompletion', () => {
    it('should return valid OpenAI format response', () => {
      const result = responseFormatter.formatCompletion('Hello!', 'gpt-5-mini');

      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^chatcmpl-copilot-/);
      expect(result.object).toBe('chat.completion');
      expect(result.model).toBe('gpt-5-mini');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].message.role).toBe('assistant');
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(result.choices[0].finish_reason).toBe('stop');
      expect(result.usage).toHaveProperty('prompt_tokens');
    });

    it('should have correct created timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = responseFormatter.formatCompletion('Test', 'gpt-5-mini');
      const after = Math.floor(Date.now() / 1000);

      expect(result.created).toBeGreaterThanOrEqual(before);
      expect(result.created).toBeLessThanOrEqual(after);
    });
  });

  describe('formatStreamChunk', () => {
    it('should format first chunk with role', () => {
      const chunk = responseFormatter.formatStreamChunk(
        'Hello',
        'gpt-5-mini',
        'test-id',
        true,
        false
      );

      expect(chunk).toContain('data: ');
      expect(chunk).toContain('"role":"assistant"');
      expect(chunk).toContain('"content":"Hello"');
    });

    it('should format middle chunk without role', () => {
      const chunk = responseFormatter.formatStreamChunk(
        'World',
        'gpt-5-mini',
        'test-id',
        false,
        false
      );

      expect(chunk).toContain('data: ');
      expect(chunk).not.toContain('"role"');
      expect(chunk).toContain('"content":"World"');
    });

    it('should format last chunk with finish_reason', () => {
      const chunk = responseFormatter.formatStreamChunk(
        '',
        'gpt-5-mini',
        'test-id',
        false,
        true
      );

      expect(chunk).toContain('"finish_reason":"stop"');
    });
  });

  describe('formatStreamEnd', () => {
    it('should return [DONE] marker', () => {
      const result = responseFormatter.formatStreamEnd();

      expect(result).toBe('data: [DONE]\n\n');
    });
  });

  describe('generateStreamId', () => {
    it('should generate unique IDs', () => {
      const id1 = responseFormatter.generateStreamId();
      const id2 = responseFormatter.generateStreamId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^chatcmpl-copilot-/);
    });
  });
});
