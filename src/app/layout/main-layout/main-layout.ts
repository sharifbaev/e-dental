import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { NOTIFICATIONS_DIALOG_CONFIG, NotificationsDialog } from '../../features/notifications/components/notifications-dialog/notifications-dialog';
import { NotificationsService } from '../../features/notifications/services/notifications.service';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, TranslocoPipe],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss'
})
export class MainLayout {
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notificationsService = inject(NotificationsService);

  protected readonly lang = signal(this.transloco.getActiveLang());

  protected readonly menu = [
    { path: '/dashboard', label: 'menu.dashboard', icon: 'dashboard' },
    { path: '/schedule', label: 'menu.schedule', icon: 'calendar_month' },
    { path: '/patients', label: 'menu.patients', icon: 'groups' },
    { path: '/doctors', label: 'menu.doctors', icon: 'stethoscope' },
    { path: '/settings', label: 'menu.settings', icon: 'settings' }
  ];

  // Текущий пользователь (из AuthService)
  protected readonly user = this.auth.user;

  protected readonly initials = computed(() => {
    const name = this.user()?.fullName ?? '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  });

  protected readonly roleKey = computed(() => `roles.${this.user()?.role ?? 'admin'}`);

  // TODO: заменить на данные с API
  // Число непрочитанных уведомлений — из общего сервиса, обновляется сразу при прочтении
  protected readonly notificationsCount = this.notificationsService.unreadCount;
  protected readonly waitingListCount = signal(3);

  protected setLang(lang: 'ru' | 'uz'): void {
    this.transloco.setActiveLang(lang);
    this.lang.set(lang);
  }

  protected logout(): void {
    this.auth.logout();
  }

  protected openNotifications(): void {
    this.dialog.open(NotificationsDialog, NOTIFICATIONS_DIALOG_CONFIG);
  }
}
