import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { MainLayout } from './layout/main-layout/main-layout';
import { AuthLayout } from './layout/auth-layout/auth-layout';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayout,
    canActivate: [guestGuard],
    children: [
      { path: '', loadComponent: () => import('./features/auth/login/login').then(m => m.Login) }
    ]
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'schedule', loadComponent: () => import('./features/schedule/schedule').then(m => m.Schedule) },
      { path: 'calendar', loadComponent: () => import('./features/schedule/calendar/calendar').then(m => m.ScheduleCalendar) },
      { path: 'patients', loadChildren: () => import('./features/patients/patients.routes').then(m => m.PATIENTS_ROUTES) },
      // «Врачи» и «Финансы» — только владелец и администратор
      { path: 'doctors', canActivate: [roleGuard(['admin', 'owner'])], loadComponent: () => import('./features/doctors/pages/doctor-list/doctor-list').then(m => m.DoctorList) },
      { path: 'finance', canActivate: [roleGuard(['admin', 'owner'])], loadComponent: () => import('./features/finance/finance').then(m => m.Finance) },
      // «Настройки» — всем; у врача дополнительно вкладка «Режим работы»
      { path: 'settings', loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES) }
    ]
  },
  { path: '**', redirectTo: '' }
];
