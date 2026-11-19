import { Injectable, computed, inject, signal } from '@angular/core';
import { AppNotification } from '../models/notification.model';
import { ScheduleService, isStatusOverdue, toDateKey } from '../../schedule/services/schedule.service';
import { AuthService } from '../../../core/auth/auth.service';
import { DoctorsService } from '../../doctors/services/doctors.service';
import { PENDING_DECISION_BEFORE_END_MINUTES, STATUS_OVERDUE_AFTER_MINUTES } from '../../../shared/models/patient-status';

// id уведомлений «Обновите статус» — отдельный диапазон, чтобы не пересекаться с обычными
const STATUS_OVERDUE_ID_OFFSET = 1_000_000_000_000;

// id уведомлений «Ожидают решения»: диапазон + дата (YYYYMMDD) × 1000 + id врача — своё на каждый день
const PENDING_DECISION_ID_OFFSET = 2_000_000_000_000;

// Конец смены, если врач не найден в справочнике
const DEFAULT_WORK_END = '18:00';

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
  private readonly doctorsService = inject(DoctorsService);

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
          createdAt: new Date(appointmentEnd(appointment.date, appointment.end).getTime() + STATUS_OVERDUE_AFTER_MINUTES * 60_000),
          read: readIds.has(id),
          patientName: appointment.patientName,
          doctorName: appointment.doctorName,
          time: appointment.date === todayKey ? appointment.start : `${day}.${month} ${appointment.start}`,
          appointmentId: appointment.id
        };
      });
  });

  // «Ожидают решения»: за 30 мин до конца смены у врача остались сегодняшние пациенты «Ожидает решения».
  // Одно уведомление на врача; исчезает само, когда всем поменяли статус
  // TODO: на API — эти уведомления должен присылать сервер (задача по расписанию)
  private readonly pendingDecision = computed<AppNotification[]>(() => {
    const now = this.now();
    const todayKey = toDateKey(now);
    const readIds = this.readOverdueIds();
    const doctors = this.doctorsService.doctors();

    const byDoctor = new Map<number, { doctorName: string; count: number }>();
    for (const appointment of this.scheduleService.appointments()) {
      if (appointment.date !== todayKey || appointment.status !== 'awaitingDecision') continue;
      const item = byDoctor.get(appointment.doctorId) ?? { doctorName: appointment.doctorName, count: 0 };
      item.count++;
      byDoctor.set(appointment.doctorId, item);
    }

    return [...byDoctor].flatMap(([doctorId, { doctorName, count }]) => {
      const workEnd = doctors.find(d => d.id === doctorId)?.workEnd ?? DEFAULT_WORK_END;
      const remindAt = new Date(appointmentEnd(todayKey, workEnd).getTime() - PENDING_DECISION_BEFORE_END_MINUTES * 60_000);
      if (remindAt.getTime() > now.getTime()) return [];

      const id = PENDING_DECISION_ID_OFFSET + Number(todayKey.replaceAll('-', '')) * 1000 + doctorId;
      return [{
        id,
        type: 'pendingDecision' as const,
        createdAt: remindAt,
        read: readIds.has(id),
        patientName: '',
        doctorName,
        time: workEnd,
        doctorId,
        count
      }];
    });
  });

  // Врач видит только уведомления по своим приёмам
  private readonly all = computed(() => {
    const user = this.auth.user();
    const list = [...this._notifications(), ...this.statusOverdue(), ...this.pendingDecision()];
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
    this.readOverdueIds.set(new Set([...this.statusOverdue(), ...this.pendingDecision()].map(n => n.id)));
  }
}
