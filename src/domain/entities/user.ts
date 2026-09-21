export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}