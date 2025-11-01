import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';

describe('RolesGuard', () => {
  it('permite acesso quando não há roles exigidas', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: {} }) }),
    };

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined as any);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('nega acesso quando usuário não tem role necessária', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userType: 'student' } }),
      }),
    };

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin'] as any);
    expect(() => guard.canActivate(context as any)).toThrow();
  });

  it('permite acesso quando userType inclui a role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userType: 'admin' } }),
      }),
    };

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin'] as any);
    expect(guard.canActivate(context as any)).toBe(true);
  });
});
