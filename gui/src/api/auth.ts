import { apiRequest } from "./client";
import { LoginResponse } from "./types";

/**
 * POST /login
 */
export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (!response.data) {
    throw new Error("Login failed: No data returned");
  }

  return response.data;
}
