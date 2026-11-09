import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, tap } from 'rxjs';
import { ClinicSettings, DEFAULT_CLINIC_SETTINGS } from '../models/settings.model';

const STORAGE_KEY = 'e-dental.settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<ClinicSettings>(this.read());

  readonly settings = this._settings.asReadonly();

  // TODO: на API — PUT /settings. Пока сохраняем в браузере
  save(settings: ClinicSettings): Observable<ClinicSettings> {
    return of(settings).pipe(
      delay(300),
      tap(saved => {
        this._settings.set(saved);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        } catch {
          // localStorage недоступен — настройки действуют до перезагрузки
        }
      })
    );
  }

  private read(): ClinicSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<ClinicSettings>;
        return {
          ...DEFAULT_CLINIC_SETTINGS,
          ...saved,
          notifications: { ...DEFAULT_CLINIC_SETTINGS.notifications, ...saved.notifications }
        };
      }
    } catch {
      // повреждённые данные — берём значения по умолчанию
    }
    return DEFAULT_CLINIC_SETTINGS;
  }
}
