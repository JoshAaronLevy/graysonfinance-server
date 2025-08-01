import { auth } from "../auth.js";

export const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }

    req.user = session.user;
    req.session = session;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    return res.status(401).json({ 
      error: 'Invalid session',
      message: 'Your session is invalid or expired'
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session) {
      req.user = session.user;
      req.session = session;
    }

    next();
  } catch (error) {
    console.error('[Auth Middleware] Optional auth error:', error);
    // Continue without authentication for optional auth
    next();
  }
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