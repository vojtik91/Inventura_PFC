const VERSION='v09', STORAGE_VERSION='v05';
const K_STATE='inventory_state_'+STORAGE_VERSION,K_WH='inventory_warehouse_'+STORAGE_VERSION,K_POS='inventory_position_'+STORAGE_VERSION,K_CUSTOM='inventory_custom_'+STORAGE_VERSION,K_PACK='inventory_packages_'+STORAGE_VERSION,K_PERMON='inventory_permon_v06';
const $=id=>document.getElementById(id), norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let stock=window.STOCK_DATA;
let state={},warehouse='PFC Bar',position={};
let packs=structuredClone(window.DEFAULT_PACKAGES||{});
let activePermon=null,locationOverrides={},migrations={};
let packageReturn='home', packageAnchor='';
function mergeDefaults(base,saved){const out=structuredClone(base||{});Object.entries(saved||{}).forEach(([k,v])=>out[k]={...(out[k]||{}),...(v||{})});return out}
async function loadDatabase(){
  let db=null;try{db=await window.InventoryDB?.get('main')}catch(e){console.warn('IndexedDB read failed',e)}
  if(db){
    // Skladové karty dodává aktuální verze aplikace; uživatelská inventura a kalibrace zůstávají zachované.
    stock=window.STOCK_DATA;
    state=db.state||{};warehouse=db.warehouse||'PFC Bar';position=db.position||{};
    packs=mergeDefaults(window.DEFAULT_PACKAGES,db.packs);activePermon=db.activePermon??null;locationOverrides=db.locationOverrides||{};migrations=db.migrations||{};
    migratePackageSettings();
    migrateLocationStateV09();
    await persistDatabase();
    return
  }
  stock=window.STOCK_DATA;
  state=JSON.parse(localStorage.getItem(K_STATE)||'{}');warehouse=localStorage.getItem(K_WH)||'PFC Bar';position=JSON.parse(localStorage.getItem(K_POS)||'{}');
  packs=mergeDefaults(window.DEFAULT_PACKAGES,JSON.parse(localStorage.getItem(K_PACK)||'{}'));activePermon=JSON.parse(localStorage.getItem(K_PERMON)||'null');
  migratePackageSettings();
  migrateLocationStateV09();
  await persistDatabase();
}
async function persistDatabase(){try{await window.InventoryDB?.put({schema:2,updatedAt:new Date().toISOString(),stock,state,warehouse,position,packs,activePermon,locationOverrides,migrations},'main')}catch(e){console.warn('IndexedDB write failed',e)}}
const PFC_LOCS=[{id:'sklep',name:'Jeskyně / sklep',desc:'Plné a načaté sudy s pivem',enabled:true},{id:'sklad',name:'Sklad',desc:'Basy s pivem a nealkem',enabled:true},{id:'regal',name:'Regál',desc:'Tvrdý alkohol a Red Bull',enabled:true},{id:'lednice',name:'Nealko lednice',desc:'Chlazené nealko, pivo, vybraný Spirit, prosecco a načaté BIB víno',enabled:true},{id:'vinoteka',name:'Vinotéka',desc:'Neotevřená lahvová vína mimo prosecco a nealko vína',enabled:true},{id:'box',name:'Chladicí box',desc:'Zásoby prosecca, nealko vín, BIB vína, vybraného Spiritu a lahvového piva',enabled:true}];
const DECKO_LOCS=[{id:'bar',name:'Bar / sklad Déčko',desc:'Dočasné pořadí podle kategorií',enabled:true}];
function save(){localStorage.setItem(K_STATE,JSON.stringify(state));localStorage.setItem(K_WH,warehouse);localStorage.setItem(K_POS,JSON.stringify(position));localStorage.setItem(K_CUSTOM,JSON.stringify(stock));localStorage.setItem(K_PACK,JSON.stringify(packs));localStorage.setItem(K_PERMON,JSON.stringify(activePermon));persistDatabase()}
function isPermon(x){return x.category==='Pivo Permon'}
function isKeg(x){return isPermon(x)||/\bkeg\b|sud/i.test(x.name)}
function isWeightKeg(x){return isKeg(x)&&(x.unit==='l'||x.unit==='ks')}
function isSpiritWeight(x){return x.category==='Spirit'&&x.unit==='l'}
function isBib(x){return /bib|bag[ -]?in[ -]?box/i.test(norm(x.name))}
function isBibSyrup(x){return x.category==='Nealko'&&isBib(x)}
function isBibWine(x){return x.category==='Víno'&&isBib(x)}
function isReturnable(x){return x.category==='Obaly'||/vratn|kelimek|pet lahev 2/i.test(norm(x.name))}
function isChilledSpirit(x){return ['pfc-0-bacardi','pfc-1-becherovka','pfc-2-beefeater-gin-40','pfc-18-finlandia','pfc-19-gin-pink-strawberry'].includes(x.id)}
function isNonAlcoholicWine(x){let n=norm(x.name);return /nealko|dealko|dc /.test(n)}
function isProsecco(x){return /prosecco/.test(norm(x.name))}
function isBoxBottleBeer(x){let n=norm(x.name);return /pilsner urquell 0[,.]33|radegast.*0[,.]33/.test(n)}
function pfcLocations(x){
  if(isKeg(x))return ['sklep'];
  if(isReturnable(x))return [];
  const n=norm(x.name),c=x.category;
  if(c==='Spirit')return isChilledSpirit(x)?['regal','lednice','box']:['regal'];
  if(c==='Víno'){
    if(isBibWine(x))return ['lednice','box'];
    if(isProsecco(x)||isNonAlcoholicWine(x))return ['lednice','box'];
    return ['vinoteka'];
  }
  if(c==='Pivo')return isBoxBottleBeer(x)?['sklad','lednice','box']:['sklad','lednice'];
  if(c==='Nealko'){
    if(x.id==='pfc-68-red-bull-0-25l')return ['regal','lednice'];
    if(isBibSyrup(x))return ['sklad'];
    if(/pet|kofola|coca|sprite|voda/.test(n))return ['sklad','lednice','box'];
    return ['sklad','lednice'];
  }
  if(c==='Káva')return /bianco/.test(n)?['box']:['sklad'];
  if(c==='Koloniál')return ['sklad'];
  if(c==='Nanuky'||c==='-'||c==='Mléčné výrobky a vejce')return ['box'];
  return ['sklad']
}
function oldPfcLocationsV081(x){
  if(isKeg(x))return ['sklep'];if(isReturnable(x))return [];
  const n=norm(x.name),c=x.category;
  if(c==='Spirit')return ['regal'];
  if(c==='Víno'){if(/prosecco|nealko|sparkling|dc /.test(n))return ['regal','lednice','vinoteka','box'];if(/fangalo|bib/.test(n))return ['regal','lednice'];return ['regal','lednice','vinoteka']}
  if(c==='Pivo'||c==='Pivo Permon')return ['sklad','lednice','box'];
  if(c==='Nealko'){if(/sirup|bib/.test(n))return ['sklad'];if(/pet|kofola|coca|sprite|voda/.test(n))return ['sklad','lednice','box'];return ['sklad','lednice']}
  if(c==='Káva')return /bianco/.test(n)?['box']:['sklad'];if(c==='Koloniál')return ['sklad'];if(c==='Nanuky'||c==='-'||c==='Mléčné výrobky a vejce')return ['box'];return ['sklad']
}
function migrateLocationStateV09(){
  if(migrations.v09Locations)return;
  let whState=state['PFC Bar']||{};
  (stock['PFC Bar']||[]).forEach(card=>{
    let oldLocs=oldPfcLocationsV081(card),newLocs=pfcLocations(card),removed=oldLocs.filter(l=>!newLocs.includes(l));
    let moved=0,had=false;
    removed.forEach(loc=>{let key=card.id+'@'+loc;if(whState[key]!==undefined&&whState[key]!==''){moved+=Number(whState[key])||0;had=true}delete whState[key]});
    if(had&&newLocs.length){let target=newLocs.find(l=>oldLocs.includes(l))||newLocs[0],key=card.id+'@'+target;whState[key]=(Number(whState[key])||0)+moved}
  });
  state['PFC Bar']=whState;migrations.v09Locations=true
}
function occurrencesFor(wh){let out=[];(stock[wh]||[]).forEach(card=>{if(wh==='PFC Bar'&&isPermon(card)&&activePermon!==null&&!activePermon.includes(card.id))return;(wh==='PFC Bar'?pfcLocations(card):['bar']).forEach((loc,j)=>out.push({...card,occId:card.id+'@'+loc,location:loc,occOrder:j}))});return out}
function locations(){return warehouse==='PFC Bar'?PFC_LOCS:DECKO_LOCS}function activeLocations(){return locations().filter(x=>x.enabled)}function allOcc(){let enabled=new Set(activeLocations().map(x=>x.id));return occurrencesFor(warehouse).filter(x=>enabled.has(x.location))}function locOcc(loc){return allOcc().filter(x=>x.location===loc).sort((a,b)=>a.category.localeCompare(b.category,'cs')||a.sourceOrder-b.sourceOrder)}
function value(id){return state[warehouse]?.[id]??''}function setValue(id,v){state[warehouse]??={};if(v===''||v===null||Number.isNaN(v))delete state[warehouse][id];else state[warehouse][id]=Number(v);save()}function sumCard(id){return allOcc().filter(x=>x.id===id).reduce((s,x)=>s+(Number(value(x.occId))||0),0)}function format(n){return Number(n||0).toLocaleString('cs-CZ',{maximumFractionDigits:3})}
function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));$(id).classList.remove('hidden')}
function updateHome(){document.querySelectorAll('[data-wh]').forEach(b=>b.classList.toggle('active',b.dataset.wh===warehouse));let d=allOcc().filter(x=>value(x.occId)!=='').length,t=allOcc().length;$('doneCount').textContent=d;$('leftCount').textContent=t-d;$('pct').textContent=t?Math.round(d/t*100)+' %':'0 %';$('status').textContent=`${warehouse} · ${stock[warehouse]?.length||0} karet`;$('heroTitle').textContent=`Inventura ${warehouse}`;$('heroText').textContent=warehouse==='PFC Bar'?'Jeskyně → sklad → regál → nealko lednice → vinotéka → chladicí box. Prázdné sudy a vratné obaly se nepočítají.':'Položky Déčka jsou načtené. Fyzickou mapu míst doplníme později.'}
document.querySelectorAll('[data-wh]').forEach(b=>b.addEventListener('click',()=>{warehouse=b.dataset.wh;save();updateHome()}));
function renderLocations(){$('locationCards').innerHTML=locations().map(l=>{let arr=l.enabled?locOcc(l.id):[],d=arr.filter(x=>value(x.occId)!=='').length;return `<button class="locationCard" data-loc="${l.id}"><b>${esc(l.name)}</b><span>${d} / ${arr.length}</span><small>${esc(l.desc)}</small><progress max="${arr.length||1}" value="${d}"></progress></button>`}).join('');document.querySelectorAll('.locationCard').forEach(b=>b.addEventListener('click',()=>startLocation(b.dataset.loc)))}
let currentLoc='',currentIndex=0,currentItems=[];function current(){return currentItems[currentIndex]}
function startLocation(loc,skipPermonSelection=false){if(warehouse==='PFC Bar'&&loc==='sklep'&&permonCards().length&&!skipPermonSelection){showPermonSelection(loc);return}currentLoc=loc;currentItems=locOcc(loc);currentIndex=position[warehouse]?.[loc]||0;if(currentIndex>=currentItems.length)currentIndex=0;show('quick');renderQuick(false)}
function kegTypes(x){
  let n=norm(x.name);
  if(isPermon(x))return [
    {id:'30',liters:30,label:'30 l'},
    {id:'15-narrow',liters:15,label:'15 l úzký'},
    {id:'15-wide',liters:15,label:'15 l široký'}
  ];
  if(/pilsner urquell/.test(n))return [{id:'50',liters:50,label:'50 l'},{id:'30',liters:30,label:'30 l'},{id:'15',liters:15,label:'15 l'}];
  if(/radegast/.test(n))return [{id:'50',liters:50,label:'50 l'}];
  if(/bpg|proud/.test(n))return [{id:'50',liters:50,label:'50 l'},{id:'30',liters:30,label:'30 l'},{id:'15',liters:15,label:'15 l'}];
  return [{id:'50',liters:50,label:'50 l'},{id:'30',liters:30,label:'30 l'},{id:'15',liters:15,label:'15 l'}]
}
function kegPackKey(x,typeId){return isPermon(x)?`keg:permon:${typeId}`:`keg:${x.id}:${typeId}`}
function packForKeg(x,typeId){
  let type=kegTypes(x).find(t=>t.id===String(typeId))||{id:String(typeId),liters:Number(typeId)||0,label:`${typeId} l`};
  let key=kegPackKey(x,type.id),legacy=packs['keg'+type.liters];
  packs[key]??={label:isPermon(x)?`Permon · KEG ${type.label}`:`${x.name} · KEG ${type.label}`,emptyKg:legacy?.emptyKg??'',note:''};
  return packs[key]
}
function migratePackageSettings(){
  // Všechny 30l sudy Permon mají stejný obal. Převezmi dříve uloženou hodnotu z libovolné karty.
  let shared=packs['keg:permon:30'];
  if(!shared||shared.emptyKg===''){
    let candidate=Object.entries(packs).find(([k,v])=>/^keg:pfc-.*:30$/.test(k)&&v&&v.emptyKg!==''&&v.emptyKg!=null);
    let fallback=window.DEFAULT_PACKAGES?.['keg:pfc-38-p-a-p-a-keg:30']||window.DEFAULT_PACKAGES?.['keg:pfc-71-summer-ale-keg:30'];
    packs['keg:permon:30']={label:'Permon · KEG 30 l',emptyKg:candidate?.[1]?.emptyKg??fallback?.emptyKg??'',note:''};
  }
  packs['keg:permon:15-narrow']??={label:'Permon · KEG 15 l úzký',emptyKg:'',note:'Doplnit po zvážení prázdného sudu.'};
  packs['keg:permon:15-wide']??={label:'Permon · KEG 15 l široký',emptyKg:'',note:'Doplnit po zvážení prázdného sudu.'};
}
function bottlePack(x){let key='bottle:'+x.id;packs[key]??={label:x.name,emptyG:'',fullG:'',volumeL:guessBottleVolume(x)};return packs[key]}
function bibPack(x){let key='bib:'+x.id;packs[key]??={label:x.name,emptyG:'',fullG:'',volumeL:5};return packs[key]}
function guessBottleVolume(x){let m=norm(x.name).match(/(0[\.,]\d+|1[\.,]?0?)\s*l/);if(m)return Number(m[1].replace(',','.'));if(/legendario|matusalem|pampero|republica|diplom/.test(norm(x.name)))return .7;if(/zufanek|žufanek/.test(norm(x.name)))return .5;return 1}
function convertKegResult(x,totalLiters,fullPieces,openLiters,openCapacity){
  if(x.unit==='l')return {value:totalLiters,label:`${format(totalLiters)} l`};
  let openFraction=openCapacity>0?openLiters/openCapacity:0;
  let pieces=fullPieces+openFraction;
  return {value:pieces,label:`${format(pieces)} ks`}
}
function convertBibResult(x,totalLiters,volumeL){
  if(x.unit==='l')return {value:totalLiters,label:`${format(totalLiters)} l`};
  let pieces=volumeL>0?totalLiters/volumeL:0;
  return {value:pieces,label:`${format(pieces)} ks`}
}
function renderQuick(focus=false){let x=current();if(!x){show('locations');renderLocations();return}let loc=locations().find(l=>l.id===currentLoc);$('locLabel').textContent=loc?.name||currentLoc;$('progressLabel').textContent=`${currentIndex+1} / ${currentItems.length}`;$('progress').max=currentItems.length;$('progress').value=currentItems.filter(y=>value(y.occId)!=='').length;$('place').textContent=loc?.name||currentLoc;$('name').textContent=x.name;$('meta').textContent=`${x.category} · celkem zatím ${format(sumCard(x.id))} ${x.unit}`;$('qty').value=value(x.occId);$('unit').textContent=x.unit;$('calculator').classList.add('hidden');let special=isWeightKeg(x)||isSpiritWeight(x)||isBib(x)||x.unit==='l';$('calcToggle').classList.toggle('hidden',!special);$('calcToggle').textContent=isWeightKeg(x)?'Spočítat sudy a váhu načatého KEGu':isSpiritWeight(x)?'Spočítat plné lahve a váhu načaté':isBib(x)?'Spočítat plné BIB a váhu načatého':'Přepočítat obaly a zbytek';position[warehouse]??={};position[warehouse][currentLoc]=currentIndex;save();if(focus)setTimeout(()=>$('qty').focus(),60);setTimeout(updateFloatingNext,0)}
function setCurrent(v){let x=current();if(!x)return;let s=String(v).replace(',','.');setValue(x.occId,s===''?'':Number(s));updateHome();renderQuick(false)}
function nextLocationAfter(loc){let a=activeLocations(),i=a.findIndex(x=>x.id===loc);return i>=0&&i<a.length-1?a[i+1]:null}function finishLocation(){let here=locations().find(l=>l.id===currentLoc),next=nextLocationAfter(currentLoc);$('completeTitle').textContent=`${here?.name||currentLoc} dokončeno`;$('completeText').textContent=next?`Další místo na trase: ${next.name}.`:'Dokončil jsi poslední místo této provozovny.';$('continueNext').classList.toggle('hidden',!next);if(next){$('continueNext').textContent=`Pokračovat: ${next.name}`;$('continueNext').dataset.loc=next.id}show('complete')}function move(step){if(step>0&&currentIndex>=currentItems.length-1){finishLocation();return}currentIndex=Math.max(0,Math.min(currentItems.length-1,currentIndex+step));renderQuick()}
function openCalculator(){let x=current();$('calculator').classList.remove('hidden');if(isWeightKeg(x))renderKegCalculator(x);else if(isSpiritWeight(x))renderSpiritCalculator(x);else if(isBib(x))renderBibCalculator(x);else renderSimpleCalculator(x)}
function packageLinkButton(x,type){return `<button type="button" class="secondary packageInline" data-package-type="${type}" data-package-id="${esc(x?.id||'')}">Nastavit hmotnosti obalu</button>`}
function bindPackageLink(x,type){let b=$('calculator').querySelector('[data-package-type]');if(b)b.addEventListener('click',()=>{packageReturn='quick';packageAnchor=(type==='keg'&&isPermon(x))?'keg:permon':type+':'+(x?.id||'');show('packages');renderPackages(packageAnchor)})}
function renderKegCalculator(x){
  let types=kegTypes(x),options=types.map(t=>`<option value="${t.id}">${t.label}</option>`).join('');
  $('calculator').innerHTML=`<h3>Plné sudy</h3><div class="kegSizes">${types.map(t=>`<label>${t.label}<input data-keg-count="${t.id}" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></label>`).join('')}</div><div class="calcSection"><h3>Načatý sud</h3><div class="fieldGrid"><label for="openKegType">Typ KEGu</label><select id="openKegType">${options}</select><span></span></div><div class="fieldGrid"><label for="grossKegKg">Zvážená hmotnost</label><input id="grossKegKg" type="number" inputmode="decimal" min="0" step="0.001" placeholder="0"><span>kg</span></div><div id="kegEmptyInfo" class="warning"></div>${packageLinkButton(x,'keg')}</div><button id="applySpecial" class="primary">Použít výsledek</button><small id="calcResult"></small>`;
  let recalc=()=>{
    let fullLiters=0,fullPieces=0;
    types.forEach(t=>{let count=Number($('calculator').querySelector(`[data-keg-count="${t.id}"]`).value)||0;fullLiters+=count*t.liters;fullPieces+=count});
    let selected=types.find(t=>t.id===$('openKegType').value)||types[0],gross=Number($('grossKegKg').value)||0,empty=Number(packForKeg(x,selected.id).emptyKg)||0;
    let opened=gross&&empty?Math.max(0,gross-empty):0,totalLiters=fullLiters+opened,result=convertKegResult(x,totalLiters,fullPieces,opened,selected.liters);
    $('kegEmptyInfo').textContent=empty?`Prázdný KEG ${selected.label}: ${format(empty)} kg. Načatý obsah: ${format(opened)} l.`:`Hmotnost prázdného KEGu ${selected.label} zatím není nastavena. Nastav ji v Obalech.`;
    $('calcResult').textContent=`Celkový objem: ${format(totalLiters)} l · výsledek pro Storyous: ${result.label}`;
    return result.value
  };
  $('openKegType').addEventListener('change',recalc);$('calculator').querySelectorAll('input').forEach(i=>i.addEventListener('input',recalc));$('applySpecial').addEventListener('click',()=>setCurrent(recalc()));bindPackageLink(x,'keg');recalc()
}
function renderSpiritCalculator(x){let p=bottlePack(x);if(p.approxDensityKgL==null||p.approxDensityKgL==='')p.approxDensityKgL=0.95;$('calculator').innerHTML=`<h3>${esc(x.name)}</h3><div class="fieldGrid"><label for="fullBottles">Neotevřené lahve</label><input id="fullBottles" type="number" inputmode="numeric" min="0" step="1" placeholder="0"><span>ks</span></div><div class="fieldGrid"><label for="grossBottleG">Hmotnost načaté lahve</label><input id="grossBottleG" type="number" inputmode="decimal" min="0" step="1" placeholder="0"><span>g</span></div><div id="bottleInfo" class="warning"></div>${packageLinkButton(x,'bottle')}<button id="applySpecial" class="primary">Použít výsledek</button><small id="calcResult"></small>`;let recalc=()=>{let full=Number($('fullBottles').value)||0,gross=Number($('grossBottleG').value)||0,empty=Number(p.emptyG)||0,fullG=Number(p.fullG)||0,vol=Number(p.volumeL)||0,density=Number(p.approxDensityKgL)||0.95;let opened=0,method='';if(gross&&fullG>empty&&vol){opened=Math.max(0,(gross-empty)/(fullG-empty)*vol);method='Přesný kalibrovaný přepočet';}else if(gross&&empty&&vol&&density>0){opened=Math.max(0,((gross-empty)/1000)/density);opened=Math.min(opened,vol);method='Orientační přepočet z prázdné lahve';}let total=full*vol+opened;if(fullG>empty&&vol){$('bottleInfo').innerHTML=`<b>${method||'Přesná kalibrace je připravena'}</b><br>Prázdná: ${format(empty)} g · plná: ${format(fullG)} g · objem: ${format(vol)} l${gross?` · načatá: ${format(opened)} l`:''}`;}else if(empty&&vol){$('bottleInfo').innerHTML=`<b>${method||'Orientační režim je připraven'}</b><br>Prázdná: ${format(empty)} g · objem: ${format(vol)} l · odhad hustoty: ${format(density)} kg/l${gross?` · načatá přibližně: ${format(opened)} l`:''}<br><small>Výsledek je méně přesný. Po doplnění hmotnosti plné lahve se automaticky použije přesná metoda.</small>`;}else{$('bottleInfo').textContent='Chybí hmotnost prázdné lahve nebo objem. Doplň je v Obalech.';}$('calcResult').textContent=`Výsledek pro Storyous: ${format(total)} l${method.startsWith('Orientační')?' (orientačně)':''}`;return total};$('calculator').querySelectorAll('input').forEach(i=>i.addEventListener('input',recalc));$('applySpecial').addEventListener('click',()=>setCurrent(recalc()));bindPackageLink(x,'bottle');recalc()}
function renderBibCalculator(x){let p=bibPack(x);$('calculator').innerHTML=`<h3>${esc(x.name)}</h3><div class="fieldGrid"><label for="fullBibs">Neotevřené BIB</label><input id="fullBibs" type="number" inputmode="numeric" min="0" step="1" placeholder="0"><span>ks</span></div><div class="fieldGrid"><label for="grossBibG">Hmotnost načatého BIB</label><input id="grossBibG" type="number" inputmode="decimal" min="0" step="1" placeholder="0"><span>g</span></div><div id="bibInfo" class="warning"></div>${packageLinkButton(x,'bib')}<button id="applySpecial" class="primary">Použít výsledek</button><small id="calcResult"></small>`;let recalc=()=>{let full=Number($('fullBibs').value)||0,gross=Number($('grossBibG').value)||0,empty=Number(p.emptyG)||0,fullG=Number(p.fullG)||0,vol=Number(p.volumeL)||0;let openedFraction=0;if(gross&&fullG>empty)openedFraction=Math.max(0,Math.min(1,(gross-empty)/(fullG-empty)));let totalLiters=(full+openedFraction)*vol,result=convertBibResult(x,totalLiters,vol);$('bibInfo').textContent=(empty&&fullG&&vol)?`Obal: ${format(empty)} g, plný BIB: ${format(fullG)} g, objem: ${format(vol)} l. Načatý obsah: ${format(openedFraction*vol)} l.`:'Chybí hmotnost prázdného nebo plného BIB. Nastav ji v Obalech.';$('calcResult').textContent=`Celkový objem: ${format(totalLiters)} l · výsledek pro Storyous: ${result.label}`;return result.value};$('calculator').querySelectorAll('input').forEach(i=>i.addEventListener('input',recalc));$('applySpecial').addEventListener('click',()=>setCurrent(recalc()));bindPackageLink(x,'bib');recalc()}
function renderSimpleCalculator(x){$('calculator').innerHTML=`<div class="fieldGrid"><label>Počet plných obalů</label><input id="simpleFull" type="number" min="0" step="1"><span>ks</span></div><div class="fieldGrid"><label>Objem obalu</label><input id="simpleSize" type="number" min="0" step="0.01" value="${guessBottleVolume(x)}"><span>l</span></div><div class="fieldGrid"><label>Zbytek</label><input id="simpleRem" type="number" min="0" step="1"><span>ml</span></div><button id="applySpecial" class="primary">Použít výsledek</button><small id="calcResult"></small>`;let recalc=()=>{let r=(Number($('simpleFull').value)||0)*(Number($('simpleSize').value)||0)+(Number($('simpleRem').value)||0)/1000;$('calcResult').textContent=`Výsledek pro Storyous: ${format(r)} l`;return r};$('calculator').querySelectorAll('input').forEach(i=>i.addEventListener('input',recalc));$('applySpecial').addEventListener('click',()=>setCurrent(recalc()));recalc()}
function renderPackages(anchor=''){
  let kegCards=(stock['PFC Bar']||[]).filter(isWeightKeg);
  let renderedKegKeys=new Set();
  let keg=kegCards.map(x=>{
    let fields=kegTypes(x).map(t=>{let key=kegPackKey(x,t.id);if(renderedKegKeys.has(key))return '';renderedKegKeys.add(key);let p=packForKeg(x,t.id);return `<div class="fieldGrid"><label>${esc(p.label||('Prázdný KEG '+t.label))}</label><input data-keg-key="${esc(key)}" type="number" inputmode="decimal" min="0" step="0.001" value="${esc(p.emptyKg)}"><span>kg</span></div>${p.note?`<small class="warning">${esc(p.note)}</small>`:''}`}).join('');
    return fields?`<div class="packageGroup" id="pack-keg-${isPermon(x)?'permon':esc(x.id)}"><h3>${isPermon(x)?'Permon – společné obaly':esc(x.name)}</h3><small>Hmotnost prázdného sudu je vedena podle typu obalu.</small>${fields}</div>`:''
  }).join('');
  let spirits=(stock['PFC Bar']||[]).filter(isSpiritWeight).map(x=>{let p=bottlePack(x);if(p.approxDensityKgL==null||p.approxDensityKgL==='')p.approxDensityKgL=.95;return `<div class="packageGroup" id="pack-bottle-${esc(x.id)}"><h3>${esc(x.name)}</h3><small>Plná lahev je volitelná. Bez ní se použije orientační výpočet podle hustoty.</small><div class="fieldGrid"><label>Objem lahve</label><input data-bottle="${esc(x.id)}" data-field="volumeL" type="number" min="0" step="0.01" value="${esc(p.volumeL)}"><span>l</span></div><div class="fieldGrid"><label>Prázdná lahev</label><input data-bottle="${esc(x.id)}" data-field="emptyG" type="number" min="0" step="1" value="${esc(p.emptyG)}"><span>g</span></div><div class="fieldGrid"><label>Plná neotevřená lahev (volitelné)</label><input data-bottle="${esc(x.id)}" data-field="fullG" type="number" min="0" step="1" value="${esc(p.fullG)}"><span>g</span></div><div class="fieldGrid"><label>Orientační hustota</label><input data-bottle="${esc(x.id)}" data-field="approxDensityKgL" type="number" min="0.7" max="1.3" step="0.01" value="${esc(p.approxDensityKgL)}"><span>kg/l</span></div><small class="warning">Výchozí hodnota 0,95 kg/l je provozní odhad. Plná lahev zpřesní výpočet.</small></div>`}).join('');
  let bibs=(stock['PFC Bar']||[]).filter(isBib).map(x=>{let p=bibPack(x);return `<div class="packageGroup" id="pack-bib-${esc(x.id)}"><h3>${esc(x.name)}</h3><small>Aplikace nejprve spočítá skutečný objem a pak jej převede do jednotky karty Storyous.</small><div class="fieldGrid"><label>Objem plného BIB</label><input data-bib="${esc(x.id)}" data-field="volumeL" type="number" min="0" step="0.01" value="${esc(p.volumeL)}"><span>l</span></div><div class="fieldGrid"><label>Prázdný obal</label><input data-bib="${esc(x.id)}" data-field="emptyG" type="number" min="0" step="1" value="${esc(p.emptyG)}"><span>g</span></div><div class="fieldGrid"><label>Plný neotevřený BIB</label><input data-bib="${esc(x.id)}" data-field="fullG" type="number" min="0" step="1" value="${esc(p.fullG)}"><span>g</span></div></div>`}).join('');
  $('packageRows').innerHTML=`${packageReturn==='quick'?'<button id="returnToItem" class="primary big">← Zpět k zadávání množství</button>':''}<div class="dbStatus"><b>Lokální databáze aktivní</b><small>Kalibrace, mapa a rozepsaná inventura jsou uloženy v IndexedDB tohoto telefonu.</small></div><h2>Sudové obaly</h2>${keg||'<p>Žádné položky.</p>'}<h2>Lahve Spiritu</h2>${spirits||'<p>Žádné položky.</p>'}<h2>BIB obaly</h2>${bibs||'<p>Žádné položky.</p>'}`;
  let ret=$('returnToItem');if(ret)ret.addEventListener('click',()=>{show('quick');renderQuick(false)});
  document.querySelectorAll('[data-keg-key]').forEach(inp=>inp.addEventListener('input',()=>{packs[inp.dataset.kegKey]??={label:'KEG',emptyKg:'',note:''};packs[inp.dataset.kegKey].emptyKg=inp.value===''?'':Number(inp.value);save()}));
  document.querySelectorAll('[data-bottle]').forEach(inp=>inp.addEventListener('input',()=>{let card=(stock['PFC Bar']||[]).find(x=>x.id===inp.dataset.bottle)||{id:inp.dataset.bottle,name:'',category:'Spirit'};let p=bottlePack(card);p[inp.dataset.field]=inp.value===''?'':Number(inp.value);save()}));
  document.querySelectorAll('[data-bib]').forEach(inp=>inp.addEventListener('input',()=>{let card=(stock['PFC Bar']||[]).find(x=>x.id===inp.dataset.bib)||{id:inp.dataset.bib,name:'',category:'Nealko'};let p=bibPack(card);p[inp.dataset.field]=inp.value===''?'':Number(inp.value);save()}));
  if(anchor)setTimeout(()=>{let [type,id]=anchor.split(':');let el=document.getElementById(`pack-${type}-${id}`);el?.scrollIntoView({behavior:'smooth',block:'start'})},80)
}
function permonCards(){return (stock['PFC Bar']||[]).filter(isPermon)}
function showPermonSelection(nextLoc='sklep'){let cards=permonCards();$('permonRows').innerHTML=cards.map(x=>`<label class="permonChoice"><input type="checkbox" value="${esc(x.id)}" ${activePermon?.includes(x.id)?'checked':''}><span>${esc(x.name)}</span></label>`).join('');$('permonContinue').dataset.loc=nextLoc;show('permon')}
function savePermonSelection(){activePermon=[...document.querySelectorAll('#permonRows input:checked')].map(i=>i.value);save();startLocation($('permonContinue').dataset.loc||'sklep',true)}
function categories(){return [...new Set((stock[warehouse]||[]).filter(x=>!isReturnable(x)).map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'cs'))}
function renderList(){let q=norm($('search').value),cat=$('category').value,cards=(stock[warehouse]||[]).filter(x=>!isReturnable(x)&&(!cat||x.category===cat)&&(!q||norm(x.name+' '+x.ean).includes(q)));$('rows').innerHTML=cards.map(x=>{let occ=allOcc().filter(o=>o.id===x.id),sum=sumCard(x.id),filled=occ.some(o=>value(o.occId)!=='');let breakdown=occ.map(o=>`${locations().find(l=>l.id===o.location)?.name}: ${format(value(o.occId)||0)}`).join(' · ');return `<div class="row ${filled?'filled':''}"><div><strong>${esc(x.name)}</strong><small>${esc(x.category)}</small></div><input data-card="${esc(x.id)}" value="${filled?sum:''}" inputmode="decimal"><b>${esc(x.unit)}</b><div class="breakdown">${esc(breakdown)}</div></div>`}).join('');document.querySelectorAll('[data-card]').forEach(i=>i.addEventListener('change',()=>{let occ=allOcc().filter(o=>o.id===i.dataset.card);if(occ.length){occ.forEach((o,j)=>setValue(o.occId,j===0?(i.value===''?'':Number(String(i.value).replace(',','.'))):''));renderList();updateHome()}}))}
function openList(){show('list');$('category').innerHTML='<option value="">Všechny kategorie</option>'+categories().map(c=>`<option>${esc(c)}</option>`).join('');renderList()}
function download(name,text,type='text/plain'){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function exportCsv(){let rows=[['Název','Kategorie','Množství','Jednotka']];(stock[warehouse]||[]).filter(x=>!isReturnable(x)).forEach(x=>rows.push([x.name,x.category,String(sumCard(x.id)).replace('.',','),x.unit]));download(`inventura-${warehouse}-${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n'),'text/csv')}
$('start').onclick=()=>{let first=activeLocations().find(l=>locOcc(l.id).some(x=>value(x.occId)===''))||activeLocations()[0];startLocation(first.id)};$('locationsBtn').onclick=()=>{show('locations');renderLocations()};$('packagesBtn').onclick=()=>{packageReturn='home';packageAnchor='';show('packages');renderPackages()};$('packagesBack').onclick=()=>{if(packageReturn==='quick'){show('quick');renderQuick(false)}else{show('home');updateHome()}};$('openPackages').onclick=()=>{$('drawer').close();packageReturn='home';packageAnchor='';show('packages');renderPackages()};$('locationsBack').onclick=()=>{show('home');updateHome()};$('backHome').onclick=()=>{show('locations');renderLocations()};$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('skip').onclick=()=>move(1);$('qty').oninput=e=>setCurrent(e.target.value);$('qty').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();move(1)}};$('plus').onclick=()=>setCurrent(Number(value(current().occId)||0)+1);$('minus').onclick=()=>setCurrent(Math.max(0,Number(value(current().occId)||0)-1));$('clear').onclick=()=>setCurrent('');document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>setCurrent(b.dataset.v));$('calcToggle').onclick=openCalculator;$('continueNext').onclick=()=>startLocation($('continueNext').dataset.loc);$('completeLocations').onclick=()=>{show('locations');renderLocations()};$('completeHome').onclick=()=>{show('home');updateHome()};$('listBtn').onclick=openList;$('listBack').onclick=()=>{show('home');updateHome()};$('search').oninput=renderList;$('category').onchange=renderList;$('menu').onclick=()=>$('drawer').showModal();$('close').onclick=()=>$('drawer').close();$('export').onclick=exportCsv;$('backup').onclick=()=>download('inventura-zaloha.json',JSON.stringify({version:VERSION,state,warehouse,position,packs,stock},null,2),'application/json');$('reset').onclick=()=>{if(confirm(`Vymazat rozepsanou inventuru ${warehouse}?`)){state[warehouse]={};position[warehouse]={};save();$('drawer').close();updateHome()}};

const floatingNext=$('floatingNext');
function updateFloatingNext(){
  const quickVisible=!$('quick').classList.contains('hidden');
  const vv=window.visualViewport;
  const keyboardOpen=vv?window.innerHeight-vv.height>120:document.activeElement===$('qty');
  const qtyActive=document.activeElement===$('qty');
  floatingNext.classList.toggle('hidden',!(quickVisible&&qtyActive&&keyboardOpen));
  if(vv&&quickVisible&&qtyActive&&keyboardOpen){
    const covered=Math.max(0,window.innerHeight-(vv.height+vv.offsetTop));
    floatingNext.style.bottom=`${covered+12}px`;
  }else floatingNext.style.bottom='14px';
}
floatingNext.addEventListener('click',()=>{$('qty').blur();move(1)});
$('qty').addEventListener('focus',()=>setTimeout(updateFloatingNext,80));
$('qty').addEventListener('blur',()=>setTimeout(updateFloatingNext,80));
window.visualViewport?.addEventListener('resize',updateFloatingNext);
window.visualViewport?.addEventListener('scroll',updateFloatingNext);
window.addEventListener('resize',updateFloatingNext);

$('permonContinue').onclick=savePermonSelection;$('permonBack').onclick=()=>{show('locations');renderLocations()};$('permonAll').onclick=()=>{document.querySelectorAll('#permonRows input').forEach(i=>i.checked=true)};$('permonNone').onclick=()=>{document.querySelectorAll('#permonRows input').forEach(i=>i.checked=false)};
$('csv').onchange=async e=>{let f=e.target.files[0];if(!f)return;alert('Aktualizovaný export PFC je už součástí této verze. Obecný import CSV bude doplněn v další úpravě.');e.target.value=''};
async function boot(){await loadDatabase();document.querySelectorAll('[data-wh]').forEach(b=>b.classList.toggle('active',b.dataset.wh===warehouse));updateHome();show('home')}if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');boot();
