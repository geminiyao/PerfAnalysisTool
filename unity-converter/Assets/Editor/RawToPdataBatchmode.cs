// RawToPdataBatchmode.cs
//
// Unity batchmode 脚本: .raw → .pdata + .counters.json 自动转换
// 不依赖 UI, 可在 -batchmode -nographics 模式下运行
//
// 用法:
//   set RAW_TO_PDATA_INPUT=<input.raw>
//   set RAW_TO_PDATA_OUTPUT=<output.pdata>
//   Unity.exe -batchmode -nographics -projectPath <aoeyz_project> -executeMethod AOE.Editor.Performance.RawToPdataBatchmode.Convert -quit
//
// 逻辑移植自 PerfAnalyzerCounterExporter.cs, 适配 batchmode (无 UI)

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditorInternal;
using UnityEngine;
using UnityEngine.Profiling;

namespace AOE.Editor.Performance
{
    public static class RawToPdataBatchmode
    {
        private const int PdataVersion = 7;
        private const int CountersSchemaVersion = 1;

        // --- schema 字段名 (与 ts 端 COUNTER_FIELDS 顺序一致) ---
        private static readonly string[] SchemaFieldNames = new[]
        {
            "drawCalls", "batches", "setPassCalls", "triangles", "vertices",
            "usedTexturesBytes", "usedTexturesCount", "totalReservedMemory",
            "totalUsedMemory", "gcAllocatedInFrame", "gcReservedMemory", "systemUsedMemory",
            "particleMemory", "meshMemory", "materialCount", "objectCount"
        };

