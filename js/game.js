'use strict';
// полифилл roundrect (старые браузеры)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

// ловец ошибок (показывает на экране)
const DEBUG = /[?&]debug/.test(location.search);
window.addEventListener('error', function (e) {
  var b = document.getElementById('errBox');
  if (!DEBUG) return;
  if (b) { b.style.display = 'block';
    b.textContent = 'ОШИБКА: ' + e.message + '\nстрока ' + e.lineno + ' файла ' + (e.filename || '').split('/').pop(); }
});
window.addEventListener('unhandledrejection', function (e) {
  var b = document.getElementById('errBox');
  if (!DEBUG) return;
  if (b) { b.style.display = 'block';
    b.textContent = 'ОШИБКА SDK: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)).slice(0, 120); }
});

// утилиты
const $ = function (id) { return document.getElementById(id); };
const rand = function (a, b) { return a + Math.random() * (b - a); };
const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
function bind(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
// имена игроков приходят снаружи - экранируем перед вставкой в html
function esc(str) { return String(str).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

// облачное сохранение (хранилище вк): прогресс не пропадает при смене телефона
var cloudTimer = null;
const CLOUD_KEYS = ['owned', 'ownedMaps', 'crystals', 'best', 'totalGems', 'totalRuns',
  'skin', 'map', 'missions_v1', 'daily_v1', 'ach_v1', 'tut'];
function cloudSave() {
  if (!VK.ready) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(function () {
    const blob = {};
    CLOUD_KEYS.forEach(function (k) { blob[k] = store.get(k, null); });
    VK.saveCloud(blob);
  }, 1500);
}
function cloudLoad() {
  VK.loadCloud(function (c) {
    if (!c) { cloudSave(); return; }
    // числа - берём большее, списки - объединяем
    ['crystals', 'best', 'totalGems', 'totalRuns'].forEach(function (k) {
      store.set(k, Math.max(store.get(k, 0), c[k] || 0));
    });
    ['owned', 'ownedMaps', 'ach_v1'].forEach(function (k) {
      const base = { owned: ['neon'], ownedMaps: ['city'], ach_v1: [] };
      const u = (store.get(k, base[k]) || []).slice();
      (c[k] || []).forEach(function (x) { if (u.indexOf(x) === -1) u.push(x); });
      store.set(k, u);
    });
    ['missions_v1', 'daily_v1', 'skin', 'map', 'tut'].forEach(function (k) {
      if (store.get(k, null) === null && c[k] != null) store.set(k, c[k]);
    });
    owned = store.get('owned', ['neon']); ownedMaps = store.get('ownedMaps', ['city']);
    selected = store.get('skin', 'neon'); mapId = store.get('map', 'city');
    crystals = store.get('crystals', 0); best = store.get('best', 0);
    totalGems = store.get('totalGems', 0); totalRuns = store.get('totalRuns', 0);
    renderRoad(); updateHud(); updateRank(); renderDaily(); renderMissions(); renderMapButtons();
  });
}

// награды за достижения
const ACHS = [
  { id: 'a_first', ru: 'Первый заезд',           en: 'First run',          reward: 20,  ok: function () { return totalRuns >= 1; } },
  { id: 'a_500',   ru: 'Набери 500 очков',       en: 'Score 500',          reward: 60,  ok: function () { return best >= 500; } },
  { id: 'a_2000',  ru: 'Набери 2000 очков',      en: 'Score 2000',         reward: 200, ok: function () { return best >= 2000; } },
  { id: 'a_gems',  ru: 'Собери 300 кристаллов',  en: 'Collect 300 gems',   reward: 100, ok: function () { return totalGems >= 300; } },
  { id: 'a_runs',  ru: 'Сыграй 50 заездов',      en: 'Play 50 runs',       reward: 120, ok: function () { return totalRuns >= 50; } },
  { id: 'a_near',  ru: '10 «впритирку» за заезд', en: '10 near misses in a run', reward: 80, ok: function () { return runStats.near >= 10; } },
  { id: 'a_police', ru: 'Обгони 5 полицейских за заезд', en: 'Pass 5 police cars in a run', reward: 100, ok: function () { return runStats.police >= 5; } },
  { id: 'a_cars',  ru: 'Купи 3 машины',          en: 'Own 3 vehicles',     reward: 90,  ok: function () { return owned.length >= 3; } }
];
function checkAchs() {
  const got = store.get('ach_v1', []); let gain = 0; const names = [];
  ACHS.forEach(function (a) {
    if (got.indexOf(a.id) === -1 && a.ok()) { got.push(a.id); gain += a.reward; names.push(a[LANG] || a.en); }
  });
  if (!gain) return;
  store.set('ach_v1', got);
  crystals += gain; store.set('crystals', crystals); updateHud();
  setTimeout(function () { toast('🏅 ' + names.join(', ') + ' +💎' + gain); }, 900);
}
function renderAchs() {
  const got = store.get('ach_v1', []); let h = '';
  ACHS.forEach(function (a) {
    const done = got.indexOf(a.id) !== -1;
    h += '<div class="mRow" style="opacity:' + (done ? 1 : .55) + '"><span style="flex:1">' + (done ? '✅ ' : '🔒 ') +
      (a[LANG] || a.en) + '</span><span class="mRew">💎' + a.reward + '</span></div>';
  });
  $('achList').innerHTML = h;
}

let toastTimer = null;
function toast(txt) {
  const t = $('toast');
  t.textContent = txt;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
}

// хранилище
const store = {
  get: function (k, d) {
    try { const v = localStorage.getItem('neon_' + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem('neon_' + k, JSON.stringify(v)); } catch (e) {} cloudSave(); }
};

// транспорт (машины и мотоциклы)
const VEHICLES = [
  { id: 'neon',   type: 'car',  name: { ru: 'Неон',       en: 'Neon' },      price: 0,    body: '#0ff', glow: '#0ff', win: '#050014' },
  { id: 'flame',  type: 'car',  name: { ru: 'Пламя',      en: 'Flame' },     price: 100,  body: '#ff5a00', glow: '#ff2200', win: '#2b0500' },
  { id: 'toxic',  type: 'car',  name: { ru: 'Яд',         en: 'Toxic' },     price: 250,  body: '#39ff14', glow: '#00ff88', win: '#031a00' },
  { id: 'moto1',  type: 'bike', name: { ru: 'Мото Неон',  en: 'Neon Bike' }, price: 300,  body: '#0ff', glow: '#0ff', win: '#050014' },
  { id: 'gold',   type: 'car',  name: { ru: 'Золото',     en: 'Gold' },      price: 500,  body: '#ffd700', glow: '#ffaa00', win: '#1a1200' },
  { id: 'moto2',  type: 'bike', name: { ru: 'Мото Пламя', en: 'Flame Bike' }, price: 700, body: '#ff5a00', glow: '#ff2200', win: '#2b0500' },
  { id: 'violet', type: 'car',  name: { ru: 'Пульсар',    en: 'Pulsar' },    price: 1000, body: '#b000ff', glow: '#ff00ff', win: '#12001a', pulse: true },
  { id: 'ghost',  type: 'car',  name: { ru: 'Призрак',    en: 'Ghost' },     price: 1600, body: '#dfe4ff', glow: '#8090ff', win: '#101024', ghost: true }
];
let owned = store.get('owned', ['neon']);
let selected = store.get('skin', 'neon');
let crystals = store.get('crystals', 0);
let totalGems = store.get('totalGems', 0);
let totalRuns = store.get('totalRuns', 0);
let runShield = false, runMagnet = false, runSlow = 0, runNitro = 0, runDouble = 0;
let lastAdT = Date.now(), firstRun = false, flash = 0;
let adRevived = false;   // возрождение за рекламу - один раз за заезд
let beatFlag = false;    // уже показали 'новый рекорд' в этом заезде
let invincible = 0;              // кадры неуязвимости после возрождения
let revives = 0;                 // возрождения в текущем заезде
let shake = 0;                   // тряска экрана при взрыве
let gemCombo = 0, gemComboT = 0; // комбо за кристаллы
let pickups = [], floats = [];   // пикапы способностей и всплывающие надписи
let runStats = { score: 0, gems: 0, near: 0, police: 0 };
let gemsCounted = 0;             // сколько кристаллов заезда уже попало в общий счётчик
let runTotalEarned = 0;          // всего заработано за заезд (для кнопки x2)
let doubled = false;             // x2 за рекламу - один раз за заезд
let lastScore = 0, runId = 0;

// ранги игрока
const RANKS = [
  { min: 0,    ru: 'Новичок',          en: 'Rookie' },
  { min: 100,  ru: 'Уличный гонщик',   en: 'Street Racer' },
  { min: 300,  ru: 'Неоновый волк',    en: 'Neon Wolf' },
  { min: 600,  ru: 'Профи',            en: 'Pro' },
  { min: 1000, ru: 'Король неона',     en: 'Neon King' },
  { min: 2000, ru: '🌟 ЛЕГЕНДА',       en: '🌟 LEGEND' }
];
function currentRank() {
  let r = RANKS[0];
  for (let i = 0; i < RANKS.length; i++) if (best >= RANKS[i].min) r = RANKS[i];
  return r;
}
function updateRank() {
  const el = $('rankLbl'); if (!el) return;
  el.textContent = '🏆 ' + T().rank + ': ' + (currentRank()[LANG] || currentRank().en) + ' · ' + T().record + best;
}
function currentSkin() {
  for (let i = 0; i < VEHICLES.length; i++) if (VEHICLES[i].id === selected) return VEHICLES[i];
  return VEHICLES[0];
}

// карты (цвета, скорость и музыка свои)
const MAPS = [
  { id: 'city',  name: { ru: 'Неон-Сити', en: 'Neon City' }, price: 0,   bg: '#050014', stars: '#ffffff88', hue: [280, 340], road: '#00ffff', music: 'city',  speedMul: 1 },
  { id: 'space', name: { ru: 'Космос',    en: 'Space' },     price: 400, bg: '#000208', stars: '#aac8ff66', hue: [180, 240], road: '#88aaff', music: 'space', speedMul: 1.05 },
  { id: 'lava',  name: { ru: 'Лава',      en: 'Lava' },      price: 800, bg: '#140400', stars: '#ff880088', hue: [0, 40],    road: '#ff6600', music: 'lava',  speedMul: 1.1 },
  { id: 'synth', name: { ru: 'Синтвейв',  en: 'Synthwave' }, price: 1200, bg: '#160024', stars: '#ff9dff55', hue: [280, 330], road: '#ff2d95', music: 'synth', speedMul: 1.08 }
];
let ownedMaps = store.get('ownedMaps', ['city']);
let mapId = store.get('map', 'city');
function currentMap() {
  for (let i = 0; i < MAPS.length; i++) if (MAPS[i].id === mapId) return MAPS[i];
  return MAPS[0];
}

// способности (пикапы на трассе)
const ABILITIES = [
  { id: 'shield', icon: '🛡️' },
  { id: 'magnet', icon: '🧲' },
  { id: 'star',   icon: '⭐' },
  { id: 'slow',   icon: '⏱️' },
  { id: 'nitro',  icon: '🚀' },
  { id: 'x2',     icon: '💰' }
];
function reviveCost() { return 40 * Math.pow(2, revives); }
function addFloat(x, y, txt, c) { floats.push({ x: x, y: y, txt: txt, c: c || '#fff', life: 1 }); }
function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

// задания (удержание игроков)
const MISSION_DEFS = [
  { id: 'm_score',    ru: 'Набери {n} очков за заезд',   en: 'Score {n} in one run',     targets: [250, 600, 1200], reward: 50,  type: 'run',   key: 'score' },
  { id: 'm_gems',     ru: 'Собери {n} кристаллов',       en: 'Collect {n} gems per run', targets: [8, 18, 30],    reward: 40,  type: 'run',   key: 'gems' },
  { id: 'm_near',     ru: '{n} «впритирку» проходов',    en: '{n} near misses',          targets: [4, 9, 16],     reward: 45,  type: 'run',   key: 'near' },
  { id: 'm_runs',     ru: 'Заездов сыграно: {n}',          en: 'Play {n} runs',            targets: [3, 10, 25],    reward: 35,  type: 'total', key: 'runs' },
  { id: 'm_crystals', ru: 'Заработай {n} кристаллов',    en: 'Earn {n} total gems',      targets: [60, 200, 500], reward: 55,  type: 'total', key: 'gems' }
];
function renderMissions() {
  const box = $('missions'); if (!box) return;
  const st = store.get('missions_v1', {});
  let h = '<div class="mTitle">🎯 ' + (LANG === 'ru' ? 'ЗАДАНИЯ' : 'MISSIONS') + '</div>';
  let any = false;
  for (let i = 0; i < MISSION_DEFS.length; i++) {
    const def = MISSION_DEFS[i];
    const cur = st[def.id] || { lvl: 0, prog: 0 };
    if (cur.lvl >= def.targets.length) continue;
    any = true;
    const target = def.targets[cur.lvl];
    let prog = cur.prog;
    if (def.type === 'total') prog = def.key === 'runs' ? totalRuns : totalGems;
    prog = Math.min(prog, target);
    const txt = (LANG === 'ru' ? def.ru : def.en).replace('{n}', target);
    h += '<div class="mRow"><span style="flex:1">' + txt + '</span>' +
      '<div class="mBar"><div class="mFill" style="width:' + Math.round(prog / target * 100) + '%"></div></div>' +
      '<span class="mRew">💎' + def.reward + '</span></div>';
  }
  box.innerHTML = any ? h : '<div class="mTitle">🎉 ' + (LANG === 'ru' ? 'Все задания выполнены!' : 'All missions done!') + '</div>';
}
function checkMissions() {
  const st = store.get('missions_v1', {});
  let changed = false, earned = 0;
  for (let i = 0; i < MISSION_DEFS.length; i++) {
    const def = MISSION_DEFS[i];
    const cur = st[def.id] || { lvl: 0, prog: 0 };
    if (cur.lvl >= def.targets.length) continue;
    const val = def.type === 'run' ? runStats[def.key]
      : (def.key === 'runs' ? totalRuns : totalGems);
    cur.prog = Math.max(cur.prog, val);
    // если набрал сразу много - закрываем несколько уровней подряд
    while (cur.lvl < def.targets.length && cur.prog >= def.targets[cur.lvl]) {
      earned += def.reward; cur.lvl++; changed = true;
    }
    st[def.id] = cur;
  }
  store.set('missions_v1', st);
  if (changed) {
    crystals += earned; store.set('crystals', crystals); updateHud();
    toast((LANG === 'ru' ? '🎯 Задание выполнено! +💎' : '🎯 Mission complete! +💎') + earned);
    beep(660, .1, 'sine'); setTimeout(function () { beep(880, .1, 'sine'); }, 90);
    setTimeout(function () { beep(1100, .12, 'sine'); }, 180);
  }
}

// ежедневный бонус
function renderDaily() {
  const btn = $('dailyBtn'); if (!btn) return;
  const today = new Date().toDateString();
  const data = store.get('daily_v1', { last: null, streak: 0 });
  if (data.last === today) { btn.style.display = 'none'; return; }
  const yest = new Date(Date.now() - 864e5).toDateString();
  const streak = (data.last === yest) ? data.streak + 1 : 1;
  const amount = 40 + (streak - 1) * 20;
  btn.style.display = 'inline-block';
  btn.textContent = '🎁 +' + amount + ' 💎 · ' + (LANG === 'ru' ? 'серия' : 'streak') + ' ' + streak + '🔥';
}
bind('dailyBtn', function () {
  const today = new Date().toDateString();
  const data = store.get('daily_v1', { last: null, streak: 0 });
  if (data.last === today) return;
  const yest = new Date(Date.now() - 864e5).toDateString();
  const streak = (data.last === yest) ? data.streak + 1 : 1;
  const amount = 40 + (streak - 1) * 20;
  crystals += amount; store.set('crystals', crystals);
  store.set('daily_v1', { last: today, streak: streak });
  updateHud(); renderDaily(); renderSkinsIfOpen();
  toast('🎁 +' + amount + ' 💎!');
  beep(523, .1, 'sine'); setTimeout(function () { beep(659, .1, 'sine'); }, 90);
  setTimeout(function () { beep(784, .12, 'sine'); }, 180);
});
function renderSkinsIfOpen() {
  if (!$('skins').classList.contains('hidden')) renderSkins();
}

// сложность
const DIFFS = {
  easy:   { label: 'ЛЕГКО',  base: 3.2, max: 9,  gap: 46, growth: 0.035 },
  normal: { label: 'НОРМАЛ', base: 4.0, max: 13, gap: 38, growth: 0.05 },
  hard:   { label: 'СЛОЖНО', base: 5.2, max: 16, gap: 30, growth: 0.065 }
};
let difficulty = store.get('diff', 'normal');
if (!DIFFS[difficulty]) difficulty = 'normal';   // в сохранении могло остаться мусорное значение

// состояние
const S = { MENU: 0, PLAY: 1, OVER: 2, PAUSE: 3 };
let state = S.MENU;
let score = 0, best = store.get('best', 0), speed = 4, frame = 0;
let muted = store.get('muted', false);
let paused = false;
let runEarned = 0;

const cvs = $('game'), ctx = cvs.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 1, FU = 1;
let FX = 0, FW = 0;   // левый край и ширина игровой колонки
let roadCan = null, roadPat = 70;      // предрендер дороги (нет setLineDash каждый кадр)
let roadOff = 0;
function renderRoad() {
  roadPat = 70 * U;
  roadCan = document.createElement('canvas');
  roadCan.width = Math.max(1, Math.round(FW * DPR));
  roadCan.height = Math.max(1, Math.round(roadPat * 2 * DPR));
  const rc = roadCan.getContext('2d');
  rc.setTransform(DPR, 0, 0, DPR, 0, 0);
  rc.clearRect(0, 0, FW, roadPat * 2);
  rc.strokeStyle = currentMap().road + '55'; rc.lineWidth = 4 * U;
  rc.setLineDash([26 * U, 44 * U]);
  for (let y = -roadPat; y < roadPat * 2 + roadPat; y += roadPat) {
    rc.lineDashOffset = 0;
    rc.beginPath(); rc.moveTo(24 * U, y); rc.lineTo(24 * U, y + roadPat * 3); rc.stroke();
    rc.beginPath(); rc.moveTo(FW - 24 * U, y); rc.lineTo(FW - 24 * U, y + roadPat * 3); rc.stroke();
  }
  rc.setLineDash([]);
}
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  /* на больших экранах ограничиваем DPR — иначе тяжелый кадр и лаги */
  const raw = window.devicePixelRatio || 1;
  DPR = Math.min(raw, (W * H > 1400000) ? 1.5 : 2);
  cvs.width = Math.max(1, Math.round(W * DPR));
  cvs.height = Math.max(1, Math.round(H * DPR));
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  /* U — масштаб ТОЛЬКО по ширине: пропорции игры одинаковы на любом экране */
  // игра идёт в колонке по центру: на телефоне во всю ширину, на ПК - узкая полоса
  const oldFW = FW || W;
  FW = Math.min(W, Math.max(320, Math.round(H * 0.62)));
  FX = Math.round((W - FW) / 2);
  document.documentElement.style.setProperty('--fx', FX + 'px');
  const k = FW / oldFW;
  U = Math.max(0.5, FW / 430);
  if (k !== 1) {
    // экран поменялся прямо во время заезда - подтягиваем всё что уже летит
    [obstacles, gems, pickups].forEach(function (list) {
      list.forEach(function (it) {
        ['x', 'baseX', 'w', 'h', 'r'].forEach(function (p) { if (it[p]) it[p] *= k; });
        if (it.move) it.move.amp *= k;
      });
    });
    car.x *= k; car.tx *= k;
  }
  FU = clamp(U, 0.6, 2.6);               // масштаб шрифтов/иконок (с ограничением)
  renderRoad();
  car.tx = clamp(car.tx, 30 * U, FW - 30 * U);
  if (state !== S.PLAY) { car.x = car.tx; car.y = H - Math.max(H * 0.2, 60 * U); }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

const car = { x: 0, y: 0, w: 52, h: 80, tx: 0, ty: 0 };
let obstacles = [], gems = [], particles = [], stars = [];
let touchMode = false, lastTouchT = 0;
resize();
for (let i = 0; i < 70; i++) {
  stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + .5, v: Math.random() * .5 + .1 });
}
car.x = car.tx = FW / 2; car.y = car.ty = H - Math.max(H * 0.2, 60 * U);
function applySkinSize() {
  const veh = currentSkin();
  car.w = (veh.type === 'bike' ? 36 : 52) * U;
  car.h = (veh.type === 'bike' ? 74 : 80) * U;
}

// локализация (язык определяется через sdk)
let LANG = 'ru';
const I18N = {
  ru: {
    tagline: 'Уворачивайся, собирай кристаллы, выполняй задания!',
    easy: 'ЛЕГКО', normal: 'НОРМАЛ', hard: 'СЛОЖНО',
    play: 'ИГРАТЬ', cars: 'ГАРАЖ', top10: 'РЕЙТИНГ',
    ctrlHint: '👆 Веди пальцем, мышью или стрелками ← →',
    skinsTitle: 'ВЫБОР МАШИНЫ', back: '← НАЗАД',
    lbTitle: 'МОИ РЕКОРДЫ', lbLocal: 'Твои лучшие заезды на этом устройстве',
    lbEmpty: 'Пока пусто — сыграйте первым!',
    pauseTitle: 'ПАУЗА', resume: 'ПРОДОЛЖИТЬ', pRetry: 'ЗАНОВО', pMenu: 'В МЕНЮ',
    record: 'Рекорд: ', newRecord: '🏆 Новый рекорд!',
    retry: 'ЕЩЁ РАЗ', toMenu: 'В МЕНЮ',
    selected: '✔ ВЫБРАНО', choose: 'ВЫБРАТЬ', playerName: 'Игрок',
    shield: 'ЩИТ!', magnet: 'МАГНИТ!', star: '+25', slow: 'ЗАМЕДЛЕНИЕ!', nitro: 'НИТРО! ×3', rank: 'Ранг',
    revive: 'ВОЗРОДИТЬСЯ', nearMiss: 'РЕЗКО!', combo: 'КОМБО ×',
    adRevive: '📺 ВОЗРОДИТЬСЯ ЗА РЕКЛАМУ', adFail: 'Реклама сейчас недоступна', gems2: '×2 КРИСТАЛЛЫ!', tutorial: 'Веди пальцем влево-вправо',
    abilHint: '🛡️ Щит, 🧲 Магнит, ⏱️ Замедление и 🚀 Нитро падают на трассу!',
    reviveHint: 'Продолжи заезд с того же места',
    noCrystals: 'Не хватает кристаллов!',
    missions: 'ЗАДАНИЯ', dailyStreak: 'серия',
    shareBtn: '📣 ПОДЕЛИТЬСЯ', inviteBtn: '👥 ПОЗВАТЬ ДРУЗЕЙ',
    adDouble: '📺 ×2 КРИСТАЛЛЫ (+{n}) ЗА РЕКЛАМУ', doubledMsg: 'Кристаллы удвоены! +💎',
    hello: 'Привет, ', you: 'Вы', shared: 'Опубликовано на стене!',
    shareText: 'Я набрал {n} очков в «Неоновом Гонщике»! Сможешь побить?',
    inviteText: 'Заходи в «Неоновый Гонщик» - гоняем наперегонки!'
  },
  en: {
    tagline: 'Dodge, collect crystals, complete missions!',
    easy: 'EASY', normal: 'NORMAL', hard: 'HARD',
    play: 'PLAY', cars: 'GARAGE', top10: 'RANKING',
    ctrlHint: '👆 Drag with finger, mouse, or ← → keys',
    skinsTitle: 'CHOOSE YOUR CAR', back: '← BACK',
    lbTitle: 'MY BEST RUNS', lbLocal: 'Your best runs on this device',
    lbEmpty: 'Empty so far — be the first to play!',
    pauseTitle: 'PAUSED', resume: 'RESUME', pRetry: 'RESTART', pMenu: 'MENU',
    record: 'Best: ', newRecord: '🏆 New record!',
    retry: 'RETRY', toMenu: 'MENU',
    selected: '✔ SELECTED', choose: 'SELECT', playerName: 'Player',
    shield: 'SHIELD!', magnet: 'MAGNET!', star: '+25', slow: 'SLOW-MO!', nitro: 'NITRO! ×3', rank: 'Rank',
    revive: 'REVIVE', nearMiss: 'NEAR MISS!', combo: 'COMBO ×',
    adRevive: '📺 REVIVE FOR AN AD', adFail: 'Ad is not available right now', gems2: 'GEMS ×2!', tutorial: 'Drag left and right',
    abilHint: '🛡️ Shield, 🧲 Magnet, ⏱️ Slow-mo and 🚀 Nitro drop on the track!',
    reviveHint: 'Continue the run from where you crashed',
    noCrystals: 'Not enough crystals!',
    missions: 'MISSIONS', dailyStreak: 'streak',
    shareBtn: '📣 SHARE', inviteBtn: '👥 INVITE FRIENDS',
    adDouble: '📺 ×2 GEMS (+{n}) FOR AN AD', doubledMsg: 'Gems doubled! +💎',
    hello: 'Hi, ', you: 'You', shared: 'Posted to your wall!',
    shareText: 'I scored {n} in Neon Racer! Can you beat it?',
    inviteText: 'Join me in Neon Racer - let\'s race!'
  }
};
// турецкий: что не переведено, берётся из английского
I18N.tr = Object.assign({}, I18N.en, {
  tagline: 'Engellerden kaç, kristal topla, görevleri tamamla!',
  easy: 'KOLAY', normal: 'NORMAL', hard: 'ZOR',
  play: 'OYNA', cars: 'GARAJ', top10: 'SIRALAMA',
  ctrlHint: '👆 Parmağınla, fareyle veya ← → tuşlarıyla yönlendir',
  skinsTitle: 'ARABANI SEÇ', back: '← GERİ', lbTitle: 'LİDERLER',
  pauseTitle: 'DURAKLATILDI', resume: 'DEVAM', pRetry: 'YENİDEN', pMenu: 'MENÜ',
  record: 'Rekor: ', newRecord: '🏆 Yeni rekor!', retry: 'TEKRAR', toMenu: 'MENÜ',
  selected: '✔ SEÇİLİ', choose: 'SEÇ', revive: 'CANLAN', nearMiss: 'ÇOK YAKIN!',
  tutorial: 'Parmağını sola-sağa kaydır', adRevive: '📺 REKLAMLA CANLAN'
});
const T = function () { return I18N[LANG] || I18N.en; };

function detectLang() {
  var l = VK.lang();   // из параметров запуска, вне вк будет пусто
  if (!l) {
    try { l = (navigator.language || 'en').split('-')[0]; } catch (e) { l = 'en'; }
  }
  l = l.toLowerCase();
  // для украинского, белорусского и казахского ставим русский
  if (l === 'uk' || l === 'be' || l === 'kk') l = 'ru';
  return I18N[l] ? l : 'en';
}
function applyLang() {
  const t = T();
  document.documentElement.lang = LANG;
  document.title = LANG === 'en' ? 'Neon Racer' : 'Неоновый Гонщик';
  const set = function (id, txt) { const el = $(id); if (el) el.textContent = txt; };
  set('tagline', t.tagline);
  set('ctrlHint', t.ctrlHint);
  set('skinsTitle', t.skinsTitle);
  set('lbTitle', t.lbTitle);
  set('pauseTitle', t.pauseTitle);
  set('playBtn', t.play);
  set('skinsBtn', t.cars);
  set('menuLbBtn', t.top10);
  set('shareBtn', t.shareBtn);
  set('inviteBtn', t.inviteBtn);
  set('skinsBack', t.back);
  set('lbBack', t.back);
  set('resumeBtn', t.resume);
  set('pRetryBtn', t.pRetry);
  set('pMenuBtn', t.pMenu);
  set('retryBtn', t.retry);
  set('goMenuBtn', t.toMenu);
  set('adReviveBtn', t.adRevive);
  const ru = LANG === 'ru';
  set('achBtn', '🏅 ' + (ru ? 'НАГРАДЫ' : 'AWARDS')); set('achTitle', ru ? 'НАГРАДЫ' : 'AWARDS');
  set('achBack', t.back);
  set('abilHint', t.abilHint);
  set('lbHint', t.lbLocal);
  const dbs = document.querySelectorAll('.diffBtn');
  for (let i = 0; i < dbs.length; i++) {
    const d = dbs[i].getAttribute('data-diff');
    dbs[i].textContent = t[d] || d;
  }
  if (state === S.OVER) set('bestLbl', t.record + best);
  if (!$('skins').classList.contains('hidden')) renderSkins();
  updateHello();
  updateRank();
  renderDaily(); renderMissions(); renderMapButtons();
}

// вконтакте
let adOpen = false;         // сейчас идёт реклама
let rewardReady = false;    // вк сказал что видео за награду есть
let userName = '';
const AD_PAUSE = 120000;    // межстраничная реклама не чаще раза в 2 минуты

function initVK() {
  // ушли из приложения - ставим игру на паузу
  VK.onHide = function () {
    if (state === S.PLAY && !paused) { paused = true; show('pause'); }
  };
  VK.init(function (ok) {
    if (!ok) return;       // открыли не из вк - играем без соцфункций
    userName = VK.name;
    LANG = detectLang(); applyLang();
    $('inviteBtn').style.display = '';
    $('shareBtn').style.display = '';
    cloudLoad();
  });
}
initVK();

function updateHello() {
  const el = $('hello'); if (!el) return;
  el.textContent = userName ? T().hello + userName + '!' : '';
}
function shareScore() {
  VK.shareScore(T().shareText.replace('{n}', lastScore), function (ok) {
    if (ok) toast(T().shared);
  });
}
function inviteFriends() {
  VK.invite(T().inviteText, function () {});
}

// на время рекламы глушим звук и ставим паузу
function pauseForAd() {
  adOpen = true;
  if (state === S.PLAY) { paused = true; show('pause'); }
  try { if (audioCtx && audioCtx.state === 'running') audioCtx.suspend(); } catch (e) {}
}
function resumeAfterAd() {
  adOpen = false;
  try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
}

// перед новым заездом иногда показываем рекламу
function startWithAd() {
  if (adOpen) return;
  if (!VK.ready || Date.now() - lastAdT < AD_PAUSE) { start(); return; }
  pauseForAd();
  VK.showAd('interstitial', function () {
    lastAdT = Date.now();   // и если не показалась - не дёргаем снова сразу
    resumeAfterAd();
    start();
  });
}

// кнопки с наградой показываем только если вк подтвердил что видео есть
function refreshAdButtons() {
  const canRevive = rewardReady && !adRevived;
  const canDouble = rewardReady && !doubled && runTotalEarned > 0;
  $('adReviveBtn').style.display = canRevive ? '' : 'none';
  $('adDoubleBtn').style.display = canDouble ? '' : 'none';
  $('adDoubleBtn').textContent = T().adDouble.replace('{n}', runTotalEarned);
}

function submitScore(sc) {
  if (sc <= 0) return;
  let list = store.get('localLB', []);
  // один заезд - одна запись (после возрождения счёт растёт)
  list = list.filter(function (e) { return e.run !== runId; });
  list.push({ name: userName || T().you, score: sc, run: runId });
  list.sort(function (a, b) { return b.score - a.score; });
  store.set('localLB', list.slice(0, 10));
}
function renderLocalTop() {
  const box = $('lbList');
  const list = store.get('localLB', []);
  if (!list.length) { box.innerHTML = '<p style="color:#888">' + T().lbEmpty + '</p>'; return; }
  let html = '';
  list.forEach(function (e, i) {
    html += '<div class="lbRow"><span class="lbRank">#' + (i + 1) + '</span><span>' +
      esc(e.name) + '</span><span class="lbScore">' + e.score + '</span></div>';
  });
  box.innerHTML = html;
}
function showLocalTop() {
  renderLocalTop();
  hide('menu'); hide('gameover'); hide('pause');
  show('leaderboard');
}
function openLeaderboard() {
  // если нажали во время заезда - сначала пауза, иначе машина разобьётся пока смотришь рейтинг
  if (state === S.PLAY && !paused) { paused = true; show('pause'); }
  if (VK.ready) {
    // родное окно рейтинга вк; не открылось - покажем свой список
    VK.showLeaderboard(best, function (ok) { if (!ok) showLocalTop(); });
  } else {
    showLocalTop();
  }
}

// звук
let audioCtx = null;
function beep(f, d, type, vol) {
  if (muted) return;
  type = type || 'square'; vol = vol || .05;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + d);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + d);
  } catch (e) {}
}

