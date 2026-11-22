import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ClinicSettings, DEFAULT_CLINIC_SETTINGS } from '../models/settings.model';
import { AuthService } from '../../../core/auth/auth.service';
import { api } from '../../../core/api/api';

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
          this.http.get<ClinicSettings>(api('/settings')).subscribe({
            next: settings => {
              this._settings.set({ ...DEFAULT_CLINIC_SETTINGS, ...settings, notifications: { ...DEFAULT_CLINIC_SETTINGS.notifications, ...settings.notifications } });
              this.loaded.set(true);
            },
            error: () => undefined
          });
        }
      });
    });
  }

  save(settings: ClinicSettings): Observable<ClinicSettings> {
    return this.http.put<ClinicSettings>(api('/settings'), settings).pipe(tap(saved => this._settings.set(saved)));
  }
}
