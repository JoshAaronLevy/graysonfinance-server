import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BASE_URL?.trim() || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:4200",
    process.env.FRONTEND_URL || "",
  ].filter(Boolean),
});

export default auth;
