/*
 * Copyright (C) 2007-2008 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast selector engine not using XPath
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 0.99.9
 * Created: 20070722
 * Release: 20080803
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

window.NW || (window.NW = {});

NW.Dom = function() {

  var version = '0.99.9',

  // the DOM selection functions
  // returning collections
  compiledSelectors = { },

  // the DOM matching functions
  // returning booleans
  compiledMatchers = { },

  // selection matched elements
  cachedResults = {
    from: [ ],
    items: [ ]
  },

  // child pseudo selector (CSS3)
  child_pseudo = /\:(nth|first|last|only)\-/,
  // of-type pseudo selectors (CSS3)
  oftype_pseudo = /\-(of-type)/,

  // trim leading whitespaces
  TR = /^\s+|\s+$/g,

  // precompiled Regular Expressions
  Patterns = {
    // nth child pseudos
    npseudos: /\:(nth-)?(child|first|last|only)?-?(child)?-?(of-type)?(\((?:even|odd|[^\)]*)\))?(\s|$|[:+~>].*)/,
    // simple pseudos
    pseudos: /\:([\w]+)(\(.*?\))?(\s|$|[:+~>].*)/,
    // E > F
    children: /^\s*\>\s*(.*)/,
    // E + F
    adjacent: /^\s*\+\s*(.*)/,
    // E ~ F
    relative: /^\s*\~\s*(.*)/,
    // E F
    ancestor: /^(\s+)(.*)/,
    // attribute
    attribute: /^\[([-\w]*:?[-\w]+)\s*(?:([!^$*~|])?(\=)?\s*(["'])?([^\4]*?)\4|([^'"][^\]]*?))\](.*)/,
    // all
    all: /^\*(.*)/,
    // id
    id: /^\#([-\w]+)(.*)/,
    // tag
    tagName: /^([-\w]+)(.*)/,
    // class
    className: /^\.([-\w]+)(.*)/
  },

  // initial optimizations
  // by single/multi tokens
  // only for select method
  Optimizations = {
    // all with whitespaces
    // maybe the worst case
    // being "\r\n\t * \r\n"
    all: /(^\*)$/,
    // single class, id, tag
    id: /^\#([-\w]+)$/,
    tagName: /^([\w]+)$/,
    className: /^\.([-\w]+)$/
  },

  // convert nodeList to array (implementation from Prototype)
  toArray =
    function(iterable) {
      var length = iterable.length, array = new Array(length);
      while (length--) {
        array[length] = iterable[length];
      }
      return array;
    },

  // compile a CSS3 string selector into
  // ad-hoc javascript matching function
  compileSelector =
    // selector string, function source,
    // and select (true) or match (false)
    function(selector, source, select) {

      var a, b,
          // temporary building placeholders
          compare, match, param, test, type,
          attributeValue, attributePresence;

      while (selector) {

        // * match all
        if ((match = selector.match(Patterns.all))) {
          // always matching (removed for speed)
          //source = 'if(e){' + source + '}';
          // on IE remove comment nodes to avoid this
          source = 'if(e.nodeType==1){' + source + '}';
        }
        // #Foo Id case sensitive
        else if ((match = selector.match(Patterns.id))) {
          source = 'if((a=e.getAttributeNode("id"))&&a.value=="' + match[1] + '"){' + source + '}';
        }
        // Foo Tag case insensitive (?)
        else if ((match = selector.match(Patterns.tagName))) {
          source = 'if(e.nodeName.toLowerCase()=="' + match[1].toLowerCase() + '"){' + source + '}';
        }
        // .Foo Class case sensitive
        else if ((match = selector.match(Patterns.className))) {
          source = 'if((" "+e.className+" ").indexOf(" ' + match[1] + ' ")>-1){' + source + '}';
          //source = 'if(((" "+e.className).replace(/\\s+/g," ") + " ").indexOf(" ' + match[1] + ' ")>-1){' + source + '}';
        }
        // [attr] [attr=value] [attr="value"] and !=, *=, ~=, |=, ^=, $=
        else if ((match = selector.match(Patterns.attribute))) {

          if (match[1] == 'href' || match[1] == 'src') {
            attributeValue = '(((a=e.getAttribute("' + match[1] + '",2))&&a)||"")';
          } else {
            attributeValue = '(((a=e.getAttributeNode("' + match[1] + '"))&&a.value)||"")';
          }

          if (typeof document.fileSize != 'undefined') {
            // on IE check the "specified" property on the attribute node
            attributePresence = '((a=e.getAttributeNode("' + match[1] + '"))&&a.specified)';
          } else {
            attributePresence = 'e.hasAttribute("' + match[1] + '")';
          }

          // match[1] - attribute name
          // match[2] - operator type
          // match[3] - equal sign
          // match[4] - quotes
          // match[5] - value

          source = 'if(' +
            // change behavior for [class!=madeup]
            //(match[2] == '!' ? 'e.' + match[1] + '&&' : '') +
            // match attributes or property
            (match[2] && match[3] && match[5] && match[2] != '!' ?
              (match[2] == '~' ? '(" "+' : (match[2] == '|' ? '("-"+' : '')) + attributeValue +
                (match[2] == '|' || match[2] == '~' ? '.replace(/\\s+/g," ")' : '') +
              (match[2] == '~' ? '+" ")' : (match[2] == '|' ? '+"-")' : '')) +
                (match[2] == '!' || match[2] == '|' || match[2] == '~' ? '.indexOf("' : '.match(/') +
              (match[2] == '^' ? '^' : match[2] == '~' ? ' ' : match[2] == '|' ? '-' : '') + match[5].toLowerCase() +
              (match[2] == '$' ? '$' : match[2] == '~' ? ' ' : match[2] == '|' ? '-' : '') +
                (match[2] == '|' || match[2] == '~' ? '")>-1' : '/)') :
              (match[3] && match[5] ? attributeValue + (match[2] == '!' ? '!' : '=') + '="' +
                match[5].toLowerCase() + '"' : attributePresence)) +
          '){' + source + '}';
        }
        // E + F (F adiacent sibling of E)
        else if ((match = selector.match(Patterns.adjacent))) {
          source = 'while(e.previousSibling){e=e.previousSibling;if(e.nodeType==1){' + source + 'break;}}';
        }
        // E ~ F (F relative sibling of E)
        else if ((match = selector.match(Patterns.relative))) {
          source = 'while(e.previousSibling){e=e.previousSibling;if(e.nodeType==1){' + source.replace(/\}$/, 'break;}') + '}}';
        }
        // E > F (F children of E)
        else if ((match = selector.match(Patterns.children))) {
          source = 'while(e.parentNode.nodeType==1){e=e.parentNode;' + source + 'break;}';
        }
        // E F (E ancestor of F)
        else if ((match = selector.match(Patterns.ancestor))) {
          source = 'while(e.parentNode.nodeType==1){e=e.parentNode;' + source.replace(/\}$/, 'break;}') + '}';
        }
        // CSS3 :root, :empty, :enabled, :disabled, :checked, :target
        // CSS2 :active, :focus, :hover (no way yet)
        // CSS1 :link, :visited
        else if ((match = selector.match(Patterns.pseudos))) {
          switch (match[1]) {
            // CSS3 part of structural pseudo-classes
            case 'not':
              source = compileSelector(match[2].replace(/\((.*)\)/, '$1'), source, select).replace(/if([^\{]+)/, 'if(!$1)');
              break;
            case 'root':
              source = 'if(e==(e.ownerDocument||e.document||e).documentElement){' + source + '}';
              break;
            case 'empty':
              //source = 'if(/^\\s*$/.test(e.innerHTML)){' + source + '}';
              // IE does not support empty text nodes, HTML white spaces and CRLF are not in the DOM
              source = 'if(/^\\s*$/.test(e.innerHTML)&&!/\\r|\\n/.test(e.innerHTML)){' + source + '}';
              break;
            case 'contains':
              source = 'if((e.textContent||e.innerText||"").indexOf("' + match[2].replace(/\(|\)/g, '') + '")!=-1){' + source + '}';
              break;
            // CSS3 part of UI element states
            case 'enabled':
              source = 'if(e.type&&e.type!="hidden"&&!e.disabled){' + source + '}';
              break;
            case 'disabled':
              source = 'if(e.type&&e.type!="hidden"&&e.disabled){' + source + '}';
              break;
            case 'checked':
              source = 'if(e.type&&e.type!="hidden"&&e.checked){' + source + '}';
              break;
            // CSS3 target element
            case 'target':
              source = 'if(e.id==location.href.match(/#([_-\w]+)$/)[1]){' + source + '}';
              break;
            // CSS1 & CSS2 link
            case 'link':
              source = 'if(e.nodeName.toUpperCase()=="A"&&e.href){' + source + '}';
              break;
            case 'visited':
              source = 'if(e.nodeName.toUpperCase()=="A"&&e.visited){' + source + '}';
              break;
            // CSS1 & CSS2 user action
            case 'active':
              // IE, FF3 have native method, others may have it emulated,
              // this may be done in the event manager setting activeElement
              source = 'var d=(e.ownerDocument||e.document);' +
                       'if(d.activeElement&&e===d.activeElement){' + source + '}';
              break;
            case 'hover':
              // IE, FF3 have native method, other browser may achieve a similar effect
              // by delegating mouseover/mouseout handling to the document/documentElement
              source = 'var d=(e.ownerDocument||e.document);' +
                       'if(d.hoverElement&&e===d.hoverElement){' + source + '}';
              break;
            case 'focus':
              // IE, FF3 have native method, others may have it emulated,
              // this may be done in the event manager setting focusElement
              source = 'var d=(e.ownerDocument||e.document);' +
                       'if(e.type&&e.type!="hidden"&&' +
                         '((e.hasFocus&&e.hasFocus())||' +
                         '(d.focusElement&&e===d.focusElement))){' + source + '}';
              break;
            default:
              break;
          }
        }
        // :first-child, :last-child, :only-child,
        // :first-child-of-type, :last-child-of-type, :only-child-of-type,
        // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
        else if ((match = selector.match(Patterns.npseudos))) {

          // snapshot collection type Twin or Child
          type = match[4] == 'of-type' ? 'Twin' : 'Child';

          if (match[5]) {
            // remove the ( ) grabbed above
            match[5] = match[5].replace(/\(|\)/g, '');

            if (match[5] == 'even') {
              a = 2;
              b = 0;
            } else if (match[5] == 'odd') {
              a = 2;
              b = 1;
            } else {
              // assumes correct "an+b" format
              a = match[5].match(/^-/) ? -1 : match[5].match(/^n/) ? 1 : 0;
              a = a || ((param = match[5].match(/(-?\d{1,})n/)) ? parseInt(param[1], 10) : 0);
              b = b || ((param = match[5].match(/(-?\d{1,})$/)) ? parseInt(param[1], 10) : 0);
            }

            compare =
              (match[2] == 'last' ?
                '(s.' + type + 'Lengths[s.' + type + 'Parents[k+1]' + ']' +
                (match[4] == 'of-type' ?
                  '[e.nodeName.toUpperCase()]' :
                  '') + '-' + (b - 1) + ')' : b);

            // handle 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
            test = match[5] == 'even' ||
              match[5] == 'odd' ||
              a > Math.abs(b) ?
                ('%' + a + '===' + b) :
              a < 0 ?
                '<=' + compare :
              a > 0 ?
                '>=' + compare :
              a == 0 ?
                '==' + compare :
                '';

            // boolean indicating select (true) or match (false) method
            if (select) {
              // add function for select method (select=true)
              // requires prebuilt arrays get[Childs|Twins]
              source = 'if(s.' + type + 'Indexes[k+1]' + test + '){' + source + '}';
            } else {
              // add function for "match" method (select=false)
              // this will not be in a loop, this is faster
              // for "match" but slower for "select" and it
              // also doesn't require prebuilt node arrays
              source = 'if((n=e)){' +
                'u=1' + (match[4] == 'of-type' ? ',t=e.nodeName;' : ';') +
                'while((n=n.' + (match[2] == 'last' ? 'next' : 'previous') + 'Sibling)){' +
                  'if(n.node' + (match[4] == 'of-type' ? 'Name==t' : 'Type==1') + '){++u;}' +
                '}' +
                'if(u' + test + '){' + source + '}' +
              '}';
            }

          } else {
            // handle 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
            compare =
              's.' + type + 'Lengths[s.' + type + 'Parents[k+1]]' +
              (match[4] == 'of-type' ? '[e.nodeName]' : '');

            if (select) {
              // add function for select method (select=true)
              source = 'if(' +
                (match[2] == 'first' ?
                  's.' + type + 'Indexes[k+1]==1' :
                  match[2] == 'only' ?
                    compare + '==1' :
                      match[2] == 'last' ?
                        's.' + type + 'Indexes[k+1]===' + compare : '') +
                '){' + source + '}';
            } else {
              // add function for match method (select=false)
              source = 'if((n=e)){' +
                (match[4] ? 't=e.nodeName;' : '') +
                'while((n=n.' + (match[2] == 'first' ? 'previous' : 'next') + 'Sibling)&&' +
                  'n.node' + (match[4] ? 'Name!=t' : 'Type!=1') + ');' +
                'if(!n&&(n=e)){' +
                  (match[2] == 'first' || match[2] == 'last' ?
                    '{' + source + '}' :
                    'while((n=n.' + (match[2] == 'first' ? 'next' : 'previous') + 'Sibling)&&' +
                        'n.node' + (match[4] ? 'Name!=t' : 'Type!=1') + ');' +
                    'if(!n){' + source + '}') +
                '}' +
              '}';
            }
          }
        } else throw new Error('NW.Dom.compileSelector: syntax error, unknown selector rule "' + selector + '"');

        selector = match[match.length - 1];
      }

      return source;
    },

  // compile a comma separated group of selector
  compileGroup=
    // selector string for the compiled function,
    // boolean for select (true) or match (false)
    function(selector, select){

      var i = 0, source = '', token, cachedTokens = {},
          parts = selector.split(','), extraVars = '';

      // for each selector in the group
      for ( ; i < parts.length; ++i) {
        token = parts[i].replace(TR, '');
        // if we have a selector string
        if (token && token.length > 0) {
          // avoid repeating the same functions
          if (!cachedTokens[token]) {
            cachedTokens[token] = token;
            // insert corresponding mode function
            if (select) {
              source += compileSelector(token, 'r[r.length]=c[k];', select);
            } else {
              source += compileSelector(token, 'return true;', select);
            }
          }
        }
      }

      if (select) {
        // for select method
        return new Function('c,s', 'var k=-1,e,r=[],n,j,u,t,a;while((e=c[++k])){' + source + '}return r;');
      } else {
        // for match method
        return new Function('e', 'var n,u;' + source  + 'return false;');
      }

    },

  // snapshot of elements contained in rootElement
  // also contains maps to make nth lookups faster
  // updated by each select/match if DOM changes
  Snapshot = {
    Elements: [],
    TwinIndexes: [],
    TwinLengths: [],
    TwinParents: [],
    ChildIndexes: [],
    ChildLengths: [],
    ChildParents: [],
    hasElements: false,
    hasTwinIndexes: false,
    hasChildIndexes: false
  },

  // get element index in a node array
  getIndex =
    function(array, element) {
      // IE only (too slow in opera)
      if (typeof document.fileSize != 'undefined') {
        getIndex = function(array, element) {
          return element.sourceIndex || -1;
        };
      // gecko, webkit have native array indexOf
      } else if (array.indexOf) {
        getIndex = function(array, element) {
          return array.indexOf(element);
        };
      // other browsers will use this replacement
      } else {
        getIndex = function(array, element) {
          var i = array.length;
          while (--i >= 0) {
            if (element == array[i]) {
              break;
            }
          }
          return i;
        };
      }
      // we overwrite the function first time
      // to avoid browser sniffing in loops
      return getIndex(array, element);
    },

  // build a twin index map
  // indexes by child position
  // (f)rom (t)ag
  getTwins =
    function(f, c) {
      var k = 0, e, r, p, s, x,
        h = [f], b = [0], i = [0], l = [0];
      while ((e = c[k++])) {
        h[k] = e;
        l[k] = 0;
        p = e.parentNode;
        r = e.nodeName;
        if (s != p){
          x = getIndex(h, s = p);
        }
        b[k] = x;
        l[x] = l[x] || {};
        l[x][r] = l[x][r] || 0;
        i[k] = ++l[x][r];
      }
      Snapshot.TwinParents = b;
      Snapshot.TwinIndexes = i;
      Snapshot.TwinLengths = l;
    },

  // build a child index map
  // indexes by tag position
  // (f)rom (t)ag
  getChilds =
    function(f, c) {
      var  k = 0, e, p, s, x,
        h = [f], b = [0], i = [0], l = [0];
      while ((e = c[k++])) {
        h[k] = e;
        l[k] = 0;
        p = e.parentNode;
        if (s != p) {
          x = getIndex(h, s = p);
        }
        b[k] = x;
        i[k] = ++l[x];
      }
      Snapshot.ChildParents = b;
      Snapshot.ChildIndexes = i;
      Snapshot.ChildLengths = l;
    },

  caching = false,

  // enable caching system
  // @d optional document context
  setCache =
    function(enable, d) {
      expireCache();
      d || (d = document);
      if (!caching && enable) {
        if (d.documentElement.setExpression) {
          //d.documentElement.setExpression('innerHTML', 'NW.Dom.expireCache()');
        } else {
          // Mozilla/Firefox/Opera/Safari/KHTML (fire for insertion and removal)
          d.addEventListener('DOMNodeInserted', expireCache, false);
          d.addEventListener('DOMNodeRemoved', expireCache, false);
        }
        caching = true;
      } else if (caching) {
        if (d.documentElement.setExpression) {
          //d.documentElement.removeExpression('innerHTML');
        } else {
          d.removeEventListener('DOMNodeInserted', expireCache, false);
          d.removeEventListener('DOMNodeRemoved', expireCache, false);
        }
        caching = false;
      }
    },

  // expose the private method
  expireCache =
    function() {
      Snapshot.hasElements = false;
      Snapshot.hasTwinIndexes = false;
      Snapshot.hasChildIndexes = false;
      cachedResults = {
        from: [],
        items: []
      };
    };

  if (
    document.implementation.hasFeature("MutationEvents", "2.0")||
    document.implementation.hasFeature("Events", "2.0") &&
    document.implementation.hasFeature("Core", "2.0")) {
    window.addEventListener('unload', function() {
        window.removeEventListener('unload', arguments.callee, false);
        setCache(false);
      }, false
    );
    setCache(true);
  }

  // ********** begin public methods **********
  return {

    // for testing purposes only!
    compile: function(selector) {
      return compileGroup(selector, true).toString();
    },

    setCache: setCache,

    // expose the private method
    expireCache: expireCache,

    // element match selector return boolean true/false
    match:
      function(element, selector) {

        // make sure an element node was passed
        if (!(element && element.nodeType == 1)) {
          return false;
        }

        if (typeof selector == 'string' && selector.length) {

          // cache compiled matchers
          if (!compiledMatchers[selector]) {
            compiledMatchers[selector]=compileGroup(selector, false);
          }

          // result of compiled matcher
          return compiledMatchers[selector](element);

        } else throw new Error('NW.Dom.match: "' + selector + '" is not a valid CSS selector.');

        return false;
      },

    // elements matching selector optionally starting from node
    select:
      function(selector, from) {

        var elements = [], match;

        if (!(from && (from.nodeType == 1 || from.nodeType == 9))) {
          from = document;
        }

        if (typeof selector == 'string' && selector.length) {

          // BEGIN REDUCE/OPTIMIZE
          // * (all elements selector)
          if ((match = selector.match(Optimizations.all))) {
            var nodes, node, i = -1;
            // fix IE comments as element
            nodes = from.getElementsByTagName('*');
            while ((node = nodes[++i])) {
              if (node.nodeType == 1) {
                elements[elements.length] = node;
              }
            }
            return elements;
          }
          // #Foo Id (single id selector)
          else if ((match = selector.match(Optimizations.id))) {
            var element = from.getElementById(match[1]);
            return element ? [element] : [];
          }
          // Foo Tag (single tag selector)
          else if ((match = selector.match(Optimizations.tagName))) {
            return toArray(from.getElementsByTagName(match[1]));
          }
          // END REDUCE/OPTIMIZE

          if (caching && Snapshot.hasElements) {
            elements = Snapshot.Elements;
          } else {
            elements = toArray(from.getElementsByTagName('*'));
            Snapshot.Elements = elements;
            Snapshot.hasTwinIndexes = false;
            Snapshot.hasChildIndexes = false;
          }

          if (selector.match(child_pseudo)) {
            if (selector.match(oftype_pseudo)) {
              // special of-type pseudo selectors
              if (!caching || !Snapshot.hasTwinIndexes) {
                getTwins(from, elements);
                Snapshot.hasTwinIndexes = true;
              }
            } else {
              // normal nth/child pseudo selectors
              if (!caching || !Snapshot.hasChildIndexes) {
                getChilds(from, elements);
                Snapshot.hasChildIndexes = true;
              }
            }
          }

          Snapshot.hasElements = true;

          // cache compiled selectors
          if (!compiledSelectors[selector]) {
            compiledSelectors[selector] = compileGroup(selector, true);
          }

          if (caching) {

            // caching of results enabled
            if (!(cachedResults.items[selector] && cachedResults.from[selector] == from)) {
              cachedResults.items[selector] = compiledSelectors[selector](elements, Snapshot);
              cachedResults.from[selector] = from;
            }
            // result is a previously cached
            // selection of the same selector
            return cachedResults.items[selector];

          } else {

            // result is a live selection
            // of the requested selector
            return compiledSelectors[selector](elements, Snapshot);

          }

        } else throw new Error('NW.Dom.select: "' + selector + '" is not a valid CSS selector.');

        return [];
      }

  };
  // *********** end public methods ***********

}();
