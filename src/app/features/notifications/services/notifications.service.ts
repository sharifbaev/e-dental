import { Injectable, computed, inject, signal } from '@angular/core';
import { AppNotification } from '../models/notification.model';
import { ScheduleService, isStatusOverdue, toDateKey } from '../../schedule/services/schedule.service';
import { AuthService } from '../../../core/auth/auth.service';

// id уведомлений «Обновите статус» — отдельный диапазон, чтобы не пересекаться с обычными
const STATUS_OVERDUE_ID_OFFSET = 1_000_000_000_000;

// Конец приёма: 'YYYY-MM-DD' + 'HH:mm' → Date
function appointmentEnd(date: string, end: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = end.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

// Mock: время создания считаем от текущего момента
function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  // TODO: заменить на загрузку с API (и, позже, получение новых через WebSocket)
  private readonly _notifications = signal<AppNotification[]>([
    { id: 1, type: 'onlineBooking', createdAt: minutesAgo(3), read: false, patientName: 'Юлдашева Малика', doctorName: 'Каримова Д. Р.', time: '15:30' },
    { id: 2, type: 'noShow', createdAt: minutesAgo(12), read: false, patientName: 'Петров Сергей', doctorName: 'Сидоров А. П.', time: '14:00' },
    { id: 3, type: 'cancellation', createdAt: minutesAgo(40), read: false, patientName: 'Иванов Дмитрий', doctorName: 'Юсупов Б. Т.', time: '16:30' },
    { id: 4, type: 'waitingList', createdAt: minutesAgo(38), read: true, patientName: 'Хасанов Бекзод', doctorName: 'Юсупов Б. Т.', time: '16:30' },
    { id: 5, type: 'onlineBooking', createdAt: minutesAgo(125), read: true, patientName: 'Сергеева Анна', doctorName: 'Сидоров А. П.', time: '11:00' }
  ]);

  private readonly scheduleService = inject(ScheduleService);
  private readonly auth = inject(AuthService);

  // Текущее время — раз в минуту, чтобы уведомление появлялось сразу, как только время приёма прошло
  private readonly now = signal(new Date());

  // Прочитанные уведомления «Обновите статус» (сами уведомления считаются из расписания)
  private readonly readOverdueIds = signal<ReadonlySet<number>>(new Set());

  constructor() {
    // Сервис живёт всё время работы приложения — таймер не останавливаем
    setInterval(() => this.now.set(new Date()), 60_000);
  }

  // «Обновите статус»: приём прошёл, а статус всё ещё «Первичный».
  // Уведомление исчезает само, как только статус поменяли
  // TODO: на API — эти уведомления должен присылать сервер (и врачу тоже)
  private readonly statusOverdue = computed<AppNotification[]>(() => {
    const now = this.now();
    const todayKey = toDateKey(now);
    const readIds = this.readOverdueIds();

    return this.scheduleService.appointments()
      .filter(appointment => isStatusOverdue(appointment, now))
      .map(appointment => {
        const id = STATUS_OVERDUE_ID_OFFSET + appointment.id;
        const [, month, day] = appointment.date.split('-');
        return {
          id,
          type: 'statusOverdue' as const,
          createdAt: appointmentEnd(appointment.date, appointment.end),
          read: readIds.has(id),
          patientName: appointment.patientName,
          doctorName: appointment.doctorName,
          time: appointment.date === todayKey ? appointment.start : `${day}.${month} ${appointment.start}`,
          appointmentId: appointment.id
        };
      });
  });

  // Врач видит только уведомления по своим приёмам
  private readonly all = computed(() => {
    const user = this.auth.user();
    const list = [...this._notifications(), ...this.statusOverdue()];
    return user?.role === 'doctor' ? list.filter(n => n.doctorName === user.doctorName) : list;
  });

  // Новые сверху
  readonly notifications = computed(() =>
    [...this.all()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  );

  readonly unreadCount = computed(() => this.all().filter(n => !n.read).length);

  markAsRead(id: number): void {
    if (id >= STATUS_OVERDUE_ID_OFFSET) {
      this.readOverdueIds.update(ids => new Set(ids).add(id));
      return;
    }
    this._notifications.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }

  markAllAsRead(): void {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
    this.readOverdueIds.set(new Set(this.statusOverdue().map(n => n.id)));
  }
}
