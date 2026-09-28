import { Injectable, computed, signal } from '@angular/core';
import { AppNotification } from '../models/notification.model';

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

  // Новые сверху
  readonly notifications = computed(() =>
    [...this._notifications()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  );

  readonly unreadCount = computed(() => this._notifications().filter(n => !n.read).length);

  markAsRead(id: number): void {
    this._notifications.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }

  markAllAsRead(): void {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
  }
}
