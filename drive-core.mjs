// Immutable Drive revision graph. No mutable "latest" file, lock or last-write-wins.
export const LIMITS={assetBytes:25*1024*1024,ownerBytes:100*1024*1024,projects:20,revisions:200,manifestBytes:2*1024*1024,historyBytes:10*1024*1024};
const APP='listening-studio-v1',ROOT='https://www.googleapis.com/drive/v3';
const fail=(message,status)=>Object.assign(Error(message),{status});
export class DriveStore{
 constructor({credential,fetch=(...args)=>globalThis.fetch(...args),ids}){this.credential=credential;this.fetch=fetch;this.ids=ids}
 context(){const c=this.credential();if(!c||c.expiresAt<=Date.now()+5000)throw fail('Google授權已到期，請按重新授權；本機內容保留。',401);return c}
 async request(url,options={},context=this.context()){
  if(this.credential()!==context)throw fail('帳號已切換，未繼續傳送。',401);if(Date.now()<(this.cooldownUntil||0))throw fail('Drive流量限制冷卻中，請稍後重試。',429);
  const r=await this.fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+context.token}});
  if(this.credential()!==context)throw fail('帳號已切換，舊帳號操作已停止。',401);
  if(r.status===401)context.expiresAt=0;if(r.status===429)this.cooldownUntil=Date.now()+Math.min(3600,Math.max(30,Number(r.headers.get('retry-after'))||30))*1000;
  if(!r.ok){let message='Google Drive暫時無法完成，請稍後重試。';if(r.status===401)message='Google授權已到期，請按重新授權。';if(r.status===403)message='Drive存取遭拒或容量／校方政策限制；沒有自動擴權。';if(r.status===429)message='Drive流量限制，請稍後重試；本機內容保留。';throw fail(message,r.status)}return r;
 }
 async listFiles(kind,project,context=this.context()){
  const safe=x=>String(x).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const q=["trashed=false","'me' in owners",`appProperties has { key='app' and value='${APP}' }`,kind?`appProperties has { key='kind' and value='${safe(kind)}' }`:null,project?`appProperties has { key='project' and value='${safe(project)}' }`:null].filter(Boolean).join(' and ');
  let all=[],token;const pages=new Set();do{const p=new URLSearchParams({q,corpora:'user',spaces:'drive',pageSize:'100',fields:'incompleteSearch,nextPageToken,files(id,name,size,createdTime,appProperties,ownedByMe)'});if(token)p.set('pageToken',token);const data=await(await this.request(ROOT+'/files?'+p,{},context)).json();if(data.incompleteSearch||!Array.isArray(data.files))throw fail('Drive清單尚不完整，未繼續寫入；請重試。',503);all.push(...data.files.filter(f=>f.ownedByMe!==false));token=data.nextPageToken;if(token){if(pages.has(token)||pages.size>=1000)throw fail('Drive分頁異常，未繼續寫入。',503);pages.add(token)}if(all.length>10000)throw fail('檔案數超過此試版檢查上限，未繼續寫入。',413)}while(token);return all;
 }
 async readFile(id,context=this.context(),limit=LIMITS.assetBytes){
  const response=await this.request(ROOT+'/files/'+encodeURIComponent(id)+'?alt=media',{},context);
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw fail('雲端檔案超過讀取上限，本機內容保留。',413)}
  if(!response.body)return new Blob([],{type:response.headers.get('content-type')||''});
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw fail('雲端檔案超過讀取上限，本機內容保留。',413)}parts.push(value)}}finally{reader.releaseLock()}
  if(this.credential()!==context)throw fail('帳號已切換，舊帳號下載未套用。',401);
  return new Blob(parts,{type:response.headers.get('content-type')||'application/octet-stream'});
 }
 async create(key,blob,properties,context=this.context()){
  const storageKey=context.owner+':'+key;let id=await this.ids.get(storageKey);
  if(!id){const data=await(await this.request(ROOT+'/files/generateIds?count=1&space=drive&type=files',{},context)).json();id=data.ids[0];await this.ids.put(storageKey,id)}
  const verify=async()=>{try{const existing=await this.readFile(id,context);if(await SyncCodec.hash(await existing.arrayBuffer())!==await SyncCodec.hash(await blob.arrayBuffer()))throw fail('同一操作檔案內容不一致，已停止。',409);return true}catch(e){if(e.status===404)return false;throw e}};
  if(await verify())return id;
  const init=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':blob.type||'application/octet-stream','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify({id,name:'聽力錄音室-'+key,mimeType:blob.type||'application/octet-stream',appProperties:{app:APP,...properties}})},context);
  const location=init.headers.get('location');const url=new URL(location||'');if(url.protocol!=='https:'||url.hostname!=='www.googleapis.com')throw fail('Drive回傳無效上傳位置。',502);
  await this.request(location,{method:'PUT',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob},context);
  if(!await verify())throw fail('上傳尚未完成。',503);return id;
 }
 async asset(hash,context=this.context()){
  const files=await this.listFiles('audio',null,context),file=files.find(f=>f.appProperties.hash===hash);if(!file)throw fail('找不到原始音訊。',404);
  const blob=await this.readFile(file.id,context);if(await SyncCodec.hash(await blob.arrayBuffer())!==hash)throw fail('原始音訊校驗失敗。',422);return blob;
 }
 async putAsset(hash,blob,context=this.context()){
  if(blob.size>LIMITS.assetBytes||await SyncCodec.hash(await blob.arrayBuffer())!==hash)throw fail('音訊大小或校驗不符。',413);
  const files=await this.listFiles('audio',null,context);const found=files.find(f=>f.appProperties.hash===hash);if(found){await this.asset(hash,context);return}
  if(files.reduce((n,f)=>n+Number(f.size||0),0)+blob.size>LIMITS.ownerBytes)throw fail('此試版音訊儲存上限已滿，不會自動升級。',413);
  await this.create('audio-'+hash,blob,{kind:'audio',hash},context);
 }
 async revisions(project,context=this.context()){
  const files=await this.listFiles('revision',project,context),rows=[];if(files.reduce((n,f)=>n+Number(f.size||0),0)>LIMITS.historyBytes)throw fail('版本資訊超過試版讀取上限，請先保留備份。',413);
  for(const f of files){const b=await this.readFile(f.id,context,LIMITS.manifestBytes);if(b.size>LIMITS.manifestBytes)throw fail('專案版本過大。',413);const r=JSON.parse(await b.text());if(r.schema!==1||r.owner!==context.owner||r.projectId!==f.appProperties.project||r.id!==f.appProperties.operation||!Array.isArray(r.parents)||r.parents.some(x=>typeof x!=='string'))throw fail('雲端版本格式不符。',422);rows.push(r)}
  const unique=new Map();for(const r of rows){if(unique.has(r.id)&&JSON.stringify(unique.get(r.id))!==JSON.stringify(r))throw fail('重複版本內容不一致。',409);unique.set(r.id,r)}return[...unique.values()];
 }
 heads(rows){const parents=new Set(rows.flatMap(r=>r.parents));return rows.filter(r=>!parents.has(r.id))}
 async projects(){const files=await this.listFiles('revision'),rows=files.map(f=>({projectId:f.appProperties.project,id:f.appProperties.operation,parents:f.appProperties.parent?[f.appProperties.parent]:[],title:f.appProperties.title||'聽力專案',updatedAt:f.createdTime||null}));const result=[];for(const id of new Set(rows.map(r=>r.projectId))){const heads=this.heads(rows.filter(r=>r.projectId===id));for(const r of new Map(heads.map(r=>[r.id,r])).values())result.push({id,revision:r.id,title:r.title,updatedAt:r.updatedAt,conflict:new Set(heads.map(r=>r.id)).size>1})}return result}
 async get(project,revision){const rows=await this.revisions(project),heads=this.heads(rows);const r=revision?rows.find(r=>r.id===revision):heads.length===1?heads[0]:null;if(!r)throw fail(heads.length>1?'有多個並行版本，請從清單選擇；每一份都已保留。':'找不到專案版本。',heads.length>1?409:404);return{manifest:r.manifest,position:r.position,revision:r.id}}
 async commit(project,body){const context=this.context(),rows=await this.revisions(project,context);const digest=await SyncCodec.hash(new TextEncoder().encode(JSON.stringify(body)));const old=rows.find(r=>r.id===body.operationId);
  if(old){if(old.digest!==digest)throw fail('重試操作內容不一致。',409);return this.commitResult(rows,old.id)}
  if(rows.length>=LIMITS.revisions)throw fail('版本數達試版上限；未覆寫舊版。',413);
  if(body.manifest.projectId!==project)throw fail('專案識別不符。',422);
  if(body.baseRevision&&!rows.some(r=>r.id===body.baseRevision))throw fail('基底版本已遺失，請保留本機副本。',409);
  const all=await this.listFiles('revision',null,context);if(!rows.length&&new Set(all.map(f=>f.appProperties.project)).size>=LIMITS.projects)throw fail('專案數達試版上限。',413);
  // Verify all immutable audio before publishing any revision manifest.
  for(const c of SyncCodec.inventory(body.manifest))if(c.asset){const b=await this.asset(c.asset.id,context);if(b.size!==c.asset.size)throw fail('音訊尚未完整上傳。',422)}
  const revision={schema:1,owner:context.owner,projectId:project,id:body.operationId,parents:body.baseRevision?[body.baseRevision]:[],digest,manifest:body.manifest,position:body.position};
  const blob=new Blob([JSON.stringify(revision)],{type:'application/json'});if(blob.size>LIMITS.manifestBytes)throw fail('專案資訊過大。',413);
  if(all.reduce((n,f)=>n+Number(f.size||0),0)+blob.size>LIMITS.historyBytes)throw fail('版本資訊達試版上限，未覆寫舊版。',413);let title=body.manifest.title;while(new TextEncoder().encode(title).length>80)title=title.slice(0,-1);
  await this.create('revision-'+body.operationId,blob,{kind:'revision',project,operation:body.operationId,parent:body.baseRevision||'',title},context);
  const observed=await this.revisions(project,context);if(!observed.some(r=>r.id===revision.id))observed.push(revision);return this.commitResult(observed,body.operationId);
 }
 commitResult(rows,id){const heads=this.heads(rows);if(heads.length===1&&heads[0].id!==id)throw fail('雲端已有後續版本；本次舊重試不會標成最新同步，請先開啟雲端版本。',409);if(heads.length>1)throw fail('兩端同時修改；所有版本均已保存，請選版本或另存副本。',409);return{revision:id}}
 async api(path,options={}){const url=new URL(path,'https://local.invalid'),context=this.context();if(url.pathname==='/session')return{owner:context.owner,mode:'google-drive',limits:LIMITS};if(url.pathname==='/projects')return this.projects();const m=url.pathname.match(/^\/projects\/(.+)$/);if(m)return options.method==='POST'?this.commit(decodeURIComponent(m[1]),JSON.parse(options.body)):this.get(decodeURIComponent(m[1]),url.searchParams.get('revision'));const a=url.pathname.match(/^\/assets\/([a-f0-9]{64})$/);if(a&&options.method==='PUT')return this.putAsset(a[1],options.body);throw fail('不支援的同步操作。',400)}
}
