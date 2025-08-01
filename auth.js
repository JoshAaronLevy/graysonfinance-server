import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BASE_URL || "http://localhost:3000",
  trustedOrigins: [
    'http://localhost:4200',
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    process.env.FRONTEND_URL || "",
  ].filter(Boolean),
});

export default auth;