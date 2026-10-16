export interface IAuthProvider {
  id: string;
  name: string;
  type: string;
  preset?: string | null;
}
