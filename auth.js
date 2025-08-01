import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { requireAuth } from './middleware/auth.js';

const router = express.Router();
// Remove surrounding quotes from DATABASE_URL if present
const dbUrl = process.env.DATABASE_URL?.replace(/^'|'$/g, '') || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Check if user already exists
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, email, name",
      [name, email, hashedPassword]
    );
    const user = result.rows[0];

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    await pool.query(
      "INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, NOW() + interval '7 days')",
      [token, user.id]
    );

    res.cookie("session_token", token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.status(201).json({ user });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to sign up" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    await pool.query(
      "INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, NOW() + interval '7 days')",
      [token, user.id]
    );

    res.cookie("session_token", token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.status(200).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies.session_token;
    if (token) {
      await pool.query("DELETE FROM sessions WHERE session_token = $1", [token]);
      res.clearCookie("session_token");
    }
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

// GET /api/auth/me (Protected)
router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [req.user.id]);
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user data" });
  }
});

export default router;
