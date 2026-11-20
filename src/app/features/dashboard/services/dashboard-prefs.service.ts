import { Injectable, signal } from '@angular/core';

// Ключ в localStorage: показывать ли на мобилке карточки «Пациенты сегодня» и «Свободные слоты»
const STORAGE_KEY = 'e-dental.dashboard.showKpiMobile';

// Ключ в localStorage: показывать ли врачу других врачей (фильтр «Все врачи»)
const OTHER_DOCTORS_KEY = 'e-dental.showOtherDoctors';

@Injectable({ providedIn: 'root' })
export class DashboardPrefsService {
  // По умолчанию карточки показываются
  readonly showKpiMobile = signal<boolean>(this.initialShowKpiMobile());

  // Врач: показывать других врачей (фильтр по врачам на главной, в записях и календаре). По умолчанию — нет
  readonly showOtherDoctors = signal<boolean>(this.initialShowOtherDoctors());

  setShowOtherDoctors(value: boolean): void {
    this.showOtherDoctors.set(value);
    try {
      localStorage.setItem(OTHER_DOCTORS_KEY, String(value));
    } catch {
      // localStorage недоступен — настройка просто не запомнится
    }
  }

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

  private initialShowOtherDoctors(): boolean {
    try {
      return localStorage.getItem(OTHER_DOCTORS_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
