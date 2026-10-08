(async function(){
try {
  const response=await fetch('data/rankdata.json.gz');
  if(!response.ok)throw new Error('Marker data HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  document.getElementById('rankdata').textContent=pako.ungzip(bytes,{to:'string'});
  const script=document.createElement('script');script.src='report-ui.js';
  script.onerror=()=>{document.getElementById('scanTable').textContent='Marker viewer failed to load; reload this page.'};
  document.body.append(script);
}catch(error){
  document.querySelectorAll('.case').forEach(e=>e.hidden=false);
  document.getElementById('scanTable').textContent='Marker data failed to load: '+error.message;
}
})();
