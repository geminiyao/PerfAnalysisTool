-- 在大地图上用 Poco ExecuteLua 执行一次，返回当前 DataCtrl 中的实体分布。
local dataCtrl = mgr and mgr.mapCore and mgr.mapCore.DataCtrl
if not dataCtrl or not OutsideLocalEntityType then
    return "地图实体数据尚未就绪"
end
local all = dataCtrl:GetAllDatas()
if not all then
    return "地图实体数据尚未就绪"
end

local byType, byPrefab = {}, {}
local total, obstacles = 0, 0
for _, data in pairs(all) do
    total = total + 1
    local entityType = data.entityType or "unknown"
    byType[entityType] = (byType[entityType] or 0) + 1
    if entityType == OutsideLocalEntityType.LocalStaticObstacleEntity then
        obstacles = obstacles + 1
        local prefabId = data.prefabId or "unknown"
        byPrefab[prefabId] = (byPrefab[prefabId] or 0) + 1
    end
end

local lines = {
    string.format("DataCtrl %d | LocalStaticObstacleEntity %d | 其他 %d", total, obstacles, total - obstacles)
}
local function appendCounts(label, counts)
    local keys = {}
    for key in pairs(counts) do keys[#keys + 1] = key end
    table.sort(keys, function(a, b)
        if counts[a] ~= counts[b] then return counts[a] > counts[b] end
        return tostring(a) < tostring(b)
    end)
    for _, key in ipairs(keys) do
        lines[#lines + 1] = string.format("%s %s  %d", label, tostring(key), counts[key])
    end
end
appendCounts("entityType", byType)
appendCounts("阻挡 prefabId", byPrefab)
return table.concat(lines, "\n")
