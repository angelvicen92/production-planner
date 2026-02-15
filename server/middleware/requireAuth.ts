import { Request, Response, NextFunction } from 'express';
import { supabaseAnon } from '../supabase';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAnon.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Unauthorized', error: error?.message });
    }

    // Attach user to request
    (req as any).user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ message: 'Unauthorized' });
  }
}
