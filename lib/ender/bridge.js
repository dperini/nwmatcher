!function (doc, $) {
  // a bunch of this code is borrowed from Qwery so NW is a drop-in replacement
  var nw = require('nwmatcher')
    , isNode = function (el, t) {
        return el && typeof el === 'object' && (t = el.nodeType) && (t == 1 || t == 9)
      }
    , arrayLike = function (o) {
        return (typeof o === 'object' && isFinite(o.length))
      }
    , flatten = function (ar) {
        for (var r = [], i = 0, l = ar.length; i < l; ++i) arrayLike(ar[i]) ? (r = r.concat(ar[i])) : (r[r.length] = ar[i])
        return r
      }
    , uniq = function (ar) {
        var a = [], i, j
        o: for (i = 0; i < ar.length; ++i) {
          for (j = 0; j < a.length; ++j) {
            if (a[j] == ar[i]) {
              continue o
            }
          }
          a[a.length] = ar[i]
        }
        return a
      }
    , normalizeRoot = function (root) {
        if (!root) return doc
        if (typeof root == 'string') return nw.select(root)[0]
        if (!root.nodeType && arrayLike(root)) return root[0]
        return root
      }
    , select = function (selector, _root) {
        var root = normalizeRoot(_root)
        if (!root || !selector) return []
        if (selector === window || isNode(selector)) {
          return !_root || (selector !== window && isNode(root) && nw.contains(root, container)) ? [selector] : []
        }
        if (selector && arrayLike(selector)) return flatten(selector)
        return nw.select(selector, root)
      }
    , is = function (s, r) {
        var i, l
        for (i = 0, l = this.length; i < l; i++) {
          if (nw.match(this[i], s, r)) {
            return true
          }
        }
        return false
      }

  $._select = function (selector, root) {
    // if 'bonzo' is available at run-time use it for <element> creation
    return ($._select = (function(bonzo) {
      try {
        bonzo = require('bonzo')
        return function (selector, root) {
          return /^\s*</.test(selector) ? bonzo.create(selector, root) : select(selector, root)
        }
      } catch (e) { }
      return select
    })())(selector, root)
  }

  $.ender({
      is: is
    , match: is
    , find: function (s) {
        var r = [], i, l, j, k, els
        for (i = 0, l = this.length; i < l; i++) {
          els = select(s, this[i])
          for (j = 0, k = els.length; j < k; j++) r.push(els[j])
        }
        return $(uniq(r))
      }
    , and: function (s) {
        var plus = $(s)
        for (var i = this.length, j = 0, l = this.length + plus.length; i < l; i++, j++) {
          this[i] = plus[j]
        }
        return this
      }
  }, true)

}(document, ender)