        // --- 2019.4 兜底 stat 名 ---
        private struct StatRef { public ProfilerArea area; public string statName; }
        private static readonly StatRef[] CounterStatRefs = new[]
        {
            new StatRef { area = ProfilerArea.Rendering, statName = "" },
            new StatRef { area = ProfilerArea.Rendering, statName = "Batches" },
            new StatRef { area = ProfilerArea.Rendering, statName = "SetPass Calls" },
            new StatRef { area = ProfilerArea.Rendering, statName = "Triangles" },
            new StatRef { area = ProfilerArea.Rendering, statName = "Vertices" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Texture Memory" },
            new StatRef { area = ProfilerArea.Memory,    statName = "" },
            new StatRef { area = ProfilerArea.Memory,    statName = "" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Total Allocated" },
            new StatRef { area = ProfilerArea.Memory,    statName = "GC Allocated" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Total GC Allocated" },
            new StatRef { area = ProfilerArea.Memory,    statName = "" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Particle Memory" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Mesh Memory" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Material Count" },
            new StatRef { area = ProfilerArea.Memory,    statName = "Object Count" }
        };

        private static string s_LogFile = "";

        [MenuItem("Tools/Perf/Raw to Pdata (Batchmode)")]
        public static void Convert()
        {
            string inputPath = Environment.GetEnvironmentVariable("RAW_TO_PDATA_INPUT");
            string outputPath = Environment.GetEnvironmentVariable("RAW_TO_PDATA_OUTPUT");
            s_LogFile = Environment.GetEnvironmentVariable("RAW_TO_PDATA_LOG") ?? "";

            try
            {
                Log("[Batchmode] RawToPdata starting");

                if (string.IsNullOrEmpty(inputPath) || string.IsNullOrEmpty(outputPath))
                {
                    Log("[Batchmode] ERROR: RAW_TO_PDATA_INPUT or RAW_TO_PDATA_OUTPUT not set");
                    EditorApplication.Exit(1);
                    return;
                }

                if (!File.Exists(inputPath))
                {
                    Log("[Batchmode] ERROR: input file not found: " + inputPath);
                    EditorApplication.Exit(1);
                    return;
                }

                Log("[Batchmode] Input: " + inputPath);
                Log("[Batchmode] Output: " + outputPath);

                // 1. 加载 .raw 到 Profiler
                Log("[Batchmode] Loading profile data...");
                ProfilerDriver.LoadProfile(inputPath, false);

                // 等待 Profiler 数据就绪 (最多等 30 秒)
                int waited = 0;
                while (ProfilerDriver.lastFrameIndex < 0 && waited < 300)
                {
                    System.Threading.Thread.Sleep(100);
                    waited++;
                }

                int firstFrame = ProfilerDriver.firstFrameIndex;
                int lastFrame = ProfilerDriver.lastFrameIndex;

                if (lastFrame < firstFrame || lastFrame < 0)
                {
                    Log("[Batchmode] ERROR: no frames available after load. firstFrame=" + firstFrame + " lastFrame=" + lastFrame);
                    EditorApplication.Exit(1);
                    return;
                }

                Log("[Batchmode] Frames: " + firstFrame + " to " + lastFrame + " (" + (lastFrame - firstFrame + 1) + " total)");

                // 2. 提取 markers + 写 .pdata
                var pdata = ExtractMarkers(firstFrame, lastFrame);
                if (pdata.frames.Count == 0)
                {
                    Log("[Batchmode] ERROR: no complete frames extracted");
                    EditorApplication.Exit(1);
                    return;
                }

                WritePdata(outputPath, pdata);
                Log("[Batchmode] Wrote .pdata: " + pdata.frames.Count + " frames, " + pdata.markerNames.Count + " markers");

                // 3. 提取 counters + 写 .counters.json
                // 3a. 尝试初始化 ProfilerWindow（batchmode 下 GetStatisticsValues 可能需要它）
                try
                {
                    var pwType = System.Type.GetType("UnityEditor.ProfilerWindow,UnityEditor");
                    if (pwType != null)
                    {
                        var pw = EditorWindow.GetWindow(pwType);
                        Log("[Batchmode] ProfilerWindow initialized for counter extraction");
                    }
                }
                catch (Exception e) { Log("[Batchmode] ProfilerWindow init skipped: " + e.Message); }

                string sidecarPath = Path.ChangeExtension(outputPath, ".counters.json");
                int countersFirst = pdata.frameIndexOffset;
                int countersLast = pdata.frameIndexOffset + pdata.frames.Count - 1;
                ExportCounters(sidecarPath, countersFirst, countersLast, pdata.frameIndexOffset);
                Log("[Batchmode] Wrote .counters.json: " + sidecarPath);

                Log("[Batchmode] SUCCESS");
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Log("[Batchmode] EXCEPTION: " + e.ToString());
                EditorApplication.Exit(1);
            }
        }

        // ==================== Marker 提取 (移植自 PerfAnalyzerCounterExporter) ====================

        private class MyMarker { public int nameIndex; public float msMarkerTotal; public int depth; }
        private class MyThread { public int threadIndex; public List<MyMarker> markers = new List<MyMarker>(); }
        private class MyFrame { public double msStartTime; public float msFrame; public List<MyThread> threads = new List<MyThread>(); }
        private class MyProfileData
        {
            public int frameIndexOffset;
            public List<MyFrame> frames = new List<MyFrame>();
            public List<string> markerNames = new List<string>();
            public List<string> threadNames = new List<string>();
            public Dictionary<string, int> markerNameDict = new Dictionary<string, int>();
            public Dictionary<string, int> threadNameDict = new Dictionary<string, int>();
        }

        private static MyProfileData ExtractMarkers(int firstFrame, int lastFrame)
        {
            var data = new MyProfileData();
            data.frameIndexOffset = firstFrame;

            var iter = new ProfilerFrameDataIterator();
            try
            {
                int totalFrames = lastFrame - firstFrame + 1;
                var threadNameCount = new Dictionary<string, int>();

                for (int frameIndex = firstFrame; frameIndex <= lastFrame; frameIndex++)
                {
                    int threadCount = iter.GetThreadCount(frameIndex);
                    iter.SetRoot(frameIndex, 0);
                    float msFrame = iter.frameTimeMS;

                    // 跳掉首尾 incomplete 帧
                    if ((frameIndex == firstFrame || frameIndex == lastFrame) &&
                        firstFrame != lastFrame && msFrame == 0)
                    {
                        if (frameIndex == firstFrame)
                        {
                            data.frameIndexOffset = frameIndex + 1;
                            continue;
                        }
                        else break;
                    }

                    var frame = new MyFrame
                    {
                        msStartTime = 1000.0 * iter.GetFrameStartS(frameIndex),
                        msFrame = msFrame
                    };
                    data.frames.Add(frame);

                    threadNameCount.Clear();
                    for (int threadIndex = 0; threadIndex < threadCount; threadIndex++)
                    {
                        iter.SetRoot(frameIndex, threadIndex);
                        string threadName = iter.GetThreadName();
                        if (string.IsNullOrEmpty(threadName) || threadName.Trim() == "") continue;
                        string groupName = iter.GetGroupName();
                        string fullThreadName = string.IsNullOrEmpty(groupName)
                            ? threadName
                            : string.Format("{0}.{1}", groupName, threadName);

                        var t = new MyThread();
                        frame.threads.Add(t);

                        int nameCount;
                        threadNameCount.TryGetValue(fullThreadName, out nameCount);
                        threadNameCount[fullThreadName] = nameCount + 1;
                        string threadNameWithIndex = string.Format("{0}:{1}", threadNameCount[fullThreadName], fullThreadName);
                        threadNameWithIndex = CorrectThreadName(threadNameWithIndex);
                        t.threadIndex = AddOrGetIndex(data.threadNames, data.threadNameDict, threadNameWithIndex);

                        const bool enterChildren = true;
                        while (iter.Next(enterChildren))
                        {
                            float duration = iter.durationMS;
                            if (duration < 0) continue;
                            var m = new MyMarker { msMarkerTotal = duration, depth = iter.depth };
                            m.nameIndex = AddOrGetIndex(data.markerNames, data.markerNameDict, iter.name);
                            t.markers.Add(m);
                        }
                    }

                    if ((frameIndex - firstFrame) % 50 == 0)
                        Log("[Batchmode] Extracting markers: frame " + (frameIndex - firstFrame + 1) + "/" + totalFrames);
                }
            }
            finally { iter.Dispose(); }

            return data;
        }

        private static int AddOrGetIndex(List<string> list, Dictionary<string, int> dict, string name)
        {
            int idx;
            if (dict.TryGetValue(name, out idx)) return idx;
            list.Add(name);
            idx = list.Count - 1;
            dict[name] = idx;
            return idx;
        }

        private static string CorrectThreadName(string threadNameWithIndex)
        {
            var info = threadNameWithIndex.Split(':');
            if (info.Length >= 2)
            {
                string idxStr = info[0];
                string name = info[1];
                if (name.Trim() == "")
                {
                    threadNameWithIndex = string.Format("{0}:[Unknown]", idxStr);
                }
                else
                {
                    var m = System.Text.RegularExpressions.Regex.Match(name, @"^(.*[^\s])\s+(\d+)$");
                    if (m.Success)
                    {
                        string prefix = m.Groups[1].Value;
                        int groupIdx = 1 + int.Parse(m.Groups[2].Value);
                        threadNameWithIndex = string.Format("{0}:{1}", groupIdx, prefix);
                    }
                }
            }
            return threadNameWithIndex.Trim();
        }

        // ==================== .pdata 序列化 (schema v7, 与 ProfileData.cs 一致) ====================

        private static void WritePdata(string path, MyProfileData data)
        {
            using (var fs = new FileStream(path, FileMode.OpenOrCreate, FileAccess.Write))
            using (var bw = new BinaryWriter(fs))
            {
                bw.Write(PdataVersion);                    // int32 version
                bw.Write(data.frameIndexOffset);           // int32
                bw.Write(data.frames.Count);               // int32 frameCount
                foreach (var frame in data.frames)
                {
                    bw.Write(frame.msStartTime);           // double
                    bw.Write(frame.msFrame);               // float
                    bw.Write(frame.threads.Count);         // int32
                    foreach (var t in frame.threads)
                    {
                        bw.Write(t.threadIndex);           // int32
                        bw.Write(t.markers.Count);         // int32
                        foreach (var m in t.markers)
                        {
                            bw.Write(m.nameIndex);         // int32
                            bw.Write(m.msMarkerTotal);     // float
                            bw.Write(m.depth);             // int32
                        }
                    }
                }
                bw.Write(data.markerNames.Count);          // int32
                foreach (var name in data.markerNames) bw.Write(name);  // length-prefixed
                bw.Write(data.threadNames.Count);          // int32
                foreach (var name in data.threadNames) bw.Write(name);  // length-prefixed
            }
        }

        // ==================== Counters 提取 (2019.4 兜底路径) ====================

        private static void ExportCounters(string sidecarPath, int firstFrame, int lastFrame, int frameIndexOffset)
        {
            int frameCount = lastFrame - firstFrame + 1;
            if (frameCount <= 0) { File.WriteAllText(sidecarPath, EmptySidecarJson(frameIndexOffset, 0)); return; }

            int N = SchemaFieldNames.Length;

            // 收集 stat 名
            var areaStats = new Dictionary<ProfilerArea, string[]>();
            foreach (ProfilerArea area in System.Enum.GetValues(typeof(ProfilerArea)))
            {
                if ((int)area < 0) continue;
                string[] stats = null;
                try { stats = ProfilerDriver.GetGraphStatisticsPropertiesForArea(area); } catch { }
                areaStats[area] = stats ?? new string[0];
            }

            // fuzzy match
            var identifiers = new int[N];
            var columns = new float[N][];
            int validCount = 0;
            for (int i = 0; i < N; i++)
            {
                var refDef = CounterStatRefs[i];
                if (string.IsNullOrEmpty(refDef.statName)) { identifiers[i] = -1; columns[i] = null; continue; }
                string[] candidates;
                if (!areaStats.TryGetValue(refDef.area, out candidates) || candidates.Length == 0)
                { identifiers[i] = -1; columns[i] = null; continue; }

                string match = null;
                foreach (var s in candidates) { if (string.Equals(s, refDef.statName, StringComparison.OrdinalIgnoreCase)) { match = s; break; } }
                if (match == null) foreach (var s in candidates) { if (s.IndexOf(refDef.statName, StringComparison.OrdinalIgnoreCase) >= 0) { match = s; break; } }

                if (match != null)
                {
                    int id = ProfilerDriver.GetStatisticsIdentifierForArea(refDef.area, match);
                    if (id >= 0)
                    {
                        var buf = new float[frameCount];
                        float maxValue;
                        int got = ProfilerDriver.GetStatisticsValues(id, firstFrame, 1.0f, buf, out maxValue);
                        // 检查是否拿到了真实数据
                        bool hasNonZero = false;
                        if (got > 0) { for (int j = 0; j < got; j++) { if (buf[j] != 0f) { hasNonZero = true; break; } } }
                        Log("[Batchmode] Counter '" + refDef.statName + "' (area=" + refDef.area +
                            "): id=" + id + " got=" + got + "/" + frameCount + " maxVal=" + maxValue + " nonZero=" + hasNonZero);
                        identifiers[i] = id; columns[i] = buf; validCount++; continue;
                    }
                }
                identifiers[i] = -1; columns[i] = null;
            }

            Log("[Batchmode] Counters resolved: " + validCount + "/" + N);
            if (validCount == 0) { File.WriteAllText(sidecarPath, EmptySidecarJson(frameIndexOffset, 0)); return; }

            var sb = new StringBuilder(1024 * 64);
            BeginSidecar(sb, frameIndexOffset);
            int written = 0;
            for (int row = 0; row < frameCount; row++)
            {
                int frameIdx = firstFrame + row;
                AppendFrameRow(sb, frameIdx, written, () =>
                {
                    var values = new long?[N];
                    for (int i = 0; i < N; i++)
                    {
                        if (columns[i] == null) { values[i] = null; continue; }
                        values[i] = (long)Math.Round(columns[i][row]);
                    }
                    return values;
                });
                written++;
            }
            EndSidecar(sb, written);
            File.WriteAllText(sidecarPath, sb.ToString());
        }

        // --- sidecar JSON helpers ---
        private static void BeginSidecar(StringBuilder sb, int frameIndexOffset)
        {
            sb.Append("{\n");
            sb.AppendFormat("  \"schemaVersion\": {0},\n", CountersSchemaVersion);
            sb.AppendFormat("  \"frameIndexOffset\": {0},\n", frameIndexOffset);
            sb.Append("  \"counters\": [");
            for (int i = 0; i < SchemaFieldNames.Length; i++) { if (i > 0) sb.Append(','); sb.Append('"').Append(SchemaFieldNames[i]).Append('"'); }
            sb.Append("],\n  \"frames\": [\n");
        }
        private static void AppendFrameRow(StringBuilder sb, int frameIdx, int writtenSoFar, Func<long?[]> compute)
        {
            if (writtenSoFar > 0) sb.Append(",\n");
            sb.Append("    {\"frameIndex\": ").Append(frameIdx).Append(", \"values\": [");
            var values = compute();
            for (int i = 0; i < values.Length; i++) { if (i > 0) sb.Append(','); if (values[i].HasValue) sb.Append(values[i].Value); else sb.Append("null"); }
            sb.Append("]}");
        }
        private static void EndSidecar(StringBuilder sb, int writtenFrames) { sb.Append("\n  ],\n"); sb.AppendFormat("  \"frameCount\": {0}\n}}\n", writtenFrames); }
        private static string EmptySidecarJson(int frameIndexOffset, int writtenFrames) { var sb = new StringBuilder(); BeginSidecar(sb, frameIndexOffset); EndSidecar(sb, writtenFrames); return sb.ToString(); }

        // ==================== 日志 ====================
        private static void Log(string msg)
        {
            Debug.Log("[RawToPdata] " + msg);
            if (!string.IsNullOrEmpty(s_LogFile))
            {
                try { File.AppendAllText(s_LogFile, DateTime.Now.ToString("HH:mm:ss") + " " + msg + "\n"); } catch { }
            }
        }
    }
}
