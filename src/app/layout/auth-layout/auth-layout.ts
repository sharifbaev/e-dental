import { Component, DestroyRef, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

const MOBILE_QUERY = '(max-width: 767px)';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss'
})
export class AuthLayout {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('bgVideo');

  protected readonly isMobile = toSignal(
    this.breakpoints.observe(MOBILE_QUERY).pipe(map(result => result.matches)),
    { initialValue: this.breakpoints.isMatched(MOBILE_QUERY) }
  );

  protected readonly posterSrc = computed(() =>
    this.isMobile() ? 'videos/dental-mobile.jpg' : 'videos/dental-pc.jpg'
  );

  constructor() {
    // Срабатывает при появлении видео и при смене мобильное ↔ ПК (элемент пересоздаётся)
    effect(() => {
      if (this.video()) {
        this.tryPlay();
      }
    });

    // Запасной вариант: если браузер запретил автозапуск — запускаем при первом касании/клике
    const onInteraction = () => this.tryPlay();
    // iOS ставит видео на паузу при сворачивании — продолжаем при возврате во вкладку
    const onVisibility = () => {
      if (this.document.visibilityState === 'visible') {
        this.tryPlay();
      }
    };

    this.document.addEventListener('touchstart', onInteraction, { passive: true });
    this.document.addEventListener('click', onInteraction);
    this.document.addEventListener('visibilitychange', onVisibility);

    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('touchstart', onInteraction);
      this.document.removeEventListener('click', onInteraction);
      this.document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  private tryPlay(): void {
    const el = this.video()?.nativeElement;
    if (!el || !el.paused) {
      return;
    }
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.play().catch(() => {
      // Автозапуск заблокирован браузером — видео запустится при первом касании экрана
    });
  }
}
