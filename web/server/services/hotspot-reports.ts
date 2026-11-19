import { createHash } from 'node:crypto';
import { eq, desc, like } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { analyses, analysisReports } from '../db/schema.js';
import type { Run } from '../../shared/perf-model.js';
import { hotspots, sourcesOf, sourceNames, canonicalSource, type CaptureImage, type ReportEntry } from '../../shared/hotspot-report.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { assetService } from './asset-service.js';

function markdownText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]()<>!#|~]/g, '\\$&');
}

export async function imagesFor(runId: string): Promise<CaptureImage[]> {
  const linked = await assetService.getSessionAssets(runId, 'run');
  return linked.filter(r => r.role === 'hotspot-image').map(({asset}) => {
    const meta = JSON.parse(asset.metadataJson ?? '{}');
    return {id:asset.id, source:asset.source, key:meta.key, caption:meta.caption, url:'/cpu/api/hotspot-images/'+asset.id};
  });
}

export function reportEntries(): ReportEntry[] {
  return getDb().select({id:analyses.id,runIds:analyses.runIds, skill:analyses.skill, title:analysisReports.headline, createdAt:analysisReports.createdAt})
    .from(analyses).innerJoin(analysisReports,eq(analysisReports.analysisId,analyses.id))
    .where(like(analyses.skill,'hotspots:%')).orderBy(desc(analysisReports.createdAt)).all().map(r => ({
      id:r.id,runId:JSON.parse(r.runIds)[0], source:r.skill!.slice(9), title:r.title ?? '', createdAt:r.createdAt,
    }));
}

export async function saveHotspotReports(run: Run, requested: string[]) {
  if (run.status !== 'ready') throw new Error('请先解析采集数据');
  const available = sourcesOf(run);
  const sources = requested.length ? [...new Set(requested.map(canonicalSource))] : available;
  if (!sources.length || sources.some(s => !available.includes(s))) throw new Error('采集记录中没有所选数据源');
  const images = await imagesFor(run.id);
  const saved = getDb().transaction(() => sources.map(source => {
    const title = [run.meta.scene || run.label || run.id, run.meta.version, sourceNames[source] ?? source].filter(Boolean).join(' · ');
    const items = hotspots(run,source);
    const text = ['# '+markdownText(title), '', [run.meta.projectName,run.meta.version,run.meta.device,run.label].filter((v): v is string => !!v).map(markdownText).join(' / '), '', '采集记录：'+markdownText(run.id)];
    function appendImages(key: string) {
      for (const image of images.filter(i => i.source === source && i.key === key)) {
        text.push('', markdownText(image.caption), '', '![工具截图]('+image.url+')');
      }
    }
    for (const h of items) {
      text.push('', '## '+markdownText(h.name), '', h.value.toFixed(2)+' '+h.measure+' · '+markdownText(h.location));
      appendImages(h.key);
    }
    if (!items.length) text.push('', '本次数据未提取到可排序的热点。');
    appendImages('');
    for (const img of images.filter(i => i.source === source && i.key && !items.some(h => h.key === i.key))) {
      text.push('',markdownText(img.key)+' · '+markdownText(img.caption),'','![已归档截图]('+img.url+')');
    }
    for (const raw of run.profile.raw.filter(r => canonicalSource(r.source) === source)) text.push('', '原始文件：'+markdownText(raw.fileName || raw.localPath || raw.assetId || raw.role));
    const id = 'hotspots-'+createHash('sha256').update(JSON.stringify([run.id,source])).digest('hex');
    return saveAnalysisWithReport({id,mode:'single',runIds:[run.id],status:'completed',skill:'hotspots:'+source},
      {headline:title,markdown:text.join('\n'),insights:items.map(h => ({
        id:h.key, severity:'info', confidence:'high', sources:[source], conclusion:h.name,
        evidence:[{source, detail:h.value.toFixed(2)+' '+h.measure+' · '+h.location}],
      }))});
  }));
  return { ...saved[0], reports:saved, skill:'hotspots', markdownPath:undefined as string | undefined };
}
