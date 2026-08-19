export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  stock: number; 
  minStock: number;
  createdAt: Date;
  updatedAt: Date;
}