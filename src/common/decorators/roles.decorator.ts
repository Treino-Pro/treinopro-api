import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export type Role = 'admin' | 'finance_admin' | 'content_admin' | 'support';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
