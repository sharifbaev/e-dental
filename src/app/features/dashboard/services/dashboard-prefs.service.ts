import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ScheduleService } from '../../schedule/services/schedule.service';
import { api } from '../../../core/api/api';

// Личные настройки пользователя (GET/PUT /me/preferences)
interface UserPreferences {
  language: 'ru' | 'uz';
  theme: 'light' | 'dark' | 'system';
  showOtherDoctors: boolean;
  showKpiMobile: boolean;
}

// Личные настройки: карточки на главной (мобилка) и «Показывать других врачей» (врач).
// Хранятся на сервере — одинаковые на телефоне и компьютере
@Injectable({ providedIn: 'root' })
export class DashboardPrefsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly theme = inject(ThemeService);
  private readonly scheduleService = inject(ScheduleService);

  // По умолчанию карточки показываются
  readonly showKpiMobile = signal<boolean>(true);

  // Врач: показывать других врачей (фильтр по врачам на главной, в записях и календаре). По умолчанию — нет
  readonly showOtherDoctors = signal<boolean>(false);

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this.showKpiMobile.set(true);
        this.showOtherDoctors.set(false);
        if (!userId) return;
        this.http.get<UserPreferences>(api('/me/preferences')).subscribe({
          next: prefs => {
            this.showKpiMobile.set(prefs.showKpiMobile);
            this.showOtherDoctors.set(prefs.showOtherDoctors);
          },
          error: () => undefined
        });
      });
    });
  }

  setShowOtherDoctors(value: boolean): void {
    this.showOtherDoctors.set(value);
    // Чужие приёмы врачу отдаёт сервер по этой настройке — после сохранения перезагружаем расписание
    this.save(() => this.scheduleService.reload());
  }

  setShowKpiMobile(value: boolean): void {
    this.showKpiMobile.set(value);
    this.save();
  }

  private save(done?: () => void): void {
    const lang = this.transloco.getActiveLang();
    const body: UserPreferences = {
      language: lang === 'uz' ? 'uz' : 'ru',
      theme: this.theme.isSystem() ? 'system' : this.theme.theme(),
      showOtherDoctors: this.showOtherDoctors(),
      showKpiMobile: this.showKpiMobile()
    };
    this.http.put<UserPreferences>(api('/me/preferences'), body).subscribe({ next: () => done?.(), error: () => undefined });
  }
}
