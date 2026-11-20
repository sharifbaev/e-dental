import { Injectable, signal } from '@angular/core';

// Ключ в localStorage: показывать ли на мобилке карточки «Пациенты сегодня» и «Свободные слоты»
const STORAGE_KEY = 'e-dental.dashboard.showKpiMobile';

@Injectable({ providedIn: 'root' })
export class DashboardPrefsService {
  // По умолчанию карточки показываются
  readonly showKpiMobile = signal<boolean>(this.initialShowKpiMobile());

  setShowKpiMobile(value: boolean): void {
    this.showKpiMobile.set(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // localStorage недоступен — настройка просто не запомнится
    }
  }

  private initialShowKpiMobile(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  }
}
