import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
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
      { path: 'patients', loadChildren: () => import('./features/patients/patients.routes').then(m => m.PATIENTS_ROUTES) },
      { path: 'doctors', loadComponent: () => import('./features/doctors/pages/doctor-list/doctor-list').then(m => m.DoctorList) },
      { path: 'settings', loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES) }
    ]
  },
  { path: '**', redirectTo: '' }
];
