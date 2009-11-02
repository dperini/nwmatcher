NW.Dom.Cache = (function(global) {

  var now, lastCalled,

  Storages = { },
  Contexts = { },
  Results = { },

  isCacheable = false,
  isEnabled = false,
  isExpired = true,
  isPaused = false,

  context = global.document,
  root = context.documentElement,

  // minimum time allowed between calls to the cache initialization
  minCacheRest = 15, //ms

  // check for Mutation Events, DOMAttrModified should be
  // enough to ensure DOMNodeInserted/DOMNodeRemoved exist
  // check for Mutation Events, DOMAttrModified should be
  // enough to ensure DOMNodeInserted/DOMNodeRemoved exist
  NATIVE_MUTATION_EVENTS = root.addEventListener ?
    (function() {
      var isSupported, id = root.id,
        input = context.createElement('input'),
        handler = function() { isSupported = true; };

      // add a bogus control element
      root.insertBefore(input, root.firstChild);

      // add listener and modify attribute
      root.addEventListener('DOMAttrModified', handler, false);
      root.id = 'nw';

      // now try to modify the bogus element
      isSupported && !(isSupported = 0) && (input.disabled = 0);

      // remove event listener and tested element
      root.removeEventListener('DOMAttrModified', handler, false);
      root.removeChild(input);
      root.id = id;

      input = null;
      handler = null;
      return !!isSupported;
    })() :
    false,

  // NOT TESTED YET !
  getHostIndex =
    function(host) {
      // fix for older Safari 2.0.x returning
      // [object AbstractView] instead of [window]
      var index = 0, frame, frames;
      if (window.frames.length === 0 && top.document === host) {
        return index;
      } else {
        frames = top.frames;
        for (; frame = frames[index]; index++) {
          if (top.frames[index].document === host) {
            return index + 1;
          }
        }
      }
      return 0;
    },

  // NOT TESTED YET !
  setStorage =
    function(host) {
      if (Storages[host]) {
        Contexts = Storages[host].Contexts;
        Results = Storages[host].Results;
      } else {
        Contexts = Storages[host].Contexts = { };
        Results = Storages[host].Results = { };
      }
    },

  loadResults =
    function(selector, from, base, root) {

      setStorage(getHostIndex(base));

      isCacheable = isEnabled && !isPaused &&
        !(from != base && isDisconnected(from, root));

      // avoid caching disconnected nodes
      if (isCacheable) {
        if (!isExpired) {
          if (Results[selector] && Contexts[selector] == from) {
            return Results[selector];
          }
        } else {
          // temporarily pause caching while we are getting hammered with dom mutations (jdalton)
          now = new Date;
          if ((now - lastCalled) < minCacheRest) {
            isPaused = isExpired = true;
            setTimeout(function() { isPaused = false; }, minCacheRest);
          } else setCache(true, base);
          lastCalled = now;
        }
      }

      return Results;
    },

  saveResults =
    function(selector, from, data) {
      if (isCacheable) {
        Contexts[selector] = from;
        Results[selector]  = data;
      }
      return;
    },

  isDisconnected = 'compareDocumentPosition' in root ?
    function(element, container) {
      return (container.compareDocumentPosition(element) & 1) == 1;
    } : 'contains' in root ?
    function(element, container) {
      return !container.contains(element);
    } :
    function(element, container) {
      while ((element = element.parentNode)) {
        if (element === container) return false;
      }
      return true;
    },

  /*-------------------------------- CACHING ---------------------------------*/

  // invoked by mutation events to expire cached parts
  mutationWrapper =
    function(event) {
      var d = event.target.ownerDocument || event.target;
      stopMutation(d);
      expireCache(d);
    },

  // append mutation events
  startMutation =
    function(d) {
      if (!d.isCaching) {
        // FireFox/Opera/Safari/KHTML have support for Mutation Events
        d.addEventListener('DOMAttrModified', mutationWrapper, false);
        d.addEventListener('DOMNodeInserted', mutationWrapper, false);
        d.addEventListener('DOMNodeRemoved',  mutationWrapper, false);
        d.isCaching = true;
      }
    },

  // remove mutation events
  stopMutation =
    function(d) {
      if (d.isCaching) {
        d.removeEventListener('DOMAttrModified', mutationWrapper, false);
        d.removeEventListener('DOMNodeInserted', mutationWrapper, false);
        d.removeEventListener('DOMNodeRemoved',  mutationWrapper, false);
        d.isCaching = false;
      }
    },

  // enable/disable context caching system
  // @d optional document context (iframe, xml document)
  // script loading context will be used as default context
  setCache =
    function(enable, d) {
      if (!!enable) {
        isExpired = false;
        startMutation(d);
      } else {
        isExpired = true;
        stopMutation(d);
      }
      isEnabled = !!enable;
    },

  // expire complete cache
  // can be invoked by Mutation Events or
  // programmatically by other code/scripts
  // document context is mandatory no checks
  expireCache =
    function(d) {
      isExpired = true;
    };

  isEnabled = NATIVE_MUTATION_EVENTS;

  /*------------------------------- PUBLIC API -------------------------------*/

  return {

    // save results into cache
    saveResults: saveResults,

    // load results from cache
    loadResults: loadResults,

    // expire DOM tree cache
    expireCache: expireCache,

    // enable/disable cache
    setCache: setCache,

    // context roots reference
    getContexts: function() { return Contexts; },

    // result sets references
    getResults: function() { return Results; },

    // public while debugging
    isEnabled: function() { return isEnabled; },
    isExpired: function() { return isExpired; },
    isPaused: function() { return isPaused; }

  };

})(this);
