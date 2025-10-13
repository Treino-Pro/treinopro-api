import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('deve retornar status de saúde da API', () => {
      // Act
      const result = controller.check();

      // Assert
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
      expect(result.status).toBe('ok');
      expect(result.version).toBe('1.0.0');
      expect(typeof result.timestamp).toBe('string');
    });

    it('deve retornar timestamp atual', () => {
      // Arrange
      const beforeCall = new Date();

      // Act
      const result = controller.check();

      // Assert
      const afterCall = new Date();
      expect(typeof result.timestamp).toBe('string');
      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });
});
