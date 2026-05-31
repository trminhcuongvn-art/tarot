/* ============================================================
   TAROT HUYỀN BÍ — app.js (vanilla JS, no build step)
   Phụ thuộc CDN: tsParticles slim, anime.js, Howler.js (tùy chọn)
   ============================================================ */

const SUIT_SYMBOL = { wands:'🜂', cups:'🜄', swords:'🜁', pentacles:'🜃' };
// emoji minh hoạ tạm cho mặt trước (PLACEHOLDER — thay ảnh thật sau)
const SUIT_ICON = { wands:'🔥', cups:'🏆', swords:'⚔️', pentacles:'🪙' };
const MAJOR_ICON = '✨';

let DECK = [];
let mode = 'one';      // 'one' | 'three'
let soundOn = false;
let drawing = false;

const POSITIONS_3 = ['Quá Khứ','Hiện Tại','Tương Lai'];

const el = sel => document.querySelector(sel);
const $spread = () => el('#spread');
const $readings = () => el('#readings');
const $hint = () => el('#hint');

/* ---------- Sound (Howler, optional) ---------- */
let sounds = null;
function initSounds(){
  if(typeof Howl === 'undefined') return;
  // Sử dụng tiếng tổng hợp ngắn bằng WebAudio nếu không có file thật.
  // Để MVP nhẹ, ta tạo chime bằng oscillator thay cho file mp3.
}
let audioCtx = null;
function tone(freq, dur=0.5, type='sine', vol=0.18){
  if(!soundOn) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(vol, audioCtx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}
function chimeReveal(){ tone(880,0.8,'sine',0.16); setTimeout(()=>tone(1320,0.9,'sine',0.12),120); }
function whoosh(){ tone(220,0.25,'triangle',0.1); }
function shuffleSound(){ tone(160,0.18,'sawtooth',0.06); }

/* ---------- Haptic ---------- */
function vibrate(p){
  // Chrome chặn vibration trước user gesture; bỏ qua để production console sạch.
  if(!navigator.vibrate) return;
  if(navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try{ navigator.vibrate(p); }catch(e){}
}

/* ---------- Particles ---------- */
async function initParticles(){
  if(typeof tsParticles === 'undefined') return;
  await tsParticles.load({ id:'tsparticles', options:{
    fpsLimit:60,
    background:{ color:'transparent' },
    particles:{
      number:{ value:90, density:{ enable:true, area:900 } },
      color:{ value:['#D4AF37','#F5D061','#EDE9F5','#9F7AEA'] },
      shape:{ type:'circle' },
      opacity:{ value:{min:0.15,max:0.8}, animation:{ enable:true, speed:0.6 } },
      size:{ value:{min:0.4,max:2.2} },
      move:{ enable:true, speed:0.35, direction:'none', random:true, outModes:'out' }
    },
    detectRetina:true
  }});
}

/* ---------- Load deck ---------- */
async function loadDeck(){
  const res = await fetch('data/cards.json');
  DECK = await res.json();
}

/* ---------- Build a card element ---------- */
function cardEl(){
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', 'Chạm để lật lá bài Tarot');
  card.innerHTML = `
    <div class="face face-back">
      <img class="back-art" src="assets/card-back.svg" alt="Mặt sau lá bài Tarot" draggable="false" />
    </div>
    <div class="face face-front">
      <div class="inner">
        <div class="num"></div>
        <div class="card-illus">
          <img class="rws-img" alt="" loading="lazy" />
        </div>
        <div>
          <div class="cname"></div>
          <div class="cname-en"></div>
        </div>
      </div>
    </div>`;
  return card;
}

function fillFront(card, data, reversed){
  const f = card.querySelector('.face-front');
  const suitSym = data.suit ? SUIT_SYMBOL[data.suit] : '✦';
  f.querySelector('.num').textContent = (data.arcana==='major'?'• '+data.number+' •':suitSym);
  const img = f.querySelector('.rws-img');
  if(data.image){
    img.src = data.image;
    img.alt = data.name + ' — ' + data.name_vi;
    img.style.display = '';
    // fallback nếu ảnh lỗi: hiện emoji placeholder
    img.onerror = ()=>{ img.style.display='none';
      const ico = data.arcana==='major'?MAJOR_ICON:SUIT_ICON[data.suit];
      f.querySelector('.card-illus').setAttribute('data-fallback', ico); };
  } else {
    img.style.display='none';
    const ico = data.arcana==='major'?MAJOR_ICON:SUIT_ICON[data.suit];
    f.querySelector('.card-illus').setAttribute('data-fallback', ico);
  }
  f.querySelector('.cname').textContent = data.name_vi;
  f.querySelector('.cname-en').textContent = data.name;
  if(reversed) f.classList.add('reversed'); else f.classList.remove('reversed');
}

/* ---------- Reading panel ---------- */
function renderReading(data, reversed, position){
  const kws = (reversed?data.reversed_keywords:data.upright_keywords) || [];
  const meaning = reversed?data.reversed:data.upright;
  const div = document.createElement('div');
  div.className = 'reading-card';
  div.innerHTML = `
    ${position?`<div class="pos">${position}</div>`:''}
    <h3>${data.name_vi}</h3>
    <div class="cname-en" style="color:var(--muted);font-size:.7rem;letter-spacing:.1em">${data.name}</div>
    <span class="orient ${reversed?'rev':'up'}">${reversed?'NGƯỢC ⤵':'XUÔI ⤴'}</span>
    <div class="kw">${kws.map(k=>`<span>${k}</span>`).join('')}</div>
    <p class="meaning">${meaning}</p>`;
  return div;
}

/* ---------- Draw logic ---------- */
function pickCards(n){
  const pool = [...DECK];
  const out = [];
  for(let i=0;i<n;i++){
    const idx = Math.floor(Math.random()*pool.length);
    const c = pool.splice(idx,1)[0];
    out.push({ data:c, reversed: Math.random()<0.35 }); // ~35% ngược
  }
  return out;
}

async function startRitual(){
  if(drawing) return;
  drawing = true;
  $readings().innerHTML = '';
  $spread().innerHTML = '';
  $hint().textContent = 'Đang xáo bài… hãy tĩnh tâm và nghĩ về câu hỏi của bạn.';
  shuffleSound(); vibrate(30);

  const n = mode==='one'?1:3;
  const picks = pickCards(n);
  const cards = [];

  // create slots + cards face-down
  for(let i=0;i<n;i++){
    const slot = document.createElement('div');
    slot.className = 'slot';
    if(mode==='three'){
      const lbl = document.createElement('div');
      lbl.className='slot-label';
      lbl.textContent = POSITIONS_3[i];
      slot.appendChild(lbl);
    }
    const c = cardEl();
    fillFront(c, picks[i].data, picks[i].reversed);
    slot.appendChild(c);
    $spread().appendChild(slot);
    cards.push(c);
  }

  // entrance animation (anime.js if present, else CSS fallback)
  if(typeof anime !== 'undefined'){
    anime({ targets:'.card', translateY:[60,0], opacity:[0,1], rotateZ:[(-6),0],
      delay: anime.stagger(140), duration:700, easing:'easeOutCubic' });
  }

  await wait(900);
  $hint().innerHTML = mode==='one'
    ? '👆 <strong>Chạm vào lá bài</strong> để hé lộ thông điệp của vũ trụ…'
    : '👆 <strong>Lần lượt chạm từng lá</strong> để hé lộ Quá Khứ — Hiện Tại — Tương Lai…';

  // bind reveal — sequential for three, immediate clickable
  cards.forEach((c,i)=>{
    const reveal = ()=>revealCard(c, picks[i], mode==='three'?POSITIONS_3[i]:null);
    c.addEventListener('click', reveal, { once:true });
    c.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); c.click(); }
    });
  });

  // auto suspense shake loop until revealed
  cards.forEach((c,i)=> setTimeout(()=>{ if(!c.classList.contains('flipped')) c.classList.add('shake'); }, 400+i*150));
  cards.forEach(c=> c.addEventListener('animationend',()=>c.classList.remove('shake')));

  // auto-reveal sau 3s nếu user chưa click (UX mobile)
  if(mode==='one'){
    setTimeout(async ()=>{
      const c = cards[0];
      if(c && !c.classList.contains('flipped')) await revealCard(c, picks[0], null);
    }, 3000);
  }

  drawing = false;
}

