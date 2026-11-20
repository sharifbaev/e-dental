import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

// Всё передаётся ключами переводов, чтобы окно работало на обоих языках
export interface ConfirmDialogData {
  titleKey: string;
  messageKey: string;
  messageParams?: Record<string, unknown>;
  confirmKey: string;
  cancelKey: string;
  danger?: boolean;            // красная кнопка подтверждения (для отмены, удаления)
}

export const CONFIRM_DIALOG_CONFIG: MatDialogConfig = {
  width: '400px',
  maxWidth: '95vw',
  autoFocus: false
};

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatIconModule, TranslocoPipe],
  templateUrl: './confirm-dialog.html'
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