// музыка (webaudio-синтез, у каждой карты своя)
let musicTimer = null, musicStep = 0, musicGain = null;
const MUSIC = {
  city:  { bpm: 132, lead: 'square',   bass: 'triangle',
           bassline: [110,0,110,0,131,0,110,0,98,0,98,0,131,0,147,0],
           melody:   [440,0,523,0,659,0,523,0,440,0,523,0,784,0,659,0] },
  space: { bpm: 80,  lead: 'sine',     bass: 'sine',
           bassline: [73,0,0,0,87,0,0,0,65,0,0,0,98,0,87,0],
           melody:   [587,0,0,698,0,0,880,0,523,0,0,440,0,0,587,0] },
  lava:  { bpm: 148, lead: 'sawtooth', bass: 'square',
           bassline: [82,82,0,82,82,0,82,82,87,87,0,87,82,0,78,0],
           melody:   [659,0,622,0,659,0,494,0,587,0,554,0,587,0,659,0] },
  synth: { bpm: 118, lead: 'sawtooth', bass: 'triangle',
           bassline: [98,0,98,0,123,0,98,0,110,0,110,0,147,0,131,0],
           melody:   [392,440,0,392,0,330,392,0,494,0,440,392,0,330,0,0] }
};
function ensureAudioCtx() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
}
function playNote(freq, dur, wave, vol) {
  if (!audioCtx || muted) return;
  try {
    if (!musicGain) { musicGain = audioCtx.createGain(); musicGain.gain.value = .5; musicGain.connect(audioCtx.destination); }
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(musicGain);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}
function musicTick() {
  if (muted || adOpen || paused || document.hidden || !audioCtx) return;
  const m = MUSIC[currentMap().music];
  if (!m) return;
  const st = musicStep % m.bassline.length;
  if (m.bassline[st]) playNote(m.bassline[st], .22, m.bass, .045);
  if (m.melody[st]) playNote(m.melody[st], .18, m.lead, .03);
  musicStep++;
}
function startMusic() {
  if (musicTimer) return;
  ensureAudioCtx();
  if (!audioCtx) return;
  const m = MUSIC[currentMap().music];
  musicTimer = setInterval(musicTick, 60000 / m.bpm / 2);
}
function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
function restartMusic() {
  if (!musicTimer) return;
  stopMusic(); musicStep = 0; startMusic();
}

// игровые функции
function boom(x, y, c) {
  for (let i = 0; i < 18; i++) {
    particles.push({ x: x, y: y, vx: rand(-5, 5) * U, vy: rand(-5, 5) * U,
      life: 1, c: c, r: rand(2, 5) * U });
  }
}
let spawnT = 0, gemT = 0, pickT = 0, exhT = 0, beepT = 0, milestone = 0;
let lastT = 0;
function spawn(dt) {
  const d = DIFFS[difficulty];
  const mp = currentMap();
  spawnT += dt;
  if (spawnT >= d.gap * (firstRun ? 1.6 : 1)) {
    spawnT = 0;
    const o = { x: rand(70 * U, FW - 70 * U), y: -70 * U, w: rand(50, 90) * U, h: 26 * U,
      c: 'hsl(' + rand(mp.hue[0], mp.hue[1]) + ',100%,60%)' };
    // часть препятствий - машины в потоке: уже, но длиннее
    if (Math.random() < 0.55) { o.car = true; o.w = rand(44, 52) * U; o.h = rand(64, 74) * U; }
    // полиция: едет быстрее остальных и мигает. в самом начале её нет
    if (o.car && score > 150 && Math.random() < 0.16) {
      o.police = true; o.fast = 1.3; o.c = '#2a4bff';
    }
    /* движущееся препятствие — новый тип */
    if (!o.police && Math.random() < 0.28) {
      o.move = { amp: rand(30, 80) * U, ph: rand(0, 6.28), sp: rand(0.02, 0.045) };
      o.baseX = o.x;
    }
    obstacles.push(o);
  }
  gemT += dt;
  if (gemT >= 55) { gemT = 0; gems.push({ x: rand(50 * U, FW - 50 * U), y: -30 * U, r: 13 * U, ph: 0 }); }
  /* способности падают на трассу во время заезда */
  pickT += dt;
  if (pickT >= 130) {
    pickT = 0;
    if (Math.random() < 0.9) {
      const a = ABILITIES[Math.floor(Math.random() * ABILITIES.length)];
      pickups.push({ x: rand(60 * U, FW - 60 * U), y: -40 * U, type: a.id, icon: a.icon, ph: rand(0, 6) });
    }
  }
}
function start() {
  score = 0; runEarned = 0; frame = 0; revives = 0; adRevived = false; firstRun = !store.get('tut', false); invincible = 0; shake = 0;
  gemCombo = 0; gemComboT = 0; runSlow = 0; runNitro = 0; runDouble = 0;
  spawnT = 0; gemT = 0; pickT = 0; exhT = 0; beepT = 0; milestone = 0; beatFlag = false;
  runStats = { score: 0, gems: 0, near: 0, police: 0 };
  gemsCounted = 0; runTotalEarned = 0; doubled = false; runId = Date.now();
  obstacles = []; gems = []; particles = []; pickups = []; floats = [];
  car.y = car.ty = H - Math.max(H * 0.2, 60 * U); car.x = car.tx = FW / 2;
  touchMode = false;
  applySkinSize();
  totalRuns++; store.set('totalRuns', totalRuns);
  startMusic();
  state = S.PLAY; paused = false;
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('pause').classList.add('hidden');
  beep(440, .1, 'sine'); setTimeout(function () { beep(660, .12, 'sine'); }, 100);
}
function die() {
  state = S.OVER;
  shake = 16; flash = .8; vibrate(150); store.set('tut', true);
  boom(car.x, car.y, currentSkin().glow);
  beep(120, .4, 'sawtooth', .08);
  crystals += runEarned; runTotalEarned += runEarned; runEarned = 0;
  // после возрождения заезд идёт дальше, поэтому в общий счёт кладём только новые кристаллы
  totalGems += runStats.gems - gemsCounted; gemsCounted = runStats.gems;
  store.set('totalGems', totalGems);
  runStats.score = score;
  runShield = false; runMagnet = false; runSlow = 0; runNitro = 0; runDouble = 0;
  store.set('crystals', crystals);
  updateHud();
  checkMissions();
  if (Math.floor(score) > best) {
    best = Math.floor(score); store.set('best', best);
    $('newRecord').textContent = T().newRecord;
  } else { $('newRecord').textContent = ''; }
  lastScore = Math.floor(score);
  submitScore(lastScore);
  updateRank();
  checkAchs();
  $('scoreBig').textContent = Math.floor(score);
  $('bestLbl').textContent = T().record + best;
  const rb = $('reviveBtn');
  rb.textContent = '💎 ' + T().revive + ' — ' + reviveCost();
  rb.disabled = crystals < reviveCost();
  rb.title = T().reviveHint;
  rewardReady = false; refreshAdButtons();
  VK.checkAd('reward', function (ok) {
    rewardReady = ok;
    if (state === S.OVER) refreshAdButtons();
  });
  setTimeout(function () { $('gameover').classList.remove('hidden'); }, 400);
}
function doRevive() {
  const cost = reviveCost();
  if (state !== S.OVER || crystals < cost) { beep(200, .15, 'sawtooth', .06); return; }
  crystals -= cost; revives++;
  store.set('crystals', crystals);
  comeBack();
}
// бесплатное возрождение за просмотр видео
function reviveForAd() {
  if (!VK.ready || adOpen || adRevived || state !== S.OVER) return;
  pauseForAd();
  VK.showAd('reward', function (rewarded) {
    lastAdT = Date.now();
    resumeAfterAd();
    if (rewarded) { adRevived = true; comeBack(); }
    else toast(T().adFail);
  });
}
// удвоить кристаллы за заезд
function doubleForAd() {
  if (!VK.ready || adOpen || doubled || state !== S.OVER || runTotalEarned <= 0) return;
  pauseForAd();
  VK.showAd('reward', function (rewarded) {
    lastAdT = Date.now();
    resumeAfterAd();
    if (!rewarded) { toast(T().adFail); return; }
    doubled = true;
    crystals += runTotalEarned; store.set('crystals', crystals);
    updateHud(); refreshAdButtons();
    toast(T().doubledMsg + runTotalEarned);
    beep(784, .1, 'sine'); setTimeout(function () { beep(1046, .15, 'sine'); }, 100);
  });
}
function comeBack() {
  invincible = 130; // ~2 секунды неуязвимости
  obstacles = obstacles.filter(function (o) {
    return o.y < car.y - H * .6 || o.y > car.y + H * .6;
  });
  state = S.PLAY; paused = false;
  hide('gameover');
  addFloat(car.x, car.y - 90 * U, T().revive + '!', '#0ff');
  beep(523, .1, 'sine'); setTimeout(function () { beep(880, .15, 'sine'); }, 100);
  updateHud();
}

// отрисовка
function drawObstacle(o) {
  // свечение двумя слоями без shadowBlur - так быстрее
  ctx.fillStyle = o.c; ctx.globalAlpha = .18;
  ctx.beginPath(); ctx.roundRect(o.x - o.w / 2 - 5 * U, o.y - 4 * U, o.w + 10 * U, o.h + 8 * U, 10 * U); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.roundRect(o.x - o.w / 2, o.y, o.w, o.h, 8 * U); ctx.fill();
  if (o.car) {
    ctx.fillStyle = 'rgba(5,0,20,.85)';   // стёкла
    ctx.beginPath(); ctx.roundRect(o.x - o.w / 2 + 6 * U, o.y + o.h * .52, o.w - 12 * U, o.h * .22, 4 * U); ctx.fill();
    ctx.beginPath(); ctx.roundRect(o.x - o.w / 2 + 6 * U, o.y + o.h * .14, o.w - 12 * U, o.h * .16, 4 * U); ctx.fill();
    ctx.fillStyle = '#ff2a2a';            // задние огни сверху
    ctx.fillRect(o.x - o.w / 2 + 3 * U, o.y + 2 * U, 8 * U, 4 * U);
    ctx.fillRect(o.x + o.w / 2 - 11 * U, o.y + 2 * U, 8 * U, 4 * U);
    ctx.fillStyle = '#fffbd0';            // фары снизу
    ctx.fillRect(o.x - o.w / 2 + 3 * U, o.y + o.h - 6 * U, 8 * U, 4 * U);
    ctx.fillRect(o.x + o.w / 2 - 11 * U, o.y + o.h - 6 * U, 8 * U, 4 * U);
    if (o.police) {                       // мигалка на крыше
      const red = Math.floor(frame / 6) % 2 === 0;
      ctx.fillStyle = red ? '#ff2030' : '#2a8cff';
      ctx.beginPath(); ctx.roundRect(o.x - o.w / 2 + 8 * U, o.y + o.h * .36, o.w - 16 * U, 6 * U, 3 * U); ctx.fill();
      ctx.globalAlpha = .25;
      ctx.beginPath(); ctx.arc(o.x, o.y + o.h * .36 + 3 * U, o.w * .7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,.35)';    // полосатый барьер
    for (let sx = o.x - o.w / 2 + 6 * U; sx < o.x + o.w / 2 - 8 * U; sx += 14 * U) {
      ctx.beginPath(); ctx.roundRect(sx, o.y + 4 * U, 7 * U, o.h - 8 * U, 2 * U); ctx.fill();
    }
  }
  if (o.move) {                           // движущиеся - с белой полосой
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.roundRect(o.x - o.w / 2 + 6 * U, o.y + o.h / 2 - 2 * U, o.w - 12 * U, 4 * U, 2 * U); ctx.fill();
  }
}
function drawVehicle() {
  const sk = currentSkin();
  let body = sk.body;
  if (sk.pulse) body = 'hsl(' + ((frame * 2) % 360) + ',100%,60%)';
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(clamp((car.tx - car.x) * 0.006 / U, -.25, .25));   // машина слегка кренится в повороте
  /* прозрачность: «Призрак» полупрозрачен + мигание неуязвимости */
  let baseA = sk.ghost ? .7 : 1;
  if (invincible > 0 && Math.floor(frame / 6) % 2 === 0) baseA *= .35;
  ctx.globalAlpha = baseA;
  if (sk.type === 'bike') {
    ctx.shadowColor = sk.glow; ctx.shadowBlur = Math.min(22 * U, 40);
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath(); ctx.arc(0, -car.h / 2 + 12 * U, 11 * U, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, car.h / 2 - 12 * U, 11 * U, 0, 7); ctx.fill();
    ctx.strokeStyle = body; ctx.lineWidth = 6 * U; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -car.h / 2 + 12 * U); ctx.lineTo(0, car.h / 2 - 22 * U); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11 * U, -car.h / 2 + 20 * U); ctx.lineTo(11 * U, -car.h / 2 + 20 * U); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = sk.win;
    ctx.beginPath(); ctx.roundRect(-8 * U, -6 * U, 16 * U, 18 * U, 6 * U); ctx.fill();
  } else {
    ctx.shadowColor = sk.glow; ctx.shadowBlur = Math.min(25 * U, 45);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 14 * U); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = sk.win;
    ctx.beginPath(); ctx.roundRect(-car.w / 2 + 8 * U, -car.h / 2 + 12 * U, car.w - 16 * U, 20 * U, 6 * U); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-car.w / 2 + 8 * U, car.h / 2 - 32 * U, car.w - 16 * U, 20 * U, 6 * U); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,' + Math.floor(rand(120, 200)) + ',0,.9)';
  ctx.beginPath(); ctx.moveTo(-10 * U, car.h / 2); ctx.lineTo(0, car.h / 2 + rand(10, 22) * U); ctx.lineTo(10 * U, car.h / 2); ctx.fill();
  if (runShield) {
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 3 * U;
    ctx.shadowColor = '#0ff'; ctx.shadowBlur = Math.min(16 * U, 30);
    ctx.beginPath(); ctx.arc(0, 0, Math.max(car.w, car.h) / 2 + 10 * U, 0, 7); ctx.stroke();
  }
  if (invincible > 0) {
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 3 * U;
    ctx.shadowColor = '#ff0'; ctx.shadowBlur = Math.min(20 * U, 32);
    ctx.setLineDash([10 * U, 8 * U]);
    ctx.beginPath(); ctx.arc(0, 0, Math.max(car.w, car.h) / 2 + 18 * U, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
function update() {
  /* дельта-время: игра идёт с одинаковой скоростью при любом FPS */
  const now = performance.now();
  let dt = (now - lastT) / 16.6667;
  lastT = now;
  if (paused) { requestAnimationFrame(update); return; }   // на паузе кадр просто замирает
  if (!(dt > 0)) dt = 0.01;
  if (dt > 2.5) dt = 2.5;
  frame += dt;

  const mp = currentMap();
  ctx.fillStyle = mp.bg; ctx.fillRect(0, 0, W, H);
  if (shake > 0.5) {
    shake *= Math.pow(.88, dt);
    cvs.style.transform = 'translate(' + rand(-shake, shake) + 'px,' + rand(-shake, shake) + 'px)';
  } else if (shake !== 0) { shake = 0; cvs.style.transform = ''; }

  /* звёзды */
  const starSpd = (state === S.PLAY ? speed * .3 : 2) * dt;
  ctx.fillStyle = mp.stars;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.y += s.v * dt + starSpd;
    if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }

  // по бокам от колонки (на ПК) - тёмные поля и неоновые линии
  if (FX > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, FX, H);
    ctx.fillRect(FX + FW, 0, W - FX - FW, H);
    ctx.fillStyle = mp.road; ctx.globalAlpha = .6;
    ctx.fillRect(FX - 2, 0, 2, H);
    ctx.fillRect(FX + FW, 0, 2, H);
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(FX, 0);
  ctx.beginPath(); ctx.rect(0, 0, FW, H); ctx.clip();

  /* дорога — предрендер, просто скроллится картинкой (быстро) */
  roadOff = (roadOff + (state === S.PLAY ? speed : 2) * dt) % roadPat;
  for (let y = -roadOff; y < H; y += roadPat) {
    ctx.drawImage(roadCan, 0, 0, roadCan.width, roadPat * DPR, 0, y, FW, roadPat);
  }

  if (state === S.PLAY && !paused) {
    if (keys['ArrowLeft'] || keys['KeyA']) car.tx -= 9 * U * dt;
    if (keys['ArrowRight'] || keys['KeyD']) car.tx += 9 * U * dt;
    car.tx = clamp(car.tx, 30 * U, FW - 30 * U);
    car.x += (car.tx - car.x) * Math.min(1, .22 * dt);
    /* на тачскрине машина плывёт за пальцем (выше его), мышью — снизу экрана */
    const restY = H - Math.max(H * 0.2, 60 * U);
    if (touchMode && performance.now() - lastTouchT < 1500) {
      car.ty = clamp(car.ty, H * .22, H - 50 * U);
      car.y += (car.ty - car.y) * Math.min(1, .25 * dt);
    } else {
      car.y += (restY - car.y) * Math.min(1, .12 * dt);
    }
    /* выхлоп из двигателя */
    exhT += dt;
    if (exhT >= 3) {
      exhT = 0;
      particles.push({ x: car.x + rand(-6, 6) * U, y: car.y + car.h / 2,
        vx: rand(-.6, .6) * U, vy: rand(2, 4) * U, life: .6, c: currentSkin().glow, r: rand(1.5, 3.5) * U });
    }
    if (runNitro > 0) {
      particles.push({ x: car.x + rand(-8, 8) * U, y: car.y + car.h / 2,
        vx: rand(-1, 1) * U, vy: rand(5, 9) * U, life: .4, c: '#ff8800', r: rand(2, 4) * U });
    }
    if (invincible > 0) invincible = Math.max(0, invincible - dt);
    if (runSlow > 0) { runSlow -= dt; if (runSlow <= 0) { runSlow = 0; updateHud(); } }
    if (runNitro > 0) { runNitro -= dt; if (runNitro <= 0) { runNitro = 0; updateHud(); } }
    if (runDouble > 0) { runDouble -= dt; if (runDouble <= 0) { runDouble = 0; updateHud(); } }
    if (gemComboT > 0) { gemComboT -= dt; if (gemComboT <= 0) gemCombo = 0; }
    const d = DIFFS[difficulty];
    speed = Math.min(d.max, d.base + score * d.growth) * mp.speedMul;
    const spd = speed * (runSlow > 0 ? .62 : 1) * (runNitro > 0 ? 1.6 : 1);
    spawn(dt);

    obstacles = obstacles.filter(function (o) {
      o.y += spd * dt * (o.fast || 1);
      if (o.move) o.x = clamp(o.baseX + Math.sin(frame * o.move.sp + o.move.ph) * o.move.amp, 40 * U, FW - 40 * U);
      drawObstacle(o);
      if (o.y > H + 40) return false;
      /* бонус "РЕЗКО!" за опасное прохождение впритирку */
      if (!o.passed && o.y - o.h / 2 > car.y + car.h / 2) {
        o.passed = true;
        if (o.police) runStats.police++;
        if (Math.abs(o.x - car.x) < o.w / 2 + car.w / 2 + 26 * U) {
          score += 3;
          runStats.near++;
          addFloat(car.x, car.y - 72 * U, T().nearMiss + ' +3', '#0ff');
          beep(700, .06, 'triangle', .04);
        }
      }
      if (state === S.PLAY && invincible <= 0 &&
          Math.abs(o.y + o.h / 2 - car.y) < o.h / 2 + car.h / 2 - 14 * U &&
          Math.abs(o.x - car.x) < o.w / 2 + car.w / 2 - 12 * U) {
        if (runShield) {
          runShield = false; updateHud();
          boom(o.x, o.y + o.h / 2, '#0ff'); beep(240, .2, 'square', .08);
          return false;
        }
        die(); return false;
      }
      return true;
    });
    if (state !== S.PLAY) { ctx.restore(); requestAnimationFrame(update); return; }

    gems = gems.filter(function (g) {
      g.y += spd * dt; g.ph += .1 * dt;
      if (runMagnet) {
        const gdx = car.x - g.x, gdy = car.y - g.y;
        if (Math.hypot(gdx, gdy) < 190 * U) { g.x += gdx * Math.min(1, .12 * dt); g.y += gdy * Math.min(1, .12 * dt); }
      }
      const r = g.r + Math.sin(g.ph) * 2 * U;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.ph * .5);
      ctx.fillStyle = '#ff0'; ctx.globalAlpha = .22;
      const rr = r + 5 * U;
      ctx.beginPath(); ctx.moveTo(0, -rr); ctx.lineTo(rr, 0); ctx.lineTo(0, rr); ctx.lineTo(-rr, 0); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (Math.hypot(g.x - car.x, g.y - car.y) < r + 30 * U) {
        gemCombo = gemComboT > 0 ? gemCombo + 1 : 1; gemComboT = 180;
        runStats.gems++;
        const bonus = 5 + Math.min(gemCombo - 1, 5) * 2;
        score += bonus; runEarned += (runDouble > 0 ? 2 : 1);
        if (selected === 'gold' && runStats.gems % 4 === 0) runEarned += 1;   // бонус золотой машины
        addFloat(g.x, g.y - 24 * U, '+' + bonus + (gemCombo > 1 ? ' ' + T().combo + gemCombo : ''), '#ff0');
        beep(880 + Math.min(gemCombo, 6) * 40, .08, 'triangle');
        boom(g.x, g.y, '#ff0'); vibrate(15);
        return false;
      }
      return g.y < H + 40;
    });

    ctx.font = Math.round(34 * FU) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    pickups = pickups.filter(function (p) {
      p.y += spd * dt; p.ph += .08 * dt;
      if (runMagnet) {
        const pdx = car.x - p.x, pdy = car.y - p.y;
        if (Math.hypot(pdx, pdy) < 190 * U) { p.x += pdx * Math.min(1, .1 * dt); p.y += pdy * Math.min(1, .1 * dt); }
      }
      ctx.save(); ctx.translate(p.x, p.y);
      const sc = 1 + Math.sin(p.ph) * .12;
      ctx.scale(sc, sc);
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 18;
      ctx.fillText(p.icon, 0, 0);
      ctx.restore();
      if (Math.hypot(p.x - car.x, p.y - car.y) < 48 * U) {
        if (p.type === 'shield') { runShield = true; addFloat(car.x, car.y - 84 * U, T().shield, '#0ff'); }
        else if (p.type === 'magnet') { runMagnet = true; addFloat(car.x, car.y - 84 * U, T().magnet, '#f0f'); }
        else if (p.type === 'slow') { runSlow = 300; addFloat(car.x, car.y - 84 * U, T().slow, '#0ff'); }
        else if (p.type === 'nitro') { runNitro = 240; addFloat(car.x, car.y - 84 * U, T().nitro, '#f80'); }
        else if (p.type === 'x2') { runDouble = 600; addFloat(car.x, car.y - 84 * U, T().gems2, '#ff0'); }
        else { score += 25; addFloat(p.x, p.y - 24 * U, T().star, '#ff0'); }
        beep(p.type === 'nitro' ? 1400 : 1046, .1, 'triangle'); vibrate(30); boom(p.x, p.y, '#fff');
        updateHud();
        return false;
      }
      return p.y < H + 50;
    });

    score += (runSlow > 0 ? 2 : 1) * (runNitro > 0 ? 3 : 1) * dt;
    beepT += dt;
    if (beepT >= 60) { beepT = 0; beep(520, .05, 'sine', .02); }
    if (!beatFlag && best > 0 && score > best) {
      beatFlag = true;
      addFloat(FW / 2, H * .35, T().newRecord, '#ff0');
      beep(784, .12, 'sine');
    }
    const ms = Math.floor(score / 200);
    if (ms > milestone) { milestone = ms; addFloat(FW / 2, H / 2 - 40 * U, '🔥 ' + Math.floor(score), '#ff0'); beep(660, .1, 'sine'); }

    /* виньетка замедления времени */
    if (runSlow > 0) {
      ctx.fillStyle = 'rgba(0,170,255,' + (0.05 + Math.sin(frame * .15) * .02) + ')';
      ctx.fillRect(0, 0, FW, H);
      ctx.strokeStyle = 'rgba(0,200,255,.5)'; ctx.lineWidth = 6 * U;
      ctx.strokeRect(3 * U, 3 * U, FW - 6 * U, H - 6 * U);
    }
    /* виньетка + линии скорости при нитро */
    if (runNitro > 0) {
      ctx.fillStyle = 'rgba(255,120,0,.06)';
      ctx.fillRect(0, 0, FW, H);
      ctx.strokeStyle = 'rgba(255,140,0,.55)'; ctx.lineWidth = 5 * U;
      ctx.strokeRect(3 * U, 3 * U, FW - 6 * U, H - 6 * U);
      ctx.fillStyle = 'rgba(255,200,100,.35)';
      for (let i = 0; i < 7; i++) {
        const lx = ((i * 197 + frame * spd * 3.1) % (FW + 60)) - 30;
        const ly = ((i * 149 + frame * spd * 3.7) % (H + 80)) - 40;
        ctx.fillRect(lx, ly, 2.5 * U, 46 * U);
      }
    }

    $('crystalMul').textContent = (runShield ? '🛡️' : '') + (runMagnet ? '🧲' : '') + (runSlow > 0 ? '⏱️' : '') + (runNitro > 0 ? '🚀' : '') + (runDouble > 0 ? '💰' : '');

    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(28 * FU) + 'px system-ui'; ctx.textAlign = 'center';
    ctx.shadowColor = '#f0f'; ctx.shadowBlur = 12;
    ctx.fillText(Math.floor(score), FW / 2, 44 * U); ctx.shadowBlur = 0;

    if (firstRun && frame < 300) {
      ctx.globalAlpha = Math.min(1, (300 - frame) / 60);
      ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(20 * FU) + 'px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('◀  ' + T().tutorial + '  ▶', FW / 2 + Math.sin(frame * .1) * 18 * U, H * .5);
      ctx.globalAlpha = 1;
    }
    drawVehicle();
  }
  particles = particles.filter(function (p) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= .03 * dt;
    ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    return p.life > 0;
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '800 ' + Math.round(20 * FU) + 'px system-ui';
  floats = floats.filter(function (f) {
    f.y -= 1.2 * dt; f.life -= .02 * dt;
    ctx.globalAlpha = Math.max(f.life, 0);
    ctx.fillStyle = f.c;
    ctx.fillText(f.txt, f.x, f.y);
    ctx.globalAlpha = 1;
    return f.life > 0;
  });
  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + flash + ')'; ctx.fillRect(0, 0, FW, H);
    flash = Math.max(0, flash - .05 * dt);
  }
  ctx.restore();
  requestAnimationFrame(update);
}

