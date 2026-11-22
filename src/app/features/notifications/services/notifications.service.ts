import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppNotification } from '../models/notification.model';
import { AuthService } from '../../../core/auth/auth.service';
import { Page, api, params } from '../../../core/api/api';

// Ответ сервера: дата создания — строкой ISO 8601
type NotificationDto = Omit<AppNotification, 'createdAt'> & { createdAt: string };
interface NotificationPage extends Page<NotificationDto> {
  unreadCount: number;
}

// Сколько последних уведомлений показываем в окне
const LIST_SIZE = 50;

// Как часто проверять новые уведомления (WebSocket на сервере пока нет)
const POLL_MS = 60_000;

// Уведомления (GET /notifications). Создаёт их сервер: отмены, неявки, «Обновите статус»,
// «Ожидают решения», новые записи. Врач получает только по своим приёмам
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _notifications = signal<AppNotification[]>([]);
  private readonly _unreadCount = signal(0);

  // Новые сверху
  readonly notifications = computed(() =>
    [...this._notifications()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  );

  readonly unreadCount = this._unreadCount.asReadonly();

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this._notifications.set([]);
        this._unreadCount.set(0);
        if (userId) this.reload();
      });
    });
    // Сервис живёт всё время работы приложения — таймер не останавливаем
    setInterval(() => this.reload(), POLL_MS);
  }

  reload(): void {
    if (!this.auth.isAuthenticated()) return;
    this.http.get<NotificationPage>(api('/notifications'), { params: params({ page: 1, size: LIST_SIZE }) }).subscribe({
      next: page => {
        this._notifications.set(page.items.map(n => ({ ...n, createdAt: new Date(n.createdAt) })));
        this._unreadCount.set(page.unreadCount);
      },
      error: () => undefined
    });
  }

  // Сразу на экране, затем на сервере
  markAsRead(id: number): void {
    const target = this._notifications().find(n => n.id === id);
    if (!target || target.read) return;
    this._notifications.update(list => list.map(n => (n.id === id ? { ...n, read: true } : n)));
    this._unreadCount.update(count => Math.max(0, count - 1));
    this.http.post<void>(api(`/notifications/${id}/read`), {}).subscribe({ error: () => this.reload() });
  }

  markAllAsRead(): void {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
    this._unreadCount.set(0);
    this.http.post<void>(api('/notifications/read-all'), {}).subscribe({ error: () => this.reload() });
  }
}
