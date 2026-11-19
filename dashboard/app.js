(() => {
  'use strict';
  const radar = window.RADAR;
  if (!radar || !Array.isArray(radar.board) || !Array.isArray(radar.live)) return;
  const board = radar.board;
  const live = radar.live;
  const watchlist = new Set([
    'armitage-by-wintermute','axis','b14g','bittensor-dtao','clearstar','curvance','doppler-finance','ember','firelight','galaxy-curation','gami-labs','gauntlet','hive-protocol','hyperithm','infinifi','k3-capital','keyrock','lagoon','lightning-network','lofty','mezo-earn','noble','nonce-capital','onre','opentrade','plume-vaults','r25','reti-pooling','rockawayx','saturn','steakhouse-financial','symbiotic','tori-finance','tulipa-capital','tydro','upshift','usdd','valos','veda','yuzu-money'
  ]);
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const usd = value => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value));
  const compact = value => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(Number(value));
  const pct = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value)>0?'+':''}${Number(value).toFixed(2)}%`;
  const days = value => value == null ? 'Unknown' : `${value} days`;
  const ageSort = value => value == null ? -1 : value;
  const categories = [...new Set(board.map(r => r.category || 'Uncategorised'))].sort((a,b)=>a.localeCompare(b));
  const chains = [...new Set(board.flatMap(r => r.chains || []))].sort((a,b)=>a.localeCompare(b));
  const categorySelect = $('#category');
  categories.forEach(v => categorySelect.add(new Option(v,v)));
  chains.forEach(v => $('#chain').add(new Option(v,v)));
  $('#protocol-count').textContent = String(board.length);
  $('#updated').textContent = radar.generated ? `Snapshot · ${radar.generated}` : 'Static snapshot';
  const boardSection=$('.board-section'), liveSection=$('.live-section');
  const tabs=document.createElement('nav'); tabs.className='view-tabs'; tabs.setAttribute('aria-label','Radar views');
  tabs.innerHTML='<button type="button" class="view-tab active" aria-selected="true" data-view="board">Protocol board</button><button type="button" class="view-tab" aria-selected="false" data-view="live">Live-token view <span>24</span></button>';
  $('.intro').after(tabs);
  tabs.addEventListener('click',e=>{const btn=e.target.closest('[data-view]');if(!btn)return;const isLive=btn.dataset.view==='live';boardSection.hidden=isLive;liveSection.hidden=!isLive;tabs.querySelectorAll('.view-tab').forEach(t=>{const active=t===btn;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));});});
  const ageHeader=document.querySelector('[data-sort="change"]');
  if(ageHeader){ageHeader.dataset.sort='age';ageHeader.firstChild.textContent='Age ';}

  let sortKey = 'rank', sortDir = 1, selected = null;
  const filters = {search:$('#search'), category:categorySelect, chain:$('#chain'), watch:$('#watch-only')};
  function visibleRows(){
    const q=filters.search.value.trim().toLocaleLowerCase(), cat=filters.category.value, chain=filters.chain.value;
    const rows=board.filter(r=>{
      if(cat && (r.category || 'Uncategorised')!==cat) return false;
      if(chain && !(r.chains||[]).includes(chain)) return false;
      if(filters.watch.checked && !watchlist.has(r.slug)) return false;
      return !q || `${r.name} ${r.slug}`.toLocaleLowerCase().includes(q);
    });
    const value = r => sortKey==='age' ? ageSort(r.age_days) : sortKey==='value' ? r.implied_value_usd : sortKey==='chains' ? (r.chains||[]).join(', ') : r[sortKey];
    rows.sort((a,b)=>{
      const x=value(a),y=value(b);
      if(typeof x==='number' || typeof y==='number') return ((Number(x)||0)-(Number(y)||0))*sortDir;
      return String(x??'').localeCompare(String(y??''),undefined,{sensitivity:'base',numeric:true})*sortDir;
    });
    return rows;
  }
  function drawBoard(){
    const rows=visibleRows();
    $('#rows').innerHTML=rows.map(r=>`<tr tabindex="0" data-slug="${esc(r.slug)}" aria-label="Open details for ${esc(r.name)}"><td class="rank">${r.rank}</td><td class="protocol">${esc(r.name)}<small>${esc(r.slug)}</small></td><td>${esc(r.category||'Uncategorised')}</td><td class="chains" title="${esc((r.chains||[]).join(', '))}">${esc((r.chains||[]).slice(0,3).join(', '))}${(r.chains||[]).length>3?` +${r.chains.length-3}`:''}</td><td>${compact(r.tvl_usd)}</td><td class="${Number(r.change_7d)>=0?'positive':'negative'}">${pct(r.change_7d)}</td><td class="value">${compact(r.implied_value_usd)}</td><td class="watch-head">${watchlist.has(r.slug)?'<span class="star" aria-label="Watchlist">★</span>':''}</td></tr>`).join('');
    $('#empty').hidden=rows.length!==0;
    $('#result-count').textContent=`${rows.length} / ${board.length} protocols`;
    document.querySelectorAll('[data-sort]').forEach(btn=>{
      const active=btn.dataset.sort===sortKey;
      btn.querySelector('span').textContent=active?(sortDir===1?'↑':'↓'):'';
      btn.setAttribute('aria-sort',active?(sortDir===1?'ascending':'descending'):'none');
    });
  }
  function detail(row){
    selected=row;
    const m=row.model||{};
    $('#detail-content').innerHTML=`<div class="detail-head"><span class="detail-rank">Rank ${row.rank}${watchlist.has(row.slug)?' · Watchlist':''}</span><h2 id="detail-title">${esc(row.name)}</h2><div class="detail-slug">${esc(row.slug)}</div><div class="detail-value"><div><span>Implied value</span><b>${usd(row.implied_value_usd)}</b></div><div><span>Protocol TVL</span><b>${usd(row.tvl_usd)}</b></div></div></div><dl class="detail-grid"><div><dt>Category</dt><dd>${esc(row.category||'Uncategorised')}</dd></div><div><dt>Chain${(row.chains||[]).length===1?'':'s'}</dt><dd>${esc((row.chains||[]).join(', ')||'—')}</dd></div><div><dt>Seven-day change</dt><dd>${pct(row.change_7d)}</dd></div><div><dt>Age</dt><dd>${days(row.age_days)}</dd></div><div><dt>Listed at</dt><dd>${esc(row.listed_at||'Unknown')}</dd></div><div><dt>Slug</dt><dd>${esc(row.slug)}</dd></div></dl><h3>Model breakdown</h3><div class="model-list"><div class="model-item"><span>Category multiple</span><b>${Number.isFinite(m.multiple)?Number(m.multiple).toFixed(4)+'×':'—'}</b></div><div class="model-item"><span>Growth input</span><b>${pct(m.growth_pct)}</b></div><div class="model-item"><span>Growth multiplier</span><b>${Number.isFinite(m.growth_multiplier)?Number(m.growth_multiplier).toFixed(4)+'×':'—'}</b></div><div class="model-item"><span>Maturity multiplier</span><b>${Number.isFinite(m.maturity_multiplier)?Number(m.maturity_multiplier).toFixed(4)+'×':'—'}</b></div><div class="model-item"><span>Age used</span><b>${days(m.age_days)}</b></div><div class="model-item"><span>Calculation</span><b>TVL × multiple × growth × maturity</b></div></div><h3>Farm steps · ${Array.isArray(row.farm_steps)?row.farm_steps.length:0}</h3><ol class="farm-list">${(row.farm_steps||[]).slice(0,6).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`;
    $('#detail').hidden=false; $('#scrim').hidden=false; document.body.style.overflow='hidden'; $('#detail-close').focus();
  }
  function closeDetail(){ $('#detail').hidden=true; $('#scrim').hidden=true; document.body.style.overflow=''; if(selected){const row=document.querySelector(`[data-slug="${CSS.escape(selected.slug)}"]`);if(row)row.focus();} selected=null; }
  document.querySelectorAll('[data-sort]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.sort;
    if(sortKey===key) sortDir*=-1; else {sortKey=key;sortDir=key==='rank'?1:1;}
    drawBoard();
  }));
  Object.values(filters).forEach(control=>control.addEventListener(control===filters.search?'input':'change',drawBoard));
  $('#rows').addEventListener('click',e=>{const tr=e.target.closest('tr[data-slug]');if(tr)detail(board.find(r=>r.slug===tr.dataset.slug));});
  $('#rows').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-slug]')){e.preventDefault();detail(board.find(r=>r.slug===e.target.dataset.slug));}});
  $('#detail-close').addEventListener('click',closeDetail); $('#scrim').addEventListener('click',closeDetail);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#detail').hidden)closeDetail();});

  $('#live-grid').innerHTML=live.slice(0,24).map((r,i)=>`<article class="live-card"><div class="live-top"><span class="live-name">${esc(r.name)}</span><span class="live-rank">${String(i+1).padStart(2,'0')}</span></div><div class="live-category">${esc(r.category||'Uncategorised')} · ${esc((r.chains||[]).join(', ')||'Chain unknown')}</div><div class="live-values"><div><span>Market cap</span><b>${compact(r.mcap_usd)}</b></div><div><span>TVL</span><b>${compact(r.tvl_usd)}</b></div></div><div class="live-change ${Number(r.change_7d)>=0?'positive':'negative'}">7D ${pct(r.change_7d)}</div></article>`).join('');
  drawBoard();
})();