// ui
function updateHud() {
  $('crystalCount').textContent = crystals;
  $('crystalMul').textContent = (runShield ? '🛡️' : '') + (runMagnet ? '🧲' : '') + (runSlow > 0 ? '⏱️' : '') + (runNitro > 0 ? '🚀' : '') + (runDouble > 0 ? '💰' : '');
}
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function openMenu() {
  state = S.MENU; paused = false;
  hide('gameover'); hide('leaderboard'); hide('pause'); hide('skins'); hide('achv');
  show('menu');
  updateRank();
  renderDaily(); renderMissions(); renderMapButtons();
}
function setDiff(d) {
  difficulty = d; store.set('diff', d);
  const btns = document.querySelectorAll('.diffBtn');
  for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-diff') === d);
}
function renderSkins() {
  const grid = $('skinGrid'); grid.innerHTML = '';
  for (let i = 0; i < VEHICLES.length; i++) {
    const sk = VEHICLES[i];
    const isOwned = owned.indexOf(sk.id) !== -1;
    const isSel = selected === sk.id;
    const card = document.createElement('div');
    card.className = 'skinCard' + (isSel ? ' selected' : '') + (isOwned ? '' : ' locked');
    card.innerHTML =
      '<div class="skinPrev" style="width:' + (sk.type === 'bike' ? '34px' : '54px') + ';background:' + sk.body + ';box-shadow:0 0 18px ' + sk.glow + (sk.ghost ? ';opacity:.7' : '') + '"></div>' +
      '<div class="skinName">' + (sk.type === 'bike' ? '🏍️ ' : '') + (sk.ghost ? '👻 ' : '') + (sk.name[LANG] || sk.name.en) + '</div>' +
      (sk.id === 'gold' ? '<div class="hint" style="margin:0 0 4px">' + (LANG === 'ru' ? 'бонус: +кристаллы' : 'perk: +gems') + '</div>' : '') + '<div class="skinPrice">' + (isSel ? T().selected : isOwned ? T().choose : '💎 ' + sk.price) + '</div>';
    card.onclick = function () {
      if (isOwned) { selected = sk.id; store.set('skin', sk.id); beep(660, .08, 'sine'); }
      else if (crystals >= sk.price) {
        crystals -= sk.price; owned.push(sk.id);
        store.set('crystals', crystals); store.set('owned', owned);
        selected = sk.id; store.set('skin', sk.id);
        beep(880, .1, 'triangle'); beep(1100, .1, 'triangle');
      } else { beep(200, .15, 'sawtooth', .06); toast(T().noCrystals); return; }
      updateHud(); renderSkins();
    };
    grid.appendChild(card);
  }
}

