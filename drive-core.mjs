// Immutable Drive revision graph. No mutable "latest" file, lock or last-write-wins.
// v2 (2026-11): the graph is read from Drive file metadata (appProperties), so a sync no longer
// downloads every revision and every recording. Uploads are verified by Drive's sha256Checksum
// (falls back to downloading only when Drive does not report it). A conflict can be resolved by a
// merge revision that lists every current head as a parent. Old revisions and unreferenced audio
// are pruned so a project never hits the revision/history limits in normal use.
export const LIMITS={assetBytes:25*1024*1024,ownerBytes:100*1024*1024,projects:20,revisions:200,manifestBytes:2*1024*1024,historyBytes:10*1024*1024,keepRevisions:30,maxParents:6};
const APP='listening-studio-v1',ROOT='https://www.googleapis.com/drive/v3';
const FIELDS='id,name,size,createdTime,appProperties,ownedByMe,sha256Checksum';
const fail=(message,status)=>Object.assign(Error(message),{status});
const parentKeys=Array.from({length:LIMITS.maxParents},(_,i)=>i?'parent'+(i+1):'parent');
const parentsOf=f=>parentKeys.map(k=>f.appProperties?.[k]).filter(Boolean);
const rowOf=f=>({id:f.appProperties.operation,fileId:f.id,projectId:f.appProperties.project,parents:parentsOf(f),title:f.appProperties.title||'聽力專案',updatedAt:f.createdTime||null,size:Number(f.size||0)});
export class DriveStore{
 constructor({credential,fetch=(...args)=>globalThis.fetch(...args),ids}){this.credential=credential;this.fetch=fetch;this.ids=ids}
 context(){const c=this.credential();if(!c||c.expiresAt<=Date.now()+5000)throw fail('Google授權已到期，請按重新授權；本機內容保留。',401);return c}
 async request(url,options={},context=this.context()){
  if(this.credential()!==context)throw fail('帳號已切換，未繼續傳送。',401);if(Date.now()<(this.cooldownUntil||0))throw fail('Drive流量限制冷卻中，請稍後重試。',429);
  const r=await this.fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+context.token}});
  if(this.credential()!==context)throw fail('帳號已切換，舊帳號操作已停止。',401);
  if(r.status===401)context.expiresAt=0;if(r.status===429)this.cooldownUntil=Date.now()+Math.min(3600,Math.max(30,Number(r.headers.get('retry-after'))||30))*1000;
  if(!r.ok){let message='Google Drive暫時無法完成，請稍後重試。';if(r.status===401)message='Google授權已到期，請按重新授權。';if(r.status===403)message='Drive存取遭拒或容量／校方政策限制；沒有自動擴權。';if(r.status===404)message='Drive找不到檔案。';if(r.status===429)message='Drive流量限制，請稍後重試；本機內容保留。';throw fail(message,r.status)}return r;
 }
 async listFiles(kind,project,context=this.context(),extra={}){
  const safe=x=>String(x).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const prop=(k,v)=>`appProperties has { key='${k}' and value='${safe(v)}' }`;
  const q=["trashed=false","'me' in owners",prop('app',APP),kind?prop('kind',kind):null,project?prop('project',project):null,...Object.entries(extra).map(([k,v])=>prop(k,v))].filter(Boolean).join(' and ');
  let all=[],token;const pages=new Set();do{const p=new URLSearchParams({q,corpora:'user',spaces:'drive',pageSize:'1000',fields:'incompleteSearch,nextPageToken,files('+FIELDS+')'});if(token)p.set('pageToken',token);const data=await(await this.request(ROOT+'/files?'+p,{},context)).json();if(data.incompleteSearch||!Array.isArray(data.files))throw fail('Drive清單尚不完整，未繼續寫入；請重試。',503);all.push(...data.files.filter(f=>f.ownedByMe!==false&&f.appProperties));token=data.nextPageToken;if(token){if(pages.has(token)||pages.size>=1000)throw fail('Drive分頁異常，未繼續寫入。',503);pages.add(token)}if(all.length>10000)throw fail('檔案數超過此試版檢查上限，未繼續寫入。',413)}while(token);return all;
 }
 async metadata(id,context=this.context()){try{return await(await this.request(ROOT+'/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent(FIELDS+',trashed'),{},context)).json()}catch(e){if(e.status===404)return null;throw e}}
 async readFile(id,context=this.context(),limit=LIMITS.assetBytes){
  const response=await this.request(ROOT+'/files/'+encodeURIComponent(id)+'?alt=media',{},context);
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw fail('雲端檔案超過讀取上限，本機內容保留。',413)}
  if(!response.body)return new Blob([],{type:response.headers.get('content-type')||''});
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw fail('雲端檔案超過讀取上限，本機內容保留。',413)}parts.push(value)}}finally{reader.releaseLock()}
  if(this.credential()!==context)throw fail('帳號已切換，舊帳號下載未套用。',401);
  return new Blob(parts,{type:response.headers.get('content-type')||'application/octet-stream'});
 }
 async remove(id,context=this.context()){try{await this.request(ROOT+'/files/'+encodeURIComponent(id),{method:'DELETE'},context)}catch(e){if(e.status!==404)throw e}}
 // True when Drive holds exactly these bytes. Uses Drive's checksum; downloads only if Drive omits it.
 async matches(file,hash,size,context){
  if(!file||file.trashed)return false;
  if(Number(file.size)!==size)return false;
  if(typeof file.sha256Checksum==='string'&&file.sha256Checksum)return file.sha256Checksum.toLowerCase()===hash;
  const blob=await this.readFile(file.id,context);return blob.size===size&&await SyncCodec.hash(await blob.arrayBuffer())===hash;
 }
 async create(key,blob,properties,context=this.context()){
  const hash=await SyncCodec.hash(await blob.arrayBuffer());
  const storageKey=context.owner+':'+key;let id=await this.ids.get(storageKey);
  if(!id){const data=await(await this.request(ROOT+'/files/generateIds?count=1&space=drive&type=files',{},context)).json();id=data.ids[0];await this.ids.put(storageKey,id)}
  const existing=await this.metadata(id,context);
  if(existing&&!existing.trashed){if(await this.matches(existing,hash,blob.size,context))return id;throw fail('同一操作檔案內容不一致，已停止。',409)}
  const init=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':blob.type||'application/octet-stream','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify({id,name:'聽力錄音室-'+key,mimeType:blob.type||'application/octet-stream',appProperties:{app:APP,...properties}})},context);
  const location=init.headers.get('location');const url=new URL(location||'');if(url.protocol!=='https:'||url.hostname!=='www.googleapis.com')throw fail('Drive回傳無效上傳位置。',502);
  await this.request(location,{method:'PUT',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob},context);
  if(!await this.matches(await this.metadata(id,context),hash,blob.size,context))throw fail('上傳尚未完成。',503);return id;
 }
 async findAsset(hash,context){const files=await this.listFiles('audio',null,context,{hash});return files[0]||null}
 async asset(hash,context=this.context()){
  const file=await this.findAsset(hash,context);if(!file)throw fail('找不到原始音訊。',404);
  const blob=await this.readFile(file.id,context);if(await SyncCodec.hash(await blob.arrayBuffer())!==hash)throw fail('原始音訊校驗失敗。',422);return blob;
 }
 // One metadata listing tells which recordings still need uploading.
 async missingAssets(items,context=this.context()){
  const files=await this.listFiles('audio',null,context),byHash=new Map(files.map(f=>[f.appProperties.hash,f])),missing=[];
  for(const {hash,size} of items){const f=byHash.get(hash);if(!f||!await this.matches(f,hash,size,context))missing.push(hash)}
  return {missing,usedBytes:files.reduce((n,f)=>n+Number(f.size||0),0)};
 }
 async putAsset(hash,blob,context=this.context()){
  if(blob.size>LIMITS.assetBytes||await SyncCodec.hash(await blob.arrayBuffer())!==hash)throw fail('音訊大小或校驗不符。',413);
  const found=await this.findAsset(hash,context);if(found&&await this.matches(found,hash,blob.size,context))return;
  const used=async()=>(await this.listFiles('audio',null,context)).reduce((n,f)=>n+Number(f.size||0),0);
  if(await used()+blob.size>LIMITS.ownerBytes){await this.cleanup(context);if(await used()+blob.size>LIMITS.ownerBytes)throw fail('雲端錄音空間已滿（清理舊錄音後仍不足），不會自動升級。',413)}
  await this.create('audio-'+hash,blob,{kind:'audio',hash},context);
 }
 async revisionRows(project,context=this.context()){return(await this.listFiles('revision',project,context)).map(rowOf)}
 async readRevision(row,context=this.context()){
  const b=await this.readFile(row.fileId,context,LIMITS.manifestBytes);const r=JSON.parse(await b.text());
  if(r.schema!==1||r.owner!==context.owner||r.projectId!==row.projectId||r.id!==row.id||!Array.isArray(r.parents)||r.parents.some(x=>typeof x!=='string'))throw fail('雲端版本格式不符。',422);return r;
 }
 heads(rows){const parents=new Set(rows.flatMap(r=>r.parents));const seen=new Set();return rows.filter(r=>!parents.has(r.id)&&!seen.has(r.id)&&seen.add(r.id))}
 async projects(){const rows=(await this.listFiles('revision')).map(rowOf);const result=[];for(const id of new Set(rows.map(r=>r.projectId))){const heads=this.heads(rows.filter(r=>r.projectId===id));for(const r of heads)result.push({id,revision:r.id,title:r.title,updatedAt:r.updatedAt,conflict:heads.length>1,heads:heads.map(h=>h.id)})}return result}
 async get(project,revision){const context=this.context(),rows=await this.revisionRows(project,context),heads=this.heads(rows);const row=revision?rows.find(r=>r.id===revision):heads.length===1?heads[0]:null;if(!row)throw fail(heads.length>1?'有多個並行版本，請從清單選擇；每一份都已保留。':'找不到專案版本。',heads.length>1?409:404);const r=await this.readRevision(row,context);return{manifest:r.manifest,position:r.position,revision:r.id,heads:heads.map(h=>h.id)}}
 async commit(project,body){const context=this.context();let rows=await this.revisionRows(project,context);const digest=await SyncCodec.hash(new TextEncoder().encode(JSON.stringify(body)));
  const oldRow=rows.find(r=>r.id===body.operationId);
  if(oldRow){const old=await this.readRevision(oldRow,context);if(old.digest!==digest)throw fail('重試操作內容不一致。',409);return this.commitResult(rows,old.id)}
  if(body.manifest.projectId!==project)throw fail('專案識別不符。',422);
  const merge=[...new Set((Array.isArray(body.mergeParents)?body.mergeParents:[]).filter(x=>typeof x==='string'&&x))];
  const ids=new Set(rows.map(r=>r.id));
  if(body.baseRevision&&!ids.has(body.baseRevision)&&!merge.length)throw fail('雲端已有其他裝置的新版本（或舊版已清理）；請選擇要保留哪一份。',409);
  if(merge.some(id=>!ids.has(id)))throw fail('要合併的雲端版本已變更，請重新整理後再選擇。',409);
  const parents=[...new Set([body.baseRevision,...merge].filter(id=>id&&ids.has(id)))];
  if(parents.length>LIMITS.maxParents)throw fail('並行版本過多，請先在清單選擇一份。',409);
  // Refuse before writing anything when another device has moved ahead; the local copy stays dirty.
  const heads=this.heads(rows);if(heads.some(h=>!parents.includes(h.id)))throw fail('兩端同時修改；本機內容已保留，請選擇要以哪一份為準。',409);
  if(rows.length>=LIMITS.revisions){await this.prune(project,context);rows=await this.revisionRows(project,context);if(rows.length>=LIMITS.revisions)throw fail('版本數達試版上限；未覆寫舊版。',413)}
  const all=await this.listFiles('revision',null,context);if(!rows.length&&new Set(all.map(f=>f.appProperties.project)).size>=LIMITS.projects)throw fail('專案數達試版上限。',413);
  // Verify all immutable audio (metadata only) before publishing the revision manifest.
  const needed=new Map();for(const c of SyncCodec.inventory(body.manifest))if(c.asset)needed.set(c.asset.id,c.asset.size);
  const {missing}=await this.missingAssets([...needed].map(([hash,size])=>({hash,size})),context);if(this.credential()!==context)throw fail('帳號已切換，未繼續傳送。',401);if(missing.length)throw fail('音訊尚未完整上傳。',422);
  const revision={schema:1,owner:context.owner,projectId:project,id:body.operationId,parents,digest,manifest:body.manifest,position:body.position};
  const blob=new Blob([JSON.stringify(revision)],{type:'application/json'});if(blob.size>LIMITS.manifestBytes)throw fail('專案資訊過大。',413);
  if(all.reduce((n,f)=>n+Number(f.size||0),0)+blob.size>LIMITS.historyBytes){await this.prune(project,context);const again=await this.listFiles('revision',null,context);if(again.reduce((n,f)=>n+Number(f.size||0),0)+blob.size>LIMITS.historyBytes)throw fail('版本資訊達試版上限，未覆寫舊版。',413)}
  let title=body.manifest.title;while(new TextEncoder().encode(title).length>80)title=title.slice(0,-1);
  const props={kind:'revision',project,operation:body.operationId,title};parents.forEach((id,i)=>props[parentKeys[i]]=id);if(!parents.length)props.parent='';
  await this.create('revision-'+body.operationId,blob,props,context);
  const observed=await this.revisionRows(project,context);if(!observed.some(r=>r.id===revision.id))observed.push({id:revision.id,parents});
  const result=this.commitResult(observed,body.operationId);
  try{await this.prune(project,context)}catch{/* pruning is housekeeping; never fail a saved commit */}
  return result;
 }
 commitResult(rows,id){const heads=this.heads(rows);if(heads.length===1&&heads[0].id!==id)throw fail('雲端已有後續版本；本次舊重試不會標成最新同步，請先開啟雲端版本。',409);if(heads.length>1)throw fail('兩端同時修改；所有版本均已保存，請選版本或另存副本。',409);return{revision:id}}
 // Keep every head plus the newest revisions; delete the rest of this project's history.
 async prune(project,context=this.context()){
  const rows=await this.revisionRows(project,context),heads=new Set(this.heads(rows).map(r=>r.id));
  const keep=new Set(heads);for(const r of [...rows].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))){if(keep.size>=LIMITS.keepRevisions)break;keep.add(r.id)}
  let removed=0;for(const r of rows)if(!keep.has(r.id)){await this.remove(r.fileId,context);removed++}return removed;
 }
 // Delete recordings no kept revision refers to. Recent uploads (<1 h) are spared: another device may be mid-sync.
 async cleanup(context=this.context()){
  const revisions=await this.listFiles('revision',null,context);let pruned=0;
  for(const p of new Set(revisions.map(f=>f.appProperties.project)))pruned+=await this.prune(p,context);
  const kept=(await this.listFiles('revision',null,context)).map(rowOf),used=new Set();
  for(const row of kept){const r=await this.readRevision(row,context);for(const c of SyncCodec.inventory(r.manifest))if(c.asset)used.add(c.asset.id)}
  const cutoff=Date.now()-3600*1000;let audio=0,freed=0;
  for(const f of await this.listFiles('audio',null,context)){if(used.has(f.appProperties.hash))continue;if(Date.parse(f.createdTime||0)>cutoff)continue;await this.remove(f.id,context);audio++;freed+=Number(f.size||0)}
  return{revisions:pruned,audio,freedBytes:freed};
 }
 async api(path,options={}){const url=new URL(path,'https://local.invalid'),context=this.context();
  if(url.pathname==='/session')return{owner:context.owner,mode:'google-drive',limits:LIMITS};
  if(url.pathname==='/projects')return this.projects();
  if(url.pathname==='/cleanup'&&options.method==='POST')return this.cleanup(context);
  if(url.pathname==='/assets/missing'&&options.method==='POST')return this.missingAssets(JSON.parse(options.body).items,context);
  const m=url.pathname.match(/^\/projects\/(.+)$/);if(m)return options.method==='POST'?this.commit(decodeURIComponent(m[1]),JSON.parse(options.body)):this.get(decodeURIComponent(m[1]),url.searchParams.get('revision'));
  const a=url.pathname.match(/^\/assets\/([a-f0-9]{64})$/);if(a&&options.method==='PUT')return this.putAsset(a[1],options.body);
  throw fail('不支援的同步操作。',400)}
}
