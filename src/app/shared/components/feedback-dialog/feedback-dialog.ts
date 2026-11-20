import { Component, DestroyRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

export interface FeedbackDialogData {
  type: 'success' | 'error';
  titleKey: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
}

// Через сколько окно успеха закрывается само
const SUCCESS_AUTO_CLOSE_MS = 2500;

@Component({
  selector: 'app-feedback-dialog',
  imports: [MatDialogModule, MatIconModule, TranslocoPipe],
  templateUrl: './feedback-dialog.html'
})
export class FeedbackDialog {
  protected readonly data = inject<FeedbackDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<FeedbackDialog>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isSuccess = this.data.type === 'success';

  constructor() {
    // Успех закрываем сами, ошибку — только по кнопке
    if (this.isSuccess) {
      const timer = setTimeout(() => this.dialogRef.close(), SUCCESS_AUTO_CLOSE_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    }
  }
}