// карты: кнопки в меню
function renderMapButtons() {
  const row = $('mapRow'); if (!row) return;
  row.innerHTML = '';
  for (let i = 0; i < MAPS.length; i++) {
    const m = MAPS[i];
    const isOwned = ownedMaps.indexOf(m.id) !== -1;
    const b = document.createElement('button');
    b.className = 'diffBtn' + (mapId === m.id ? ' active' : '');
    b.textContent = (m.name[LANG] || m.name.en) + (isOwned ? '' : ' 🔒' + m.price);
    b.onclick = function () {
      if (ownedMaps.indexOf(m.id) === -1) {
        if (crystals >= m.price) {
          crystals -= m.price; ownedMaps.push(m.id);
          store.set('crystals', crystals); store.set('ownedMaps', ownedMaps);
          beep(880, .1, 'triangle'); beep(1100, .1, 'triangle');
        } else { beep(200, .15, 'sawtooth', .06); toast(T().noCrystals); return; }
      }
      mapId = m.id; store.set('map', mapId);
      renderRoad();
      beep(660, .08, 'sine');
      updateHud(); renderMapButtons(); restartMusic();
    };
    row.appendChild(b);
  }
}

// кнопки
bind('playBtn', function () { startWithAd(); });
bind('retryBtn', function () { startWithAd(); });
bind('goMenuBtn', function () { openMenu(); });
bind('resumeBtn', function () { paused = false; hide('pause'); });
bind('pRetryBtn', function () { paused = false; hide('pause'); startWithAd(); });
bind('pMenuBtn', function () { openMenu(); });
bind('skinsBtn', function () { renderSkins(); hide('menu'); show('skins'); });
bind('skinsBack', function () { hide('skins'); openMenu(); });
bind('lbBtn', openLeaderboard);
bind('menuLbBtn', openLeaderboard);
bind('lbBack', function () {
  hide('leaderboard');
  if (state === S.OVER) show('gameover');
  else if (state === S.PLAY) show('pause');   // вернулись в заезд - он на паузе
  else openMenu();
});
bind('inviteBtn', inviteFriends);
bind('shareBtn', shareScore);
bind('achBtn', function () { renderAchs(); hide('menu'); show('achv'); });
bind('achBack', function () { hide('achv'); openMenu(); });
bind('pauseBtn', function () {
  if (state !== S.PLAY) return;
  if (!$('leaderboard').classList.contains('hidden')) return;
  paused = !paused;
  if (paused) show('pause'); else hide('pause');
});
bind('reviveBtn', function () { doRevive(); });
bind('adReviveBtn', function () { reviveForAd(); });
bind('adDoubleBtn', function () { doubleForAd(); });
bind('muteBtn', function () {
  muted = !muted; store.set('muted', muted);
  this.textContent = muted ? '🔇' : '🔊';
});
(function () {
  var dbs = document.querySelectorAll('.diffBtn');
  for (var i = 0; i < dbs.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        setDiff(btn.getAttribute('data-diff')); beep(600, .05, 'sine');
      });
    })(dbs[i]);
  }
})();

