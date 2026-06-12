import { FastifyInstance } from 'fastify';
import { assetService } from '../services/asset-service.js';

export async function assetRoutes(app: FastifyInstance) {
  app.get('/assets', async (request, reply) => {
    const query = request.query as { limit?: string; page?: string };
    const limit = Math.min(Number(query.limit || 50), 200);
    const page = Math.max(Number(query.page || 1), 1);
    const items = await assetService.listAssets(limit, (page - 1) * limit);
    return reply.send({ items, page, limit });
  });

  app.get('/assets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await assetService.getAsset(id);
    if (!asset) {
      return reply.status(404).send({ error: 'Asset 不存在' });
    }
    return reply.send(asset);
  });

  app.get('/sessions/:id/assets', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await assetService.getSessionAssets(id, 'profiler');
    return reply.send(rows);
  });
}
