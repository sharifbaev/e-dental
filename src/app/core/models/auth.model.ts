export type UserRole = 'admin' | 'doctor' | 'receptionist';

export interface User {
  id: number;
  fullName: string;
  username: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
