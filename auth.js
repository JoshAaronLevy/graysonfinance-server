import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const authInstance = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BASE_URL?.trim() || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:4200",
    process.env.FRONTEND_URL || "",
  ].filter(Boolean),
});

export const auth = {
  ...authInstance,
  handler: (req, res, next) => {
    console.log(`[DEBUG] Incoming AUTH Request: ${req.method} ${req.originalUrl}`);
    console.log(`[DEBUG] Payload: `, req.body);

    // Monkey-patch req to intercept URL building
    const originalUrlConstructor = URL;
    global.URL = function (...args) {
      console.log(`[DEBUG] new URL called with args:`, args);
      return new originalUrlConstructor(...args);
    };
    global.URL.prototype = originalUrlConstructor.prototype;

    return authInstance.handler(req, res, next);
  },
};

export default auth;
