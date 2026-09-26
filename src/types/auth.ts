export interface User {
  id: string;
  email: string;
  full_name: string;
  auth_provider: string;
  is_verified: boolean;
  tier: "free" | "pro" | "enterprise";
  credits: number;
  created_at: string;
  updated_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

export interface LoginRequest {
  email: string;
  password: string;
}
