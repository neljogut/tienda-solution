export interface Category {
  id: string;
  name: string;
  parentId: string | null; // null = root category
  order: number;
  createdAt: string;
}
