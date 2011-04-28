NW.Dom.shortcuts = function(selector, from, alt) {

  var doc = from.ownerDocument || from,

  root = doc.documentElement,

  // match missing R/L context
  reLeftContext = /^[\x20\t\n\r\f]*[>+~]/,
  reRightContext = /[>+~][\x20\t\n\r\f]*$/;

  // add left context if missing
  if (reLeftContext.test(selector)) {
    if (from.nodeType == 1 && from.id) {
      selector = '#' + from.id + ' ' + selector;
    } else if (from == root || from == doc.body) {
      selector = from.nodeName + ' ' + selector;
    } else if (alt) {
      selector = NW.Dom.shortcuts(selector, alt);
    } else {
      selector = '#' + (from.id = 'test') + selector;
//      NW.Dom.emit('Unable to resolve a context for the shortcut selector "' + selector + '"');
    }
  }

  // add right context if missing
  if (reRightContext.test(selector)) {
    selector += ' *';
  }

  return selector;

};
