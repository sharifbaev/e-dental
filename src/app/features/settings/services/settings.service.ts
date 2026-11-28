import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ClinicSettings, DEFAULT_CLINIC_SETTINGS } from '../models/settings.model';
import { AuthService } from '../../../core/auth/auth.service';
import { api } from '../../../core/api/api';

// Ответ сервера: новые поля могут ещё не приходить (старая версия бэкенда)
type ClinicSettingsDto = Partial<Omit<ClinicSettings, 'notifications'>> & {
  notifications?: Partial<ClinicSettings['notifications']>;
};

// Настройки клиники (GET /settings — всем, PUT /settings — только владелец)
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _settings = signal<ClinicSettings>(DEFAULT_CLINIC_SETTINGS);

  readonly settings = this._settings.asReadonly();
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this._settings.set(DEFAULT_CLINIC_SETTINGS);
        this.loaded.set(false);
        if (userId) {
          this.http.get<ClinicSettingsDto>(api('/settings')).subscribe({
            next: settings => {
              this._settings.set(normalize(settings));
              this.loaded.set(true);
            },
            error: () => undefined
          });
        }
      });
    });
  }

  save(settings: ClinicSettings): Observable<ClinicSettings> {
    return this.http.put<ClinicSettingsDto>(api('/settings'), settings).pipe(
      map(saved => normalize(saved)),
      tap(saved => this._settings.set(saved))
    );
  }

  // Свой логотип: POST /settings/logo (multipart, поле file) → { logoUrl }
  uploadLogo(file: File): Observable<{ logoUrl: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ logoUrl: string }>(api('/settings/logo'), body).pipe(
      tap(({ logoUrl }) => this._settings.update(s => ({ ...s, logoUrl })))
    );
  }

  // Вернуть стандартный логотип: DELETE /settings/logo
  removeLogo(): Observable<void> {
    return this.http.delete<void>(api('/settings/logo')).pipe(
      tap(() => this._settings.update(s => ({ ...s, logoUrl: null })))
    );
  }
}

// Недостающие поля — по умолчанию; старые флаги sms24h/sms2h → список напоминаний
function normalize(dto: ClinicSettingsDto): ClinicSettings {
  const defaults = DEFAULT_CLINIC_SETTINGS.notifications;
  const n = dto.notifications ?? {};
  const legacyReminders = [
    ...(n.sms24h ? [{ value: 24, unit: 'hours' as const, text: '' }] : []),
    ...(n.sms2h ? [{ value: 2, unit: 'hours' as const, text: '' }] : [])
  ];
  return {
    ...DEFAULT_CLINIC_SETTINGS,
    ...dto,
    logoUrl: dto.logoUrl ?? null,
    notifications: {
      ...defaults,
      ...n,
      patientSms: n.patientSms ?? { enabled: legacyReminders.length > 0, reminders: legacyReminders },
      birthdaySms: { ...defaults.birthdaySms, ...n.birthdaySms }
    }
  };
}