async function revealCard(card, pick, position){
  if(card.dataset.revealed === '1') return;
  card.dataset.revealed = '1';
  card.setAttribute('aria-label', 'Lá bài đã lật: ' + pick.data.name_vi);
  card.classList.remove('shake');
  card.classList.add('shake');
  vibrate([20,40,30]);
  await wait(450);                 // suspense
  whoosh();
  card.classList.remove('shake');
  card.classList.add('flipped');
  await wait(450);
  chimeReveal();
  vibrate(60);
  // burst particles around card (anime.js generated dots)
  burst(card);
  // show reading
  const r = renderReading(pick.data, pick.reversed, position);
  $readings().appendChild(r);
}

function burst(card){
  const rect = card.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  for(let i=0;i<18;i++){
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:6px;height:6px;border-radius:50%;
      background:radial-gradient(circle,#F5D061,#D4AF37);box-shadow:0 0 8px #F5D061;z-index:50;pointer-events:none`;
    document.body.appendChild(dot);
    const ang = Math.random()*Math.PI*2;
    const dist = 60+Math.random()*120;
    if(typeof anime!=='undefined'){
      anime({ targets:dot, left:cx+Math.cos(ang)*dist, top:cy+Math.sin(ang)*dist,
        opacity:[1,0], scale:[1,0.2], duration:900+Math.random()*500, easing:'easeOutQuad',
        complete:()=>dot.remove() });
    } else {
      dot.style.transition='all .9s ease-out';
      requestAnimationFrame(()=>{ dot.style.left=(cx+Math.cos(ang)*dist)+'px'; dot.style.top=(cy+Math.sin(ang)*dist)+'px'; dot.style.opacity='0'; });
      setTimeout(()=>dot.remove(),950);
    }
  }
}

const wait = ms => new Promise(r=>setTimeout(r,ms));

/* ---------- UI wiring ---------- */
function setMode(m){
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===m));
  $spread().innerHTML=''; $readings().innerHTML='';
  $hint().textContent = m==='one'
    ? 'Chế độ Rút 1 lá — câu trả lời cho hôm nay.'
    : 'Chế độ Trải 3 lá — Quá Khứ • Hiện Tại • Tương Lai.';
}

