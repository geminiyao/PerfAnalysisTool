import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { createReadStream, existsSync } from 'node:fs';
import { imagesFor, reportEntries, saveHotspotReports } from '../services/hotspot-reports.js';
import { assetService } from '../services/asset-service.js';
import { getAnalysisReport } from '../services/analysis-store.js';
import { getRun } from '../services/run-store.js';
import { hotspots, sourcesOf } from '../../shared/hotspot-report.js';

export async function hotspotRoutes(app: FastifyInstance) {
  app.get<{Params:{id:string}}>('/hotspot-reports/:id', async (req,reply) => {
    const result = getAnalysisReport(req.params.id);
    if (!result?.analysis.skill?.startsWith('hotspots:')) return reply.code(404).send({error:'未找到热点报告'});
    return { runId:result.analysis.runIds[0], source:result.analysis.skill.slice(9), report:result.report };
  });
  app.get('/hotspot-reports', () => Promise.resolve(reportEntries()));
  app.get<{Params:{id:string}}>('/runs/:id/hotspot-images', req => imagesFor(req.params.id));
  app.post<{Params:{id:string}; Querystring:{source:string;key?:string;caption:string}}>('/runs/:id/hotspot-images', async (req, reply) => {
    const run = getRun(req.params.id);
    const {source,key = '',caption} = req.query;
    if (!run) return reply.code(404).send({error:'找不到采集记录'});
    if (run.status !== 'ready' || !sourcesOf(run).includes(source) || (key && !hotspots(run,source).some(h => h.key === key))) {
      return reply.code(400).send({error:'请在已解析的采集记录中选择数据源和热点'});
    }
    if (typeof caption !== 'string' || !caption.trim() || caption.length > 300) return reply.code(400).send({error:'请填写截图位置（最多 300 字）'});
    const file = await req.file({limits:{fileSize:12*1024*1024,files:1}});
    if (!file) return reply.code(400).send({error:'缺少图片'});
    const bytes = await file.toBuffer();
    const isPng = bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!isPng && !isJpeg) return reply.code(400).send({error:'仅支持 PNG 或 JPEG 截图'});
    const asset = await assetService.createFromStream({stream:Readable.from([bytes]),fileName:file.filename, source, assetType:'hotspot_image',
      mimeType:isPng ? 'image/png' : 'image/jpeg', metadata:{key,caption:caption.trim()}});
    await assetService.linkSessionAsset({assetId:asset.id,sessionId:run.id,sessionType:'run',role:'hotspot-image'});
    await saveHotspotReports(run,[source]);
    return {id:asset.id};
  });
  app.get<{Params:{id:string}}>('/hotspot-images/:id', async (req,reply) => {
    const asset = await assetService.getAsset(req.params.id);
    if (asset?.assetType !== 'hotspot_image' || !asset.localPath || !existsSync(asset.localPath)) return reply.code(404).send({error:'截图不存在'});
    return reply.header('X-Content-Type-Options','nosniff').type(asset.mimeType || 'application/octet-stream').send(createReadStream(asset.localPath));
  });
}
