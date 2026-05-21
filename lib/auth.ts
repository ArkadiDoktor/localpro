import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { queryOne } from "./db";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = "7d";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "client" | "provider" | "admin";
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// ----------------------------------------------------------------
// Sign a JWT for a user
// ----------------------------------------------------------------
export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// ----------------------------------------------------------------
// Verify and decode a JWT
// ----------------------------------------------------------------
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------
// Extract authenticated user from request (Bearer token)
// ----------------------------------------------------------------
export async function getAuthUser(
  req: NextRequest
): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies.get("token")?.value;

  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  // Optionally re-fetch from DB to ensure user still exists / role is current
  const user = await queryOne<{
    id: string;
    email: string;
    name: string;
    role: string;
  }>(
    `SELECT id, email, name, role FROM users WHERE id = $1`,
    [payload.sub]
  );

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as AuthUser["role"],
  };
}
