import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAgentPolicies } from './_agent-commerce.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleAgentPolicies(req, res);
}
