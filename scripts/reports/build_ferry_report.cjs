// Convert the verified offline report into a static, incrementally loaded site.
// No device access, reclassification or measurement changes.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),zlib=require('zlib');
const source=path.resolve(process.argv[2]||'output/map_recheck_20261006_213000');
const target=path.resolve(process.argv[3]||'web/public/report/ferry-stress-20261006');
const template=fs.readFileSync(path.join(source,'report_template_v9.html'),'utf8');
const raw=fs.readFileSync(path.join(source,'report-data.json'),'utf8'),D=JSON.parse(raw);
const code=template.match(/<\/script><script>([\s\S]*?)<\/script>/)[1];
const els=new Map();class El{constructor(id){this.id=id;this.value='';this.innerHTML='';this.textContent='';this.handlers={}}insertAdjacentHTML(p,s){this.innerHTML+=s}addEventListener(k,f){this.handlers[k]=f}scrollIntoView(){}click(){}}
const document={getElementById(id){if(!els.has(id))els.set(id,new El(id));return els.get(id)},createElement(){return new El('download')}};
document.getElementById('reportData').textContent=raw;
const ctx=vm.createContext({document,Blob:class{},URL:{createObjectURL(){return'blob:build'},revokeObjectURL(){}}});new vm.Script(code).runInContext(ctx);const run=s=>vm.runInContext(s,ctx);
for(const dir of ['cases','evidence','candidates','charts','chapters','images'])fs.mkdirSync(path.join(target,dir),{recursive:true});
const oldManifest=path.join(target,'manifest.json');if(fs.existsSync(oldManifest)){const names=JSON.parse(fs.readFileSync(oldManifest,'utf8')).files.map(x=>path.resolve(target,x.file));for(const file of names)if(!file.startsWith(target+path.sep))throw Error('Generated file outside target');for(const file of names)if(fs.existsSync(file))fs.unlinkSync(file)}
const hashes=new Map(),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function write(name,text){let buffer=Buffer.isBuffer(text)?text:Buffer.from(text),uncompressedBytes=buffer.length;if(/\.(?:json|html)$/.test(name)&&!['report.html','manifest.json'].includes(name)){name+='.gz';buffer=zlib.gzipSync(buffer,{level:9})}fs.writeFileSync(path.join(target,name),buffer);hashes.set(name,{bytes:buffer.length,uncompressedBytes,sha256:sha(buffer)})}
function externalImages(html){return html.replace(/src="data:image\/([^;]+);base64,([^"]+)"/g,(_,type,b64)=>{const bytes=Buffer.from(b64,'base64'),name='images/'+sha(bytes).slice(0,20)+'.'+(type==='jpeg'?'jpg':type);if(!hashes.has(name))write(name,bytes);return `src="${name}" loading="lazy" decoding="async"`})}
// Move the body of each closed, nontrivial details element out of the live DOM.
// Bodies can refer to other bodies; the group JSON retains each string once.
function defer(html,group){html=externalImages(html);const roots=[],stack=[],tokens=/<details\b[^>]*>|<\/details\s*>/gi;let m;
 while((m=tokens.exec(html))){if(!/^<\//.test(m[0])){const n={start:m.index,openEnd:tokens.lastIndex,children:[]};(stack.length?stack.at(-1).children:roots).push(n);stack.push(n)}else{const n=stack.pop();if(!n)throw Error('Unbalanced details '+group);n.close=m.index;n.end=tokens.lastIndex}}
 if(stack.length)throw Error('Unclosed details '+group);const bodies={};
 function range(start,end,nodes){let out='',last=start;for(const n of nodes){out+=html.slice(last,n.start)+node(n);last=n.end}return out+html.slice(last,end)}
 function node(n){let summaryEnd=html.indexOf('</summary>',n.openEnd)+10;if(summaryEnd<10||summaryEnd>n.close)throw Error('Missing summary '+group);let opener=html.slice(n.start,n.openEnd),head=html.slice(n.openEnd,summaryEnd),body=range(summaryEnd,n.close,n.children.filter(x=>x.start>=summaryEnd));
  if(!/\sopen(?:\s|=|>)/.test(opener)&&body.trim().length>600){let key=sha(body).slice(0,20);bodies[key]=body;opener=opener.slice(0,-1)+` data-group="${group}" data-body="${key}">`;body='<div class="deferred-slot"></div>'}
  return opener+head+body+html.slice(n.close,n.end)}
 const light=range(0,html.length,roots),routes={};
 function routesIn(text,chain){for(const x of text.matchAll(/\bid="(path-[^"]+)"/g))routes[x[1]]=chain;for(const x of text.matchAll(/data-body="([^"]+)"/g)){if(chain.includes(x[1]))throw Error('Recursive fragment');routesIn(bodies[x[1]],chain.concat(x[1]))}}
 routesIn(light,[]);write(`evidence/${group}.json`,JSON.stringify({bodies,routes}));return light}
const cases=[];let verifiedCandidates=0,verifiedScopes=0,rootPaths=0;
for(const c of D.cases){document.getElementById('case').value=c.id;run('detail()');let body=els.get('caseDetail').innerHTML;
 // The candidate table is filled by the original DOM handler, not part of its
 // parent's serialized HTML; the hosted loader supplies it when opened.
 write(`cases/${c.id}.html`,defer(body,c.id));write(`cases/${c.id}-budget.html`,els.get('budget').innerHTML);
 const info=run(`ensureCase(${JSON.stringify(c.id)})`),pool=[],lookup=new Map(),intern=s=>{if(!lookup.has(s)){lookup.set(s,pool.length);pool.push(s)}return lookup.get(s)};
 const fields=D.business.candidateFields,rows=info.candidates.map(m=>fields.map(k=>['name','stage','thread'].includes(k)?intern(m[k]):['chain','reasons'].includes(k)?m[k].map(intern):k==='children'?m[k].map(x=>[intern(x.name),x.count,x.totalMs,x.maxMs]):m[k]));
 // Round-trip the compact export against every original candidate field.
 for(let i=0;i<rows.length;i++){let decoded=Object.fromEntries(fields.map((k,j)=>[k,rows[i][j]]));for(let k of ['name','stage','thread'])decoded[k]=pool[decoded[k]];for(let k of ['chain','reasons'])decoded[k]=decoded[k].map(n=>pool[n]);decoded.children=decoded.children.map(a=>({name:pool[a[0]],count:a[1],totalMs:a[2],maxMs:a[3]}));for(let k of fields)if(JSON.stringify(decoded[k])!==JSON.stringify(info.candidates[i][k]))throw Error(c.id+' candidate mismatch '+k)}
 write(`candidates/${c.id}.json`,JSON.stringify({fields,pool,rows,markerCount:info.markerCount}));verifiedCandidates+=rows.length;
 const q=D.accounting.cases[c.id];verifiedScopes+=Object.keys(q.scopes||{}).length;rootPaths+=run(`pathForest(byId.get(${JSON.stringify(c.id)}),observationRows(byId.get(${JSON.stringify(c.id)}),ensureCase(${JSON.stringify(c.id)}))).length`);
 write(`charts/${c.id}.json`,JSON.stringify({id:c.id,frameColumns:c.frameColumns,frames:c.frames,samples:c.samples,accountingFrames:q.frames||[]}));
 cases.push({id:c.id,label:c.displayLabel,cohort:c.cohortLabel,condition:c.conditionLabel,fps:c.fps,wholeFps:c.whole.fps,meanMs:c.summary.frame.meanMs,p95Ms:c.summary.frame.p95,drawCalls:c.macro.render?.drawCalls?.mean,triangles:c.macro.render?.triangles?.mean});
}
const chapterContent={
 1:els.get('headline').innerHTML,
 3:els.get('issueOverview').innerHTML+'<h3>方案详情</h3>'+els.get('plans').innerHTML,
 4:els.get('historyCoverage').innerHTML,
 6:els.get('lowSummary').innerHTML+'<details><summary>调用次数与单位成本</summary>'+els.get('counts').innerHTML+'</details><details><summary>高频查询父来源</summary>'+els.get('origins').innerHTML+'</details>',
 7:els.get('experiments').innerHTML+els.get('systemConclusion').innerHTML+['native','perfetto','overhead','bigcity'].map(k=>`<details class="card"><summary>${({native:'Simpleperf调用栈',perfetto:'Perfetto调度与频率',overhead:'采集开销对照',bigcity:'名城刷新对照'})[k]}</summary>${els.get(k).innerHTML}</details>`).join(''),
 8:'<div class="toolbar"><input id="filter" placeholder="搜索场景、条件或编号"><select id="cohort"><option value="">全部条件</option>'+[...new Set(cases.map(c=>c.cohort))].map(x=>`<option>${run('esc('+JSON.stringify(x)+')')}</option>`).join('')+'</select><button id="export">导出场景CSV</button></div><div id="macro"></div><details class="card"><summary>统计方法与覆盖边界</summary>'+els.get('method').innerHTML+'</details><details class="card"><summary>版本、恢复与采样备注</summary>'+els.get('notes').innerHTML+'</details><details class="card"><summary>原始文件与采样参数索引</summary>'+els.get('files').innerHTML+'</details>'
};
for(const [i,body] of Object.entries(chapterContent))write(`chapters/${i}.html`,defer(body,'chapter-'+i));
const title='抢渡口压测性能采集报告',environment={model:'24072PX77C',version:'0.0.999.1020',quality:'精致',qualityIndex:3,scope:'本次正式复采；历史及对照条件见各用例',sources:['output/android_map_diagnosis_20261006/experiment.json','output/map_recheck_20261006_213000/initial-state.json']};
write('index.json',JSON.stringify({revision:10,title,environment,defaultCase:'recheck_A_static_r1',cases,sourceRevision:D.revision,sourceSha256:sha(raw),analysisUnchanged:true}));
write('styles.css',template.match(/<style>([\s\S]*?)<\/style>/)[1]+'\n.loading{padding:16px;color:#b7d1df}.report-environment{display:flex;gap:24px;flex-wrap:wrap;background:#233c4b;padding:14px 18px;border-radius:8px}.report-environment b{color:#7ae0cd}.deferred-slot{min-height:0}.deferred-slot:empty{display:none}.error{color:#ffad99}.retry{margin:8px}.candidate-controls{display:flex;gap:8px;flex-wrap:wrap}');
const chapterTitles=['场景总览','按用例分析 · 现场表现、成本与热点','跨场景问题与优化优先级','历史iWiki / TAPD覆盖','帧预算 · 30FPS验收与60FPS参考','严重低帧 · 已知变化与未确定起因','实验与系统采样结论','全部采样与方法附录'];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
write('report.html','<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><link rel="stylesheet" href="styles.css"><script defer src="vendor/pako_inflate.min.js"></script><script defer src="report.js"></script></head><body><main><h1>'+title+'</h1><div class="report-environment"><span>测试机型：<b>'+environment.model+'</b></span><span>游戏版本号：<b>'+environment.version+'</b></span><span>画质：<b>'+environment.quality+'</b></span></div><p class="muted">'+environment.scope+'。选择用例查看；证据在展开时加载，测量与优化判断沿用核验后的V9。</p><nav class="chapter-nav">'+chapterTitles.map((x,i)=>`<a href="#chapter-${i+1}">${i+1}. ${x.split(' · ')[0]}</a>`).join('')+'</nav>'+chapterTitles.map((x,i)=>`<section class="main-chapter" id="chapter-${i+1}"><h2>${i+1}. ${x}</h2>${i===1?'<label>用例 <select id="case">'+cases.map(c=>`<option value="${c.id}">${escape(c.label)}</option>`).join('')+'</select></label><div id="caseDetail" class="loading">正在加载用例…</div>':i===4?'<p class="scope-note">预算对应当前选中的用例。</p><div id="budget"></div>':`<div id="chapter-body-${i+1}" data-chapter="${i+1}" class="loading">滚动到此处加载…</div>`}</section>`).join('')+'<footer>静态部署版 · 115份用例保留；原始raw/pdata、系统trace与符号文件保留在采集机，不属于网页资源。</footer></main></body></html>');
write('report.js',fs.readFileSync(path.join(__dirname,'ferry_report_client.js')));
const pakoRoot=process.env.FERRY_PAKO_ROOT||path.dirname(require.resolve('pako/package.json'));fs.mkdirSync(path.join(target,'vendor'),{recursive:true});write('vendor/pako_inflate.min.js',fs.readFileSync(path.join(pakoRoot,'dist/pako_inflate.min.js')));write('vendor/pako.LICENSE',fs.readFileSync(path.join(pakoRoot,'LICENSE')));
const files=[...hashes.entries()].map(([file,v])=>({file,...v})),totalBytes=files.reduce((a,x)=>a+x.bytes,0);
write('manifest.json',JSON.stringify({revision:10,title,environment,cases:cases.length,verifiedCandidates,verifiedScopes,rootPaths,sourceRevision:D.revision,sourceSha256:sha(raw),totalBytes,files},null,2));
console.log(JSON.stringify({target,cases:cases.length,verifiedCandidates,verifiedScopes,totalBytes,htmlBytes:hashes.get('report.html').bytes,largestFile:files.sort((a,b)=>b.bytes-a.bytes)[0]},null,2));
