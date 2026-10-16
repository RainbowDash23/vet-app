export interface UserState {
  id: string;
  name: string;
  active: boolean;
}

export function useUserStatus(user: UserState): string {
  const status = user.active ? 'active' : 'inactive';
  return `User ${user.name} is currently ${status}`;
}
