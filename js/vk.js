'use strict';
// Всё, что связано с ВКонтакте, лежит тут. Игра про VK Bridge ничего не знает,
// она просто дёргает VK.showAd, VK.saveCloud и так далее.
// Если игру открыли не из ВК (например с компа для проверки), всё молча отключается.

var VK = (function () {
  var bridge = window.vkBridge || null;
  var params = readParams();
  var self = {
    ready: false,     // true когда VKWebAppInit прошёл
    name: '',         // имя игрока
    onHide: null      // игра вешает сюда паузу
  };

  // параметры запуска: ?vk_app_id=...&vk_language=ru&vk_platform=...
  function readParams() {
    var out = {};
    var q = (location.search || '').replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (pair) {
      var p = pair.split('=');
      try { out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) {}
    });
    return out;
  }

  // обёртка: если моста нет, возвращаем отклонённый промис, чтобы везде был один путь
  function call(method, data) {
    if (!bridge) return Promise.reject(new Error('no bridge'));
    return bridge.send(method, data || {});
  }

  self.init = function (done) {
    // без vk_app_id мы точно не внутри ВК - не ждём мост зря
    if (!bridge || !params.vk_app_id) { done(false); return; }
    call('VKWebAppInit').then(function () {
      self.ready = true;
      // события от клиента: ушли из приложения - ставим паузу
      try {
        bridge.subscribe(function (e) {
          var type = e && e.detail && e.detail.type;
          if (type === 'VKWebAppViewHide' && self.onHide) self.onHide();
        });
      } catch (err) {}
      return call('VKWebAppGetUserInfo').then(function (u) {
        self.name = (u && u.first_name) || '';
      }).catch(function () {});     // имя не критично
    }).then(function () {
      done(self.ready);
    }).catch(function () { done(false); });
  };

  // язык из параметров запуска. Бывает строкой ('ru') или старым числовым кодом
  self.lang = function () {
    var l = params.vk_language;
    if (!l) return '';
    if (/^\d+$/.test(l)) return ['ru', 'uk', 'be', 'en', 'es', 'fi', 'de', 'it'][+l] || '';
    return l;
  };

  self.isMobile = function () {
    return /^mobile/.test(params.vk_platform || '');
  };

  // ---- облачное сохранение ----
  // в хранилище ВК значение - строка до 4096 байт, у нас всё влезает в один ключ
  var SAVE_KEY = 'neon_save';

  self.saveCloud = function (obj) {
    if (!self.ready) return;
    var str = JSON.stringify(obj);
    if (str.length > 4000) return;   // страховка от лимита
    call('VKWebAppStorageSet', { key: SAVE_KEY, value: str }).catch(function () {});
  };

  self.loadCloud = function (cb) {
    if (!self.ready) { cb(null); return; }
    call('VKWebAppStorageGet', { keys: [SAVE_KEY] }).then(function (res) {
      var item = res && res.keys && res.keys[0];
      var data = null;
      if (item && item.value) { try { data = JSON.parse(item.value); } catch (e) {} }
      cb(data);
    }).catch(function () { cb(null); });
  };

  // ---- реклама ----
  // format: 'interstitial' (между заездами) или 'reward' (за награду)
  self.checkAd = function (format, cb) {
    if (!self.ready) { cb(false); return; }
    call('VKWebAppCheckNativeAds', { ad_format: format }).then(function (r) {
      cb(!!(r && r.result));
    }).catch(function () { cb(false); });
  };

  // cb(true) - реклама показана / награда заработана
  self.showAd = function (format, cb) {
    if (!self.ready) { cb(false); return; }
    call('VKWebAppShowNativeAds', { ad_format: format }).then(function (r) {
      cb(!!(r && r.result));
    }).catch(function () { cb(false); });
  };

  // ---- соцфункции ----
  self.showLeaderboard = function (score, cb) {
    if (!self.ready) { cb(false); return; }
    call('VKWebAppShowLeaderBoardBox', { user_result: Math.floor(score) }).then(function () {
      cb(true);
    }).catch(function () { cb(false); });
  };

  self.shareScore = function (text, cb) {
    if (!self.ready) { cb(false); return; }
    var data = { message: text };
    if (params.vk_app_id) data.attachments = 'https://vk.com/app' + params.vk_app_id;
    call('VKWebAppShowWallPostBox', data).then(function (r) {
      cb(!!(r && (r.post_id || r.result)));
    }).catch(function () { cb(false); });
  };

  self.invite = function (text, cb) {
    if (!self.ready) { cb(false); return; }
    call('VKWebAppShowInviteBox', { requestText: text }).then(function () {
      cb(true);
    }).catch(function () { cb(false); });
  };

  return self;
})();
