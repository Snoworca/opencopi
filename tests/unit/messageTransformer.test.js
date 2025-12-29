const messageTransformer = require('../../src/services/messageTransformer');

describe('MessageTransformer', () => {
  describe('transform', () => {
    it('should extract system prompt from messages', () => {
      const messages = [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' }
      ];

      const result = messageTransformer.transform(messages);

      expect(result.systemPrompt).toBe('Be helpful');
      expect(result.prompt).toBe('Hi');
    });

    it('should handle multiple system messages', () => {
      const messages = [
        { role: 'system', content: 'Rule 1' },
        { role: 'system', content: 'Rule 2' },
        { role: 'user', content: 'Hi' }
      ];

      const result = messageTransformer.transform(messages);

      expect(result.systemPrompt).toBe('Rule 1\n\nRule 2');
    });

    it('should handle messages without system prompt', () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const result = messageTransformer.transform(messages);

      expect(result.systemPrompt).toBe('');
      expect(result.prompt).toBe('Hello');
    });

    it('should format conversation history', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' }
      ];

      const result = messageTransformer.transform(messages);

      expect(result.prompt).toContain('Previous conversation:');
      expect(result.prompt).toContain('User: Hello');
      expect(result.prompt).toContain('Assistant: Hi!');
      expect(result.prompt).toContain('How are you?');
    });

    it('should handle single user message', () => {
      const messages = [
        { role: 'user', content: 'Just one message' }
      ];

      const result = messageTransformer.transform(messages);

      expect(result.prompt).toBe('Just one message');
      expect(result.prompt).not.toContain('Previous conversation:');
    });

    it('should handle empty messages array', () => {
      const messages = [];

      const result = messageTransformer.transform(messages);

      expect(result.systemPrompt).toBe('');
      expect(result.prompt).toBe('');
    });
  });
});
