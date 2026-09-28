export type Theme = 'light' | 'dark';

export interface LocationState {
  lat: number;
  lng: number;
  label: string;
  pincode?: string;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  [key: string]: unknown;
}

export interface Membership {
  id?: string;
  business_id: string;
  role: string;
  business?: Business;
  [key: string]: unknown;
}

export interface Business {
  id: string;
  slug: string;
  name: string;
  category?: string;
  [key: string]: unknown;
}

export interface Queue {
  id: string;
  business_id?: string;
  name: string;
  [key: string]: unknown;
}

export interface QueueLive {
  queue_id: string;
  version: number;
  waiting: string[];
  now_serving: any;
  traffic?: 'GREEN' | 'YELLOW' | 'RED' | string;
  [key: string]: unknown;
}

export interface ApiResponse {
  [key: string]: unknown;
}

export interface AuthResponse {
  user: User | null;
  memberships: Membership[];
}

export interface LiveResponse {
  live: QueueLive[];
}