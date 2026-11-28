import { Component, DestroyRef, Injector, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationType } from '../../models/notification.model';
import { NotificationsService } from '../../services/notifications.service';
import { ScheduleService } from '../../../schedule/services/schedule.service';

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
  noShow: { icon: 'person_off', classes: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300' },
  statusOverdue: { icon: 'published_with_changes', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  pendingDecision: { icon: 'hourglass_top', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  newAppointment: { icon: 'event_available', classes: 'bg-brand-50 text-brand-700 dark:text-brand-300' }
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
  private readonly dialogRef = inject(MatDialogRef<NotificationsDialog>);
  private readonly router = inject(Router);
  private readonly scheduleService = inject(ScheduleService);
  private readonly injector = inject(Injector);
  private readonly dialog = inject(MatDialog);

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
          // «Ожидают решения»: теперь на каждый приём своё уведомление; старые общие (с count) — прежним текстом
          textKey: n.type === 'pendingDecision' && !n.appointmentId ? 'notifications.types.pendingDecision.textGroup' : `notifications.types.${n.type}.text`,
          textParams: { patient: n.patientName, doctor: n.doctorName, time: n.time, count: n.count ?? 0 },
          agoKey: minutes < 1 ? 'notifications.ago.justNow' : hours < 1 ? 'notifications.ago.minutes' : 'notifications.ago.hours',
          agoParams: { count: hours < 1 ? minutes : hours }
        };
      });
  });

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected open(id: number): void {
    this.notificationsService.markAsRead(id);

    // «Обновите статус» — переходим в расписание и сразу открываем окно смены статуса
    const notification = this.notificationsService.notifications().find(n => n.id === id);

    // «Ожидает решения» по одному приёму — сразу окно смены статуса этого приёма
    if (notification?.type === 'pendingDecision' && notification.appointmentId) {
      this.dialogRef.close();
      this.scheduleService.get(notification.appointmentId).subscribe({
        next: appointment => {
          if (appointment.status !== 'awaitingDecision') return;
          this.router.navigateByUrl('/schedule')
            .then(() => import('../../../schedule/services/status-change.service'))
            .then(m => this.injector.get(m.StatusChangeService).open(appointment));
        },
        error: () => undefined
      });
      return;
    }

    // Старое общее «Ожидают решения» — список пациентов врача, у каждого кнопка «Изменить статус»
    if (notification?.type === 'pendingDecision' && notification.doctorId) {
      const doctorId = notification.doctorId;
      this.dialogRef.close();
      import('../pending-decision-dialog/pending-decision-dialog')
        .then(m => this.dialog.open(m.PendingDecisionDialog, { ...m.PENDING_DECISION_DIALOG_CONFIG, data: { doctorId } }));
      return;
    }

    if (notification?.type !== 'statusOverdue' || !notification.appointmentId) return;

    this.dialogRef.close();
    // Приём — из расписания или с API; окно смены статуса (с планом лечения и формами) грузится только по нажатию
    this.scheduleService.get(notification.appointmentId).subscribe({
      next: appointment => {
        if (appointment.status !== 'primary') return;
        this.router.navigateByUrl('/schedule')
          .then(() => import('../../../schedule/services/status-change.service'))
          .then(m => this.injector.get(m.StatusChangeService).open(appointment));
      },
      error: () => undefined
    });
  }

  protected markAllAsRead(): void {
    this.notificationsService.markAllAsRead();
  }
}
