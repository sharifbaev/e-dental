import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { NotificationsService } from '../../features/notifications/services/notifications.service';
import { ThemeService } from '../../core/theme/theme.service';

// Свёрнутая боковая панель (только иконки) — запоминаем в браузере
const SIDEBAR_KEY = 'e-dental.sidebar-collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    // localStorage недоступен (например, приватный режим) — панель развёрнута
    return false;
  }
}

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, TranslocoPipe],
  templateUrl: './main-layout.html'
})
export class MainLayout {
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  protected readonly isDark = computed(() => this.themeService.theme() === 'dark');
  private readonly dialog = inject(MatDialog);
  private readonly notificationsService = inject(NotificationsService);

  protected readonly lang = signal(this.transloco.getActiveLang());

  private readonly allMenu = [
    { path: '/dashboard', label: 'menu.dashboard', icon: 'dashboard', staffOnly: false },
    { path: '/schedule', label: 'menu.schedule', icon: 'calendar_month', staffOnly: false },
    { path: '/calendar', label: 'menu.calendar', icon: 'calendar_view_day', staffOnly: false },
    { path: '/patients', label: 'menu.patients', icon: 'groups', staffOnly: false },
    { path: '/doctors', label: 'menu.doctors', icon: 'stethoscope', staffOnly: true },
    { path: '/finance', label: 'menu.finance', icon: 'account_balance_wallet', staffOnly: true },
    { path: '/settings', label: 'menu.settings', icon: 'settings', staffOnly: false }
  ];

  // Текущий пользователь (из AuthService)
  protected readonly user = this.auth.user;

  // Врачу «Врачи» и «Финансы» не показываем (и не пускаем — см. roleGuard)
  protected readonly menu = computed(() =>
    this.allMenu.filter(item => !item.staffOnly || this.user()?.role !== 'doctor')
  );

  protected readonly initials = computed(() => {
    const name = this.user()?.fullName ?? '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  });

  protected readonly roleKey = computed(() => `roles.${this.user()?.role ?? 'owner'}`);

  // Число непрочитанных уведомлений — из общего сервиса, обновляется сразу при прочтении
  protected readonly notificationsCount = this.notificationsService.unreadCount;
  protected setLang(lang: 'ru' | 'uz'): void {
    this.transloco.setActiveLang(lang);
    this.lang.set(lang);
  }

  // ---- Боковая панель: развёрнута / только иконки (ПК) ----

  protected readonly sidebarCollapsed = signal(readSidebarCollapsed());

  protected toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
    } catch {
      // localStorage недоступен — состояние просто не запомнится
    }
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected logout(): void {
    this.auth.logout();
  }

  protected openNotifications(): void {
    // Окно уведомлений грузится при первом открытии — не входит в стартовый бандл
    import('../../features/notifications/components/notifications-dialog/notifications-dialog')
      .then(m => this.dialog.open(m.NotificationsDialog, m.NOTIFICATIONS_DIALOG_CONFIG));
  }
}
