---
id: dr-97da1e65bedfead7
category: capabilities
createdAt: 2026-07-11T07:22:30.391Z
source: stressmove-run1
title: "MapEntityCtrl.CreateMapEntity_4源码定位"
---

Topic: MapEntityCtrl.CreateMapEntity_4源码定位
Description: MapEntityCtrl.CreateMapEntity_4这个marker在queryMarkers结果中出现（sumSelfMs=191.32ms,presentInFrames=220,avgSelfMsPerPresentFrame=0.87ms），但getSourceForSymbol查询该符号未能找到匹配的源码定义。
ReasonMissing: 该符号可能是运行时动态生成的重载方法名（"_4"后缀暗示可能是某个重载/变体版本），或者是通过反射/模板生成的方法，未被静态代码索引记录。
ImpactOnFindings: 该marker总量191ms、出现在220帧（约37%的帧），量级不算最突出，本次未将其纳入正式finding，但如果后续需要深挖地图实体创建相关的性能问题，需要先解决这个符号定位问题。