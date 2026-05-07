import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAgentVerifications } from './_agent-commerce.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleAgentVerifications(req, res);
}