function toggleSound(){
  soundOn = !soundOn;
  const btn = el('#soundBtn');
  btn.classList.toggle('off', !soundOn);
  btn.textContent = soundOn?'🔊':'🔇';
  if(soundOn){ // unlock audio context
    try{ audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); audioCtx.resume(); tone(660,0.2); }catch(e){}
  }
}

window.addEventListener('DOMContentLoaded', async ()=>{
  initParticles();
  await loadDeck();
  document.querySelectorAll('.mode-btn').forEach(b=> b.addEventListener('click',()=>setMode(b.dataset.mode)));
  el('#drawBtn').addEventListener('click', startRitual);
  el('#soundBtn').addEventListener('click', toggleSound);
  setMode('one');
  console.log('Tarot deck loaded:', DECK.length, 'cards');

  // --- Auto demo hook for screenshot testing (?auto=one|three) ---
  const params = new URLSearchParams(location.search);
  const auto = params.get('auto');
  if(auto){
    setMode(auto==='three'?'three':'one');
    await wait(300);
    await startRitual();
    await wait(1200);
    // reveal all cards programmatically
    document.querySelectorAll('.card').forEach(c=> c.click());
  }
});

/* High-end redesign: staggered reveal via IntersectionObserver */
document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item, index) => setTimeout(() => item.classList.add('in'), index * 90));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const index = Array.from(items).indexOf(entry.target);
      entry.target.style.transitionDelay = `${Math.max(index, 0) * 70}ms`;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  items.forEach(item => observer.observe(item));
});
