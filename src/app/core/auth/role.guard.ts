import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/auth.model';
import { AuthService } from './auth.service';

// Раздел только для указанных ролей; остальных — на «Главное»
export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const role = inject(AuthService).user()?.role;
    return role && roles.includes(role) ? true : inject(Router).createUrlTree(['/dashboard']);
  };
}
