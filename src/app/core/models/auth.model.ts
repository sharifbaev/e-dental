export type UserRole = 'admin' | 'doctor' | 'receptionist';

export interface User {
  id: number;
  fullName: string;
  username: string;
  role: UserRole;
  doctorId?: number;           // для роли «Врач» — его id в расписании
  doctorName?: string;         // для роли «Врач» — 'Сидоров А. П.'
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
