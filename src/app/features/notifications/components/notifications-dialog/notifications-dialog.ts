import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogConfig, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationType } from '../../models/notification.model';
import { NotificationsService } from '../../services/notifications.service';

// Настройки модалки: на ПК окно, на мобилке — на весь экран (см. styles.scss)
export const NOTIFICATIONS_DIALOG_CONFIG: MatDialogConfig = {
  width: '480px',
  maxWidth: '100vw',
  height: '85vh',
  maxHeight: '100dvh',
  autoFocus: false,
  panelClass: 'notifications-dialog'
};

// Иконка и цвета по типу уведомления
const TYPE_VIEW: Record<NotificationType, { icon: string; classes: string }> = {
  onlineBooking: { icon: 'event_upcoming', classes: 'bg-brand-50 text-brand-700 dark:text-brand-300' },
  cancellation: { icon: 'event_busy', classes: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  waitingList: { icon: 'hourglass_top', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  noShow: { icon: 'person_off', classes: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300' }
};

type Tab = 'all' | 'unread';

@Component({
  selector: 'app-notifications-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './notifications-dialog.html',
  // Компонент на всю высоту окна: шапка и вкладки сверху, список занимает остальное
  host: { class: 'flex flex-col h-full' }
})
export class NotificationsDialog {
  private readonly notificationsService = inject(NotificationsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly unreadCount = this.notificationsService.unreadCount;

  protected readonly tab = signal<Tab>('all');

  // Текущее время — обновляется раз в минуту, чтобы «N мин назад» пересчитывалось
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  // Уведомления для списка: фильтр по вкладке, иконка, цвета и «N назад» — всё считаем заранее
  protected readonly items = computed(() => {
    const now = this.now();
    const onlyUnread = this.tab() === 'unread';

    return this.notificationsService.notifications()
      .filter(n => !onlyUnread || !n.read)
      .map(n => {
        const minutes = Math.max(0, Math.floor((now - n.createdAt.getTime()) / 60_000));
        const hours = Math.floor(minutes / 60);

        return {
          ...n,
          icon: TYPE_VIEW[n.type].icon,
          iconClasses: TYPE_VIEW[n.type].classes,
          titleKey: `notifications.types.${n.type}.title`,
          textKey: `notifications.types.${n.type}.text`,
          textParams: { patient: n.patientName, doctor: n.doctorName, time: n.time },
          agoKey: minutes < 1 ? 'notifications.ago.justNow' : hours < 1 ? 'notifications.ago.minutes' : 'notifications.ago.hours',
          agoParams: { count: hours < 1 ? minutes : hours }
        };
      });
  });

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected open(id: number): void {
    // TODO: когда будет раздел «Расписание» — переход к приёму
    this.notificationsService.markAsRead(id);
  }

  protected markAllAsRead(): void {
    this.notificationsService.markAllAsRead();
  }
}
