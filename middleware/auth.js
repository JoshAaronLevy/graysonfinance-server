import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

// Remove surrounding quotes from DATABASE_URL if present
const dbUrl = process.env.DATABASE_URL?.replace(/^'|'$/g, '') || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });

export const requireAuth = async (req, res, next) => {
  const token = req.cookies.session_token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify session exists in database
    const sessionResult = await pool.query(
      "SELECT * FROM sessions WHERE session_token = $1 AND expires > NOW()",
      [token]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: "Session expired" });
    }

    // Get user data
    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export const optionalAuth = async (req, res, next) => {
  const token = req.cookies.session_token;
  
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify session exists in database
    const sessionResult = await pool.query(
      "SELECT * FROM sessions WHERE session_token = $1 AND expires > NOW()",
      [token]
    );
    
    if (sessionResult.rows.length > 0) {
      // Get user data
      const userResult = await pool.query(
        "SELECT id, name, email FROM users WHERE id = $1",
        [decoded.id]
      );
      
      if (userResult.rows.length > 0) {
        req.user = userResult.rows[0];
        req.session = { id: sessionResult.rows[0].id, expiresAt: sessionResult.rows[0].expires };
      }
    }
  } catch (error) {
    console.error('[Auth Middleware] Optional auth error:', error);
    // Continue without authentication for optional auth
  }
  
  next();
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};