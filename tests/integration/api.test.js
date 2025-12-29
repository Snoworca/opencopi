const request = require('supertest');

// Mock child_process before requiring app
jest.mock('child_process', () => {
  const EventEmitter = require('events');

  return {
    spawn: jest.fn((cmd, args) => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = jest.fn(() => { proc.killed = true; });

      // Simulate async response
      setImmediate(() => {
        proc.stdout.emit('data', Buffer.from('Mock response from Copilot'));
        proc.emit('close', 0);
      });

      return proc;
    }),
    execSync: jest.fn(() => 'copilot version 1.0.0')
  };
});

const app = require('../../src/server');

describe('API Integration Tests', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('copilot_available');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /v1/models', () => {
    it('should return list of models', async () => {
      const response = await request(app).get('/v1/models');

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('list');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return models with correct format', async () => {
      const response = await request(app).get('/v1/models');

      const model = response.body.data[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('object', 'model');
      expect(model).toHaveProperty('owned_by');
    });
  });

  describe('GET /v1/models/:model', () => {
    it('should return specific model', async () => {
      const response = await request(app).get('/v1/models/gpt-5-mini');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('gpt-5-mini');
    });

    it('should return 404 for unknown model', async () => {
      const response = await request(app).get('/v1/models/unknown-model');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('model_not_found');
    });
  });

  describe('POST /v1/chat/completions', () => {
    it('should return valid completion response', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-5-mini',
          messages: [{ role: 'user', content: 'Hi' }]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.object).toBe('chat.completion');
      expect(response.body.choices).toHaveLength(1);
      expect(response.body.choices[0].message.role).toBe('assistant');
    });

    it('should use default model when not specified', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hi' }]
        });

      expect(response.status).toBe(200);
      expect(response.body.model).toBe('gpt-5-mini');
    });

    it('should return 404 for invalid model', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'invalid-model',
          messages: [{ role: 'user', content: 'Hi' }]
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('model_not_found');
    });

    it('should return 400 for missing messages', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-5-mini'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });

    it('should return 400 for invalid message role', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-5-mini',
          messages: [{ role: 'invalid', content: 'Hi' }]
        });

      expect(response.status).toBe(400);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown/endpoint');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('endpoint_not_found');
    });
  });
});
