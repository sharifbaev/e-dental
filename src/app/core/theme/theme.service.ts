import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

// Тот же ключ используется в скрипте index.html
const STORAGE_KEY = 'e-dental.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    // Класс .dark на <html> всегда соответствует выбранной теме
    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.theme() === 'dark');
    });
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    // Запоминаем только явный выбор пользователя
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage недоступен (например, приватный режим) — тема просто не запомнится
    }
  }

  // Сохранённый выбор, а если его нет — тема системы
  private initialTheme(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // нет доступа к localStorage
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
