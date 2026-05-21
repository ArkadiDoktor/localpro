import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { queryOne, pool } from "@/lib/db";
import { signToken } from "@/lib/auth";
import stripe from "stripe";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(["client", "provider"]).default("client"),
});

// POST /api/auth/login
export async function POST(req: NextRequest) {
  const url = req.nextUrl.pathname;

  if (url.endsWith("/register")) {
    return handleRegister(req);
  }
  return handleLogin(req);
}

async function handleLogin(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await queryOne<{
      id: string;
      email: string;
      name: string;
      role: string;
      password_hash: string;
    }>(
      `SELECT id, email, name, role, password_hash FROM users WHERE email = $1`,
      [email]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "client" | "provider" | "admin",
    });

    const response = NextResponse.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });

    // Also set HTTP-only cookie for SSR
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: "Login failed" }, { status: 500 });
  }
}

async function handleRegister(req: NextRequest) {
  try {
    const body = await req.json();
    const input = registerSchema.parse(body);

    // Check if email already in use
    const existing = await queryOne(
      `SELECT id FROM users WHERE email = $1`,
      [input.email]
    );
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    // Create Stripe customer for billing
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-04-10",
    });
    const stripeCustomer = await stripeClient.customers.create({
      email: input.email,
      name: input.name,
      metadata: { platform: "localpro" },
    });

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, stripe_customer_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role`,
      [input.email, passwordHash, input.name, input.role, stripeCustomer.id]
    );

    const user = result.rows[0];
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        success: true,
        data: {
          token,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        },
      },
      { status: 201 }
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: err.errors },
        { status: 400 }
      );
    }
    console.error("[register]", err);
    return NextResponse.json({ success: false, error: "Registration failed" }, { status: 500 });
  }
}
