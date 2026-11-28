import { HttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ScheduleService } from '../../schedule/services/schedule.service';
import { api } from '../../../core/api/api';
import { DEFAULT_STATUS_REMINDERS, StatusReminder, UiScale } from '../../settings/models/settings.model';

type StatusReminders = { primary: StatusReminder; awaitingDecision: StatusReminder };

// Личные настройки пользователя (GET/PUT /me/preferences)
interface UserPreferences {
  language: 'ru' | 'uz';
  theme: 'light' | 'dark' | 'system';
  showOtherDoctors: boolean;
  showKpiMobile: boolean;
  hiddenMenu: string[];          // скрытые пункты меню: ['/finance', …]
  startPage: string;             // раздел после входа: '/dashboard', '/schedule', …
  uiScale: UiScale;              // масштаб интерфейса
  statusReminders: StatusReminders;
}

// Масштаб интерфейса → zoom для <html>
const UI_ZOOM: Record<UiScale, string> = { compact: '0.9', normal: '', large: '1.1' };

// Меню, стартовая страница и масштаб — ещё и в браузере, чтобы после перезагрузки
// не мигали до ответа сервера
const LOCAL_KEY = 'e-dental.ui-prefs';
type LocalPrefs = Pick<UserPreferences, 'hiddenMenu' | 'startPage' | 'uiScale'>;

function readLocal(): Partial<LocalPrefs> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Partial<LocalPrefs>;
  } catch {
    return {};
  }
}

// Личные настройки: карточки на главной (мобилка), «Показывать других врачей» (врач),
// меню, стартовая страница, масштаб и напоминания врачу о статусах.
// Хранятся на сервере — одинаковые на телефоне и компьютере
@Injectable({ providedIn: 'root' })
export class DashboardPrefsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly theme = inject(ThemeService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly document = inject(DOCUMENT);

  private readonly local = readLocal();

  // По умолчанию карточки показываются
  readonly showKpiMobile = signal<boolean>(true);

  // Врач: показывать других врачей (фильтр по врачам на главной, в записях и календаре). По умолчанию — нет
  readonly showOtherDoctors = signal<boolean>(false);

  // Скрытые пункты меню (пути). «Настройки» скрыть нельзя
  readonly hiddenMenu = signal<string[]>(this.local.hiddenMenu ?? []);

  // Раздел, который открывается после входа
  readonly startPage = signal<string>(this.local.startPage ?? '/dashboard');

  // Масштаб интерфейса
  readonly uiScale = signal<UiScale>(this.local.uiScale ?? 'normal');

  // Врач: напомнить обновить статус приёма («Первичный» и «Ожидает решения»)
  readonly statusReminders = signal<StatusReminders>(DEFAULT_STATUS_REMINDERS);

  // Настройки уже пришли с сервера (или запрос завершился ошибкой) — до этого не мигаем карточками
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this.showKpiMobile.set(true);
        this.showOtherDoctors.set(false);
        this.loaded.set(false);
        if (!userId) return;
        this.http.get<Partial<UserPreferences>>(api('/me/preferences')).subscribe({
          next: prefs => {
            this.apply(prefs);
            this.loaded.set(true);
          },
          error: () => this.loaded.set(true)
        });
      });
    });

    // Масштаб применяется ко всему приложению сразу
    effect(() => {
      this.document.documentElement.style.zoom = UI_ZOOM[this.uiScale()];
    });

    // Копия в браузере — для мгновенного применения после перезагрузки
    effect(() => {
      const value: LocalPrefs = { hiddenMenu: this.hiddenMenu(), startPage: this.startPage(), uiScale: this.uiScale() };
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
      } catch {
        // localStorage недоступен — настройки придут с сервера
      }
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

  // Показать / скрыть пункт меню
  setMenuVisible(path: string, visible: boolean): void {
    this.hiddenMenu.update(list => (visible ? list.filter(p => p !== path) : [...new Set([...list, path])]));
    // Скрытый раздел не может быть стартовым
    if (!visible && this.startPage() === path) this.startPage.set('/dashboard');
    this.save();
  }

  setStartPage(path: string): void {
    this.startPage.set(path);
    this.save();
  }

  setUiScale(scale: UiScale): void {
    this.uiScale.set(scale);
    this.save();
  }

  setStatusReminder(key: keyof StatusReminders, patch: Partial<StatusReminder>): void {
    this.statusReminders.update(all => ({ ...all, [key]: { ...all[key], ...patch } }));
    this.save();
  }

  private apply(prefs: Partial<UserPreferences>): void {
    this.showKpiMobile.set(prefs.showKpiMobile ?? true);
    this.showOtherDoctors.set(prefs.showOtherDoctors ?? false);
    if (prefs.hiddenMenu) this.hiddenMenu.set(prefs.hiddenMenu);
    if (prefs.startPage) this.startPage.set(prefs.startPage);
    if (prefs.uiScale) this.uiScale.set(prefs.uiScale);
    if (prefs.statusReminders) {
      this.statusReminders.set({
        primary: { ...DEFAULT_STATUS_REMINDERS.primary, ...prefs.statusReminders.primary },
        awaitingDecision: { ...DEFAULT_STATUS_REMINDERS.awaitingDecision, ...prefs.statusReminders.awaitingDecision }
      });
    }
  }

  // Номер последнего сохранения: ответ на более раннее не перетирает новые изменения
  private saveSeq = 0;

  private save(done?: () => void): void {
    const seq = ++this.saveSeq;
    const lang = this.transloco.getActiveLang();
    const body: UserPreferences = {
      language: lang === 'uz' ? 'uz' : 'ru',
      theme: this.theme.isSystem() ? 'system' : this.theme.theme(),
      showOtherDoctors: this.showOtherDoctors(),
      showKpiMobile: this.showKpiMobile(),
      hiddenMenu: this.hiddenMenu(),
      startPage: this.startPage(),
      uiScale: this.uiScale(),
      statusReminders: this.statusReminders()
    };
    // Сервер исправляет неверные значения (например, скрытую стартовую страницу) — показываем сохранённое им
    this.http.put<Partial<UserPreferences>>(api('/me/preferences'), body).subscribe({
      next: saved => {
        if (seq === this.saveSeq && saved && typeof saved === 'object') this.apply(saved);
        done?.();
      },
      error: () => undefined
    });
  }
}
