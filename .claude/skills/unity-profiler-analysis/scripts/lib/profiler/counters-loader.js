/**
 * Sidecar loader for Render/Memory counters.
 *
 * Sidecar path is derived by replacing the `.pdata` extension with `.counters.json`.
 * Missing sidecar returns undefined — callers should treat counter data as optional
 * for backward compatibility with old `.pdata` files captured before the exporter existed.
 */
import * as fs from 'fs';
import * as path from 'path';
import { COUNTER_FIELDS } from './types';
const SUPPORTED_SCHEMA_VERSION = 1;
export function deriveSidecarPath(pdataPath) {
    const dir = path.dirname(pdataPath);
    const ext = path.extname(pdataPath);
    const base = path.basename(pdataPath, ext);
    return path.join(dir, `${base}.counters.json`);
}
/**
 * Load and validate the counters sidecar next to a `.pdata` file.
 * Returns undefined when sidecar is missing or schema validation fails.
 * Validation failures emit a console.warn but do not throw — callers continue without counters.
 */
export function loadCountersSidecar(pdataPath, expectedFrameIndexOffset) {
    const sidecarPath = deriveSidecarPath(pdataPath);
    if (!fs.existsSync(sidecarPath)) {
        return undefined;
    }
    let raw;
    try {
        raw = fs.readFileSync(sidecarPath, 'utf-8');
    }
    catch (e) {
        console.warn(`[counters-loader] Cannot read ${sidecarPath}: ${e.message}`);
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        console.warn(`[counters-loader] Invalid JSON in ${sidecarPath}: ${e.message}`);
        return undefined;
    }
    if (parsed?.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        console.warn(`[counters-loader] Unsupported schemaVersion in ${sidecarPath}: ` +
            `got ${parsed?.schemaVersion}, expected ${SUPPORTED_SCHEMA_VERSION}`);
        return undefined;
    }
    if (!Array.isArray(parsed.frames)) {
        console.warn(`[counters-loader] Sidecar 'frames' is not an array: ${sidecarPath}`);
        return undefined;
    }
    if (typeof parsed.frameIndexOffset !== 'number') {
        console.warn(`[counters-loader] Sidecar 'frameIndexOffset' missing or non-numeric: ${sidecarPath}`);
        return undefined;
    }
    if (parsed.frameIndexOffset !== expectedFrameIndexOffset) {
        // Mismatch is a warning, not fatal — frames are matched by absolute frameIndex
        // so the offset is effectively informational. But it usually indicates the sidecar
        // was generated against a different .pdata.
        console.warn(`[counters-loader] frameIndexOffset mismatch: sidecar=${parsed.frameIndexOffset}, ` +
            `pdata=${expectedFrameIndexOffset}. Continuing — frames will be matched by absolute frameIndex.`);
    }
    // Verify monotonic frameIndex (cheap sanity check)
    let lastIdx = -Infinity;
    for (const f of parsed.frames) {
        if (typeof f?.frameIndex !== 'number' || f.frameIndex <= lastIdx) {
            console.warn(`[counters-loader] Non-monotonic or invalid frameIndex in ${sidecarPath} ` +
                `(near index ${lastIdx}); aborting sidecar load.`);
            return undefined;
        }
        lastIdx = f.frameIndex;
    }
    // Coerce missing counter fields to null so downstream code can rely on shape
    for (const f of parsed.frames) {
        for (const field of COUNTER_FIELDS) {
            if (f[field] === undefined)
                f[field] = null;
        }
    }
    console.error(`[counters-loader] Loaded ${parsed.frames.length} frames of counters from ${path.basename(sidecarPath)}`);
    return parsed;
}