// управление
function setTarget(px) { car.tx = clamp(px - FX, 30 * U, FW - 30 * U); }
function onPoint(e) {
  if (state !== S.PLAY || paused) return;
  if (e.target && e.target.closest && e.target.closest('button')) return;   // тап по кнопке не двигает машину
  if (e.pointerType === 'touch') {
    touchMode = true; lastTouchT = performance.now();
    setTarget(e.clientX);
    car.ty = e.clientY - 120 * U; /* машина едет НАД пальцем, не закрывая обзор */
  } else {
    touchMode = false;
    setTarget(e.clientX);
  }
}
window.addEventListener('pointerdown', onPoint);
window.addEventListener('pointermove', onPoint);
window.addEventListener('touchmove', function (e) {
  if (state === S.PLAY && !paused) e.preventDefault();
}, { passive: false });
const keys = {};
window.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) $('pauseBtn').click();
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

// свернули вкладку - ставим на паузу
document.addEventListener('visibilitychange', function () {
  if (document.hidden && state === S.PLAY && !paused) { paused = true; show('pause'); }
});

// инициализация
LANG = detectLang(); applyLang();
setDiff(difficulty);
applySkinSize();
updateHud();
renderDaily();
renderMissions();
renderMapButtons();
$('muteBtn').textContent = muted ? '🔇' : '🔊';
window.addEventListener('pointerdown', function () { ensureAudioCtx(); startMusic(); });
window.addEventListener('keydown', function () { ensureAudioCtx(); startMusic(); });
window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
lastT = performance.now();
updateRank();
update();
