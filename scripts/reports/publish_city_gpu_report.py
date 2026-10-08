"""Prepare the reviewed city GPU report as Vite public assets; no remote deployment."""
from pathlib import Path
import json,hashlib,html.parser,urllib.parse

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'artifacts/city_clean_compare_20261002'
PUBLIC=ROOT/'web/public/report'
ID='city-gpu-compare-20261002'
DEST=PUBLIC/ID
BASE='/cpu/report/'+ID+'/'
ALLOWED={'.html','.json','.csv','.metal','.png','.cginc','.cs','.shader','.txt'}
SKIP={'package_validation.json','report_theme.json'}

class Links(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.paths=[]
 def handle_starttag(self,tag,attrs):
  for key,value in attrs:
   if key in ['src','href'] and value:self.paths.append(value)

def sha(data):return hashlib.sha256(data).hexdigest()
def write_json(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n','utf8')

# The existing offline package defines the reviewed evidence set. Keep runtime
# pages and evidence; omit build/QA scripts and the compressed archive itself.
package=SOURCE/'city_gpu_comparison_clean_report.zip'
import zipfile
files=[]
DEST.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(package) as z:
 assert z.testzip() is None
 assert z.read('report.html')==(SOURCE/'report.html').read_bytes(),'Rebuild offline package first'
 for item in z.infolist():
  rel=Path(item.filename)
  if item.is_dir() or rel.suffix not in ALLOWED or (len(rel.parts)==1 and rel.name in SKIP):continue
  target=(DEST/rel).resolve();assert target.is_relative_to(DEST.resolve())
  target.parent.mkdir(parents=True,exist_ok=True);data=z.read(item);target.write_bytes(data)
  files.append({'file':rel.as_posix(),'bytes':len(data),'sha256':sha(data)})

links=0;anchor_cache={};target_cache={}
for f in files:
 if not f['file'].endswith('.html'):continue
 page=DEST/f['file'];parser=Links();parser.feed(page.read_text('utf8'))
 for href in parser.paths:
  url=urllib.parse.urlsplit(href)
  if url.scheme or url.netloc:continue
  cache_key=(page.parent,urllib.parse.unquote(url.path)) if url.path else (page,'')
  if cache_key not in target_cache:
   target=(page.parent/cache_key[1]).resolve() if url.path else page.resolve()
   assert target.is_relative_to(DEST.resolve()),href
   assert target.is_file(),(page,href)
   target_cache[cache_key]=target
  target=target_cache[cache_key]
  if url.fragment:
   if target not in anchor_cache:
    import re
    anchor_cache[target]=set(re.findall(r'id="([^\"]+)"',target.read_text('utf8')))
   assert urllib.parse.unquote(url.fragment) in anchor_cache[target],(page,href)
  links+=1
data=json.loads((DEST/'report_data.json').read_text('utf8'))
assert len(data['draws'])==888 and len(data['pipelines'])==179
for row in data['draws']:
 for stage in ['vertex','fragment']:
  if key:=row[stage+'_source']:assert (DEST/row['case']/'shaders'/(key+'.metal.html')).is_file()
for row in data['xcode_summary'].values():
 evidence=row['source'];assert sha((DEST/evidence['portable']).read_bytes())==evidence['sha256']

entry={'id':ID,'title':'帝国1 vs 帝国2：内城全盛·精致 GPU对比','collectedAt':'2026-10-02（报告更新：2026-10-08）','model':'iPhone（具体型号未核定）','version':'未提供构建版本号','quality':'精致 · 内城全盛','href':BASE+'report.html','summary':'对比两份内城捕获的GPU耗时、纹理与Buffer容量、提交三角形及实际Shader复杂度；重点标注片元计算、几何密度和纹理预算，并提供源码、截图及逐Draw证据。','sources':['Xcode GPU Trace','Xcode Summary','Metal Shader']}
catalog_path=PUBLIC/'catalog.json';catalog=json.loads(catalog_path.read_text('utf8'));original=[x for x in catalog if x['id']!=ID]
catalog=original+[entry];assert len({x['id'] for x in catalog})==len(catalog)
write_json(catalog_path,catalog)
assert [x for x in json.loads(catalog_path.read_text('utf8')) if x['id']!=ID]==original

manifest={'id':ID,'entry':'report.html','basePath':BASE,'preparedAt':'2026-10-08','sourceReportSha256':sha((SOURCE/'report.html').read_bytes()),'sourcePackageSha256':sha(package.read_bytes()),'fileCount':len(files),'totalBytes':sum(x['bytes'] for x in files),'files':files}
write_json(DEST/'manifest.json',manifest)
write_json(DEST/'publication_validation.json',{'passed':True,'draws':888,'actualPso':179,'allPublishedHtmlLinksAndAnchorsChecked':links,'sourceReportUnchanged':True,'sourceScreenshotsHashesPass':True,'allDrawSourcePagesPresent':True,'existingCatalogEntriesUnchanged':True,'remoteDeploymentPerformed':False})
print(json.dumps({'directory':str(DEST),'href':entry['href'],'files':len(files),'bytes':manifest['totalBytes'],'linksChecked':links,'catalogReports':len(catalog)},ensure_ascii=True))
