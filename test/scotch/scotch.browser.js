/*
 * Copyright (C) 2007-2010 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast CSS selector engine and matcher
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.2.3beta
 * Created: 20070722
 * Release: 20100501
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

(function(global) {

  var version = 'nwmatcher-1.2.3beta',

  doc = global.document,

  root = doc.documentElement,

  lastSlice = '',
  lastMatcher = '',
  lastSelector = '',
  isSingleMatch = false,
  isSingleSelect = false,

  lastMatchContext = doc,
  lastSelectContext = doc,

  encoding = '((?:[-\\w]|[^\\x00-\\xa0]|\\\\.)+)',

  skipgroup = '(?:\\[.*\\]|\\(.*\\))',

  reValidator = /^\s*(\*|[.:#](?:[a-zA-Z]|[^\x00-\xa0])+|[>+~a-zA-Z]|[^\x00-\xa0]|\(.+\)|\[.+\]|\{.+\})/,

  reSimpleNot = /^(\s*([.:#]?([a-zA-Z]+([-\w]*|\\.)*)(\(\d*n?\d*\))?)|[>+~]|\[.*\]|\*)$/,

  reTrimSpaces = /^[\x20\t\n\r\f]+|[\x20\t\n\r\f]+$/g,

  reSplitGroup = /([^,\\()[\]]+|\([^()]+\)|\(.*\)|\[(?:\[[^[\]]*\]|["'][^'"]*["']|[^'"[\]]+)+\]|\[.*\]|\\.)+/g,

  reSplitToken = /([^ >+~,\\()[\]]+|\([^()]+\)|\(.*\)|\[[^[\]]+\]|\[.*\]|\\.)+/g,

  reClassValue = /([-\w]+)/,
  reIdSelector = /\#([-\w]+)$/,
  reWhiteSpace = /[\x20\t\n\r\f]+/g,

  reLeftContext = /^\s*[>+~]+/,
  reRightContext = /[>+~]+\s*$/,

  /*----------------------------- UTILITY METHODS ----------------------------*/

  slice = Array.prototype.slice,

  stripTags = function(s) {
    return s.replace(/<\/?("[^\"]*"|'[^\']*'|[^>])+>/gi, '');
  },

  /*----------------------------- FEATURE TESTING ----------------------------*/

  isNative = (function() {
    var s = (global.open + '').replace(/open/g, '');
    return function(object, method) {
      var m = object ? object[method] : false, r = new RegExp(method, 'g');
      return !!(m && typeof m != 'string' && s === (m + '').replace(r, ''));
    };
  })(),

  isQuirks =
    function(document) {
      return typeof document.compatMode == 'string' ?
        document.compatMode.indexOf('CSS') < 0 :
        (function() {
          var div = document.createElement('div'),
            isStrict = div.style &&
              (div.style.width = 1) &&
              div.style.width != '1px';
          div = null;
          return !isStrict;
        })();
    },

  isXML = 'xmlVersion' in doc ?
    function(document) {
      return !!document.xmlVersion ||
        (/xml$/).test(document.contentType) ||
        !(/html/i).test(document.documentElement.nodeName);
    } :
    function(document) {
      return document.firstChild.nodeType == 7 &&
        (/xml/i).test(document.firstChild.nodeName) ||
        !(/html/i).test(document.documentElement.nodeName);
    },

  isQuirksMode = isQuirks(doc),
  isXMLDocument = isXML(doc),


  NATIVE_FOCUS = isNative(doc, 'hasFocus'),
  NATIVE_QSAPI = isNative(doc, 'querySelector'),
  NATIVE_GEBID = isNative(doc, 'getElementById'),
  NATIVE_GEBTN = isNative(root, 'getElementsByTagName'),
  NATIVE_GEBCN = isNative(root, 'getElementsByClassName'),

  NATIVE_GET_ATTRIBUTE = isNative(root, 'getAttribute'),
  NATIVE_HAS_ATTRIBUTE = isNative(root, 'hasAttribute'),

  NATIVE_SLICE_PROTO =
    (function() {
      var isBuggy = false, id = root.id;
      root.id = 'length';
      try {
        isBuggy = !!slice.call(doc.childNodes, 0)[0];
      } catch(e) { }
      root.id = id;
      return isBuggy;
    })(),

  NATIVE_TRAVERSAL_API =
    'nextElementSibling' in root && 'previousElementSibling' in root,


  BUGGY_GEBID = NATIVE_GEBID ?
    (function() {
      var isBuggy = true, x = 'x' + String(+new Date),
        a = doc.createElementNS ? 'a' : '<a name="' + x + '">';
      (a = doc.createElement(a)).name = x;
      root.insertBefore(a, root.firstChild);
      isBuggy = !!doc.getElementById(x);
      root.removeChild(a);
      a = null;
      return isBuggy;
    })() :
    true,

  BUGGY_GEBTN = NATIVE_GEBTN ?
    (function() {
      var isBuggy, div = doc.createElement('div');
      div.appendChild(doc.createComment(''));
      isBuggy = div.getElementsByTagName('*')[0];
      div.removeChild(div.firstChild);
      div = null;
      return !!isBuggy;
    })() :
    true,

  BUGGY_GEBCN = NATIVE_GEBCN ?
    (function() {
      var isBuggy, div = doc.createElement('div'), test = '\u53f0\u5317';

      div.appendChild(doc.createElement('span')).
        setAttribute('class', test + 'abc ' + test);
      div.appendChild(doc.createElement('span')).
        setAttribute('class', 'x');

      isBuggy = !div.getElementsByClassName(test)[0];

      div.lastChild.className = test;
      if (!isBuggy)
        isBuggy = div.getElementsByClassName(test).length !== 2;

      div.removeChild(div.firstChild);
      div.removeChild(div.firstChild);
      div = null;
      return isBuggy;
    })() :
    true,

  BUGGY_GET_ATTRIBUTE = NATIVE_GET_ATTRIBUTE ?
    (function() {
      var isBuggy, input;
      (input = doc.createElement('input')).setAttribute('value', '5');
      return isBuggy = input.defaultValue != 5;
    })() :
    true,

  BUGGY_HAS_ATTRIBUTE = NATIVE_HAS_ATTRIBUTE ?
    (function() {
      var isBuggy, option = doc.createElement('option');
      option.setAttribute('selected', 'selected');
      isBuggy = !option.hasAttribute('selected');
      return isBuggy;
    })() :
    true,

  BUGGY_SELECTED =
    (function() {
      var isBuggy, select = doc.createElement('select');
      select.appendChild(doc.createElement('option'));
      isBuggy = !select.firstChild.selected;
      return isBuggy;
    })(),

  RE_BUGGY_QSAPI = NATIVE_QSAPI ?
    (function() {
      var pattern = [ ], div = doc.createElement('div'), input;


      div.appendChild(doc.createElement('p')).setAttribute('class', 'xXx');
      div.appendChild(doc.createElement('p')).setAttribute('class', 'xxx');
      if (isQuirks(doc) &&
        (div.querySelectorAll('[class~=xxx]').length != 2 ||
        div.querySelectorAll('.xXx').length != 2)) {
        pattern.push('(?:\\[[\\x20\\t\\n\\r\\f]*class\\b|\\.' + encoding + ')');
      }
      div.removeChild(div.firstChild);
      div.removeChild(div.firstChild);

      div.appendChild(doc.createElement('p')).setAttribute('class', '');
      try {
        div.querySelectorAll('[class^=""]').length === 1 &&
          pattern.push('\\[\\s*.*(?=\\^=|\\$=|\\*=).*]');
      } catch(e) { }
      div.removeChild(div.firstChild);

      (input = doc.createElement('input')).setAttribute('type', 'hidden');
      div.appendChild(input);
      try {
        div.querySelectorAll(':enabled').length === 1 &&
          pattern.push(':enabled', ':disabled');
      } catch(e) { }
      div.removeChild(div.firstChild);

      div.appendChild(doc.createElement('a')).setAttribute('href', 'x');
      div.querySelectorAll(':link').length !== 1 && pattern.push(':link');
      div.removeChild(div.firstChild);

      pattern.push(':target', ':selected', ':contains');

      if (BUGGY_HAS_ATTRIBUTE) {
        pattern.push(
          '\\[\\s*value',
          '\\[\\s*ismap',
          '\\[\\s*checked',
          '\\[\\s*disabled',
          '\\[\\s*multiple',
          '\\[\\s*readonly',
          '\\[\\s*selected');
      }

      div = null;
      return pattern.length ?
        new RegExp(pattern.join('|')) :
        { 'test': function() { return false; } };
    })() :
    true,

  RE_SIMPLE_SELECTOR = new RegExp(
    !(BUGGY_GEBTN && BUGGY_GEBCN) ?
      '^(?:\\*|[.#]?[a-zA-Z]+' + encoding + ')$' :
      '^#?[a-zA-Z]+' + encoding + '$'),

  /*----------------------------- LOOKUP OBJECTS -----------------------------*/

  LINK_NODES = { 'a': 1, 'A': 1, 'area': 1, 'AREA': 1, 'link': 1, 'LINK': 1 },

  QSA_NODE_TYPES = { '9': 1, '11': 1 },

  ATTR_BOOLEAN = {
    checked: 1, disabled: 1, ismap: 1, multiple: 1, readonly: 1, selected: 1
  },

  ATTR_URIDATA = {
    'action': 2, 'cite': 2, 'codebase': 2, 'data': 2, 'href': 2,
    'longdesc': 2, 'lowsrc': 2, 'src': 2, 'usemap': 2
  },

  HTML_TABLE = {
    'class': 0,
    'accept': 1, 'accept-charset': 1, 'align': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'checked': 1, 'clear': 1, 'codetype': 1, 'color': 1,
    'compact': 1, 'declare': 1, 'defer': 1, 'dir': 1, 'direction': 1, 'disabled': 1,
    'enctype': 1, 'face': 1, 'frame': 1, 'hreflang': 1, 'http-equiv': 1, 'lang': 1,
    'language': 1, 'link': 1, 'media': 1, 'method': 1, 'multiple': 1, 'nohref': 1,
    'noresize': 1, 'noshade': 1, 'nowrap': 1, 'readonly': 1, 'rel': 1, 'rev': 1,
    'rules': 1, 'scope': 1, 'scrolling': 1, 'selected': 1, 'shape': 1, 'target': 1,
    'text': 1, 'type': 1, 'valign': 1, 'valuetype': 1, 'vlink': 1
  },

  XHTML_TABLE = {
    'accept': 1, 'accept-charset': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'codetype': 1, 'color': 1,
    'enctype': 1, 'face': 1, 'hreflang': 1, 'http-equiv': 1,
    'lang': 1, 'language': 1, 'link': 1, 'media': 1, 'rel': 1,
    'rev': 1, 'target': 1, 'text': 1, 'type': 1, 'vlink': 1
  },

  /*-------------------------- REGULAR EXPRESSIONS ---------------------------*/

  Selectors = {
  },

  Operators = {
     '=': "n=='%m'",
    '^=': "n.indexOf('%m')==0",
    '*=': "n.indexOf('%m')>-1",
    '|=': "(n+'-').indexOf('%m-')==0",
    '~=': "(' '+n+' ').indexOf(' %m ')>-1",
    '$=': "n.substr(n.length-'%m'.length)=='%m'"
  },

  Optimize = {
    ID: new RegExp("^#" + encoding + "|" + skipgroup),
    TAG: new RegExp("^" + encoding + "|" + skipgroup),
    CLASS: new RegExp("^\\." + encoding + "$|" + skipgroup),
    NAME: /\[\s*name\s*=\s*((["']*)([^'"()]*?)\2)?\s*\]/
  },

  Patterns = {
    attribute: /^\[[\x20\t\n\r\f]*([-\w\\]*:?(?:[-\w\\])+)[\x20\t\n\r\f]*(?:([~*^$|!]?=)[\x20\t\n\r\f]*(["']*)([^'"()]*?)\3)?[\x20\t\n\r\f]*\](.*)/,
    spseudos: /^\:(root|empty|nth)?-?(first|last|only)?-?(child)?-?(of-type)?(?:\(([^\x29]*)\))?(.*)/,
    dpseudos: /^\:([\w]+|[^\x00-\xa0]+)(?:\((["']*)(.*?(\(.*\))?[^'"()]*?)\2\))?(.*)/,
    children: /^[\x20\t\n\r\f]*\>[\x20\t\n\r\f]*(.*)/,
    adjacent: /^[\x20\t\n\r\f]*\+[\x20\t\n\r\f]*(.*)/,
    relative: /^[\x20\t\n\r\f]*\~[\x20\t\n\r\f]*(.*)/,
    ancestor: /^[\x20\t\n\r\f]+(.*)/,
    universal: /^\*(.*)/,
    id: new RegExp("^#" + encoding + "(.*)"),
    tagName: new RegExp("^" + encoding + "(.*)"),
    className: new RegExp("^\\." + encoding + "(.*)")
  },

  CSS3PseudoClasses = {
    Structural: {
      'root': 3, 'empty': 3,
      'first-child': 3, 'last-child': 3, 'only-child': 3,
      'first-of-type': 3, 'last-of-type': 3, 'only-of-type': 3,
      'first-child-of-type': 3, 'last-child-of-type': 3, 'only-child-of-type': 3,
      'nth-child': 3, 'nth-last-child': 3, 'nth-of-type': 3, 'nth-last-of-type': 3
    },

    Others: {
      'checked': 3, 'disabled': 3, 'enabled': 3, 'selected': 2, 'indeterminate': '?',
      'active': 3, 'focus': 3, 'hover': 3, 'link': 3, 'visited': 3,
      'target': 3, 'lang': 3, 'not': 3,
      'contains': '?'
    }
  },

  /*------------------------------ DOM METHODS -------------------------------*/

  concatList =
    function(data, elements) {
      var i = -1, element;
      if (data.length === 0 && Array.slice)
        return Array.slice(elements);
      while ((element = elements[++i]))
        data[data.length] = element;
      return data;
    },

  concatCall =
    function(data, elements, callback) {
      var i = -1, element;
      while ((element = elements[++i]))
        callback(data[data.length] = element);
      return data;
    },

  byIdRaw =
    function(id, elements) {
      var i = -1, element = null;
      while ((element = elements[++i])) {
        if (element.getAttribute('id') == id) {
          break;
        }
      }
      return element;
    },

  byId = !BUGGY_GEBID ?
    function(id, from) {
      from || (from = doc);
      id = id.replace(/\\/g, '');
      if (isXMLDocument || from.nodeType != 9) {
        return byIdRaw(id, from.getElementsByTagName('*'));
      }
      return from.getElementById(id);
    } :
    function(id, from) {
      var element = null;
      from || (from = doc);
      id = id.replace(/\\/g, '');
      if (isXMLDocument || from.nodeType != 9) {
        return byIdRaw(id, from.getElementsByTagName('*'));
      }
      if ((element = from.getElementById(id)) &&
        element.name == id && from.getElementsByName) {
        return byIdRaw(id, from.getElementsByName(id));
      }
      return element;
    },

  byTagRaw = function(tag, node) {
    var elements = [], i = 0, anyTag = tag === "*", next = node.firstChild;
    while ((node = next)) {
      if (node.nodeName > '@') elements[i++] = node;
      next = node.firstChild || node.nextSibling;
      while (!next && (node = node.parentNode)) next = node.nextSibling;
    }
    return elements;
  },

  byTag = !BUGGY_GEBTN && NATIVE_SLICE_PROTO ?
    function(tag, from) {
      from || (from = doc);
      return slice.call(from.getElementsByTagName ?
        from.getElementsByTagName(tag) :
        byTagRaw(tag, from), 0);
    } :
    function(tag, from) {
      var i = -1, data = [ ],
        element, elements = (from || doc).getElementsByTagName(tag);
      if (tag == '*') {
        var j = -1;
        while ((element = elements[++i])) {
          if (element.nodeName > '@')
            data[++j] = element;
        }
      } else {
        while ((element = elements[++i])) {
          data[i] = element;
        }
      }
      return data;
    },

  byName =
    function(name, from) {
      return select('[name="' + name.replace(/\\/g, '') + '"]', from || doc);
    },

  byClass = !BUGGY_GEBCN && NATIVE_SLICE_PROTO ?
    function(className, from) {
      return slice.call((from || doc).getElementsByClassName(className.replace(/\\/g, '')), 0);
    } :
    function(className, from) {
      from || (from = doc);
      var i = -1, j = i,
        data = [ ], element,
        host = from.ownerDocument || from,
        elements = from.getElementsByTagName('*'),
        quirks = isQuirks(host), xml = isXML(host),
        n = quirks ? className.toLowerCase() : className;
      className = ' ' + n.replace(/\\/g, '') + ' ';
      while ((element = elements[++i])) {
        n = xml ? element.getAttribute('class') : element.className;
        if (n && n.length && (' ' + (quirks ? n.toLowerCase() : n).
          replace(reWhiteSpace, ' ') + ' ').indexOf(className) > -1) {
          data[++j] = element;
        }
      }
      return data;
    },

  contains = 'compareDocumentPosition' in root ?
    function(container, element) {
      return (container.compareDocumentPosition(element) & 16) == 16;
    } : 'contains' in root ?
    function(container, element) {
      return container !== element && container.contains(element);
    } :
    function(container, element) {
      while ((element = element.parentNode)) {
        if (element === container) return true;
      }
      return false;
    },

  getIndexesByNodeType =
    function(element) {
      var i = 0, indexes,
        id = element[CSS_INDEX] || (element[CSS_INDEX] = ++CSS_ID);
      if (!indexesByNodeType[id]) {
        indexes = { };
        element = element.firstChild;
        while (element) {
          if (element.nodeName > '@') {
            indexes[element[CSS_INDEX] || (element[CSS_INDEX] = ++CSS_ID)] = ++i;
          }
          element = element.nextSibling;
        }
        indexes.length = i;
        indexesByNodeType[id] = indexes;
      }
      return indexesByNodeType[id];
    },

  getIndexesByNodeName =
    function(element, name) {
      var i = 0, indexes,
        id = element[CSS_INDEX] || (element[CSS_INDEX] = ++CSS_ID);
      if (!indexesByNodeName[id] || !indexesByNodeName[id][name]) {
        indexes = { };
        element = element.firstChild;
        while (element) {
          if (element.nodeName.toUpperCase() == name) {
            indexes[element[CSS_INDEX] || (element[CSS_INDEX] = ++CSS_ID)] = ++i;
          }
          element = element.nextSibling;
        }
        indexes.length = i;
        indexesByNodeName[id] ||
          (indexesByNodeName[id] = { });
        indexesByNodeName[id][name] = indexes;
      }
      return indexesByNodeName[id];
    },

  getAttribute = !BUGGY_GET_ATTRIBUTE ?
    function(node, attribute) {
      return node.getAttribute(attribute) || '';
    } :
    function(node, attribute) {
      attribute = attribute.toLowerCase();
      if (typeof node.form !== 'undefined') {
        switch(attribute) {
          case 'value':
            if ('defaultValue' in node) return node.defaultValue || '';
            break;
          case 'checked':
            return node.defaultChecked && attribute;
          case 'selected':
            return node.defaultSelected && attribute;
          default:
            break;
        }
      }
      return (
        ATTR_URIDATA[attribute] ? node.getAttribute(attribute, 2) || '' :
        ATTR_BOOLEAN[attribute] ? node.getAttribute(attribute) ? attribute : '' :
          ((node = node.getAttributeNode(attribute)) && node.value) || '');
    },

  hasAttribute = !BUGGY_HAS_ATTRIBUTE ?
    function(node, attribute) {
      return node.hasAttribute(attribute);
    } : NATIVE_HAS_ATTRIBUTE ?
    function(node, attribute) {
      return !!node.getAttribute(attribute);
    } :
    function(node, attribute) {
      node = node.getAttributeNode(attribute);
      return !!(node && (node.specified || node.nodeValue));
    },

  isEmpty =
    function(node) {
      node = node.firstChild;
      while (node) {
        if (node.nodeType == 3 || node.nodeName > '@') return false;
        node = node.nextSibling;
      }
      return true;
    },

  isLink =
    function(element) {
      return hasAttribute(element,'href') && LINK_NODES[element.nodeName];
    },

  /*------------------------------- DEBUGGING --------------------------------*/

  compile =
    function(selector, mode) {
      return compileGroup(selector, '', mode || false);
    },

  configure =
    function(options) {
      for (var i in options) {
        if (i == 'VERBOSITY') {
          VERBOSITY = !!options[i];
        } else if (i == 'SIMPLENOT') {
          SIMPLENOT = !!options[i];
          HTMLResolvers = { };
          XMLResolvers = { };
          HTMLMatchers = { };
          XMLMatchers = { };
        } else if (i == 'SHORTCUTS') {
          SHORTCUTS = !!options[i];
        } else if (i == 'USE_QSAPI') {
          USE_QSAPI = !!options[i] && NATIVE_QSAPI;
        }
      }
    },

  emit =
    function(message) {
      if (VERBOSITY) {
        if (typeof global.DOMException !== 'undefined') {
          var err = new Error();
          err.message = message; err.code = 12;
          err.name = 'DOMException SYNTAX_ERR';
          throw err;
        } else {
          throw new Error(12, 'DOMException: ' + message);
        }
      } else {
        var console = global.console;
        if (console && console.log) {
          console.log(message);
        } else {
          if (/exception/i.test(message)) {
            global.status = message;
            global.defaultStatus = message;
          } else {
            global.status += message;
          }
        }
      }
    },

  SIMPLENOT = true,

  SHORTCUTS = false,

  VERBOSITY = true,

  USE_QSAPI = NATIVE_QSAPI,

  /*---------------------------- COMPILER METHODS ----------------------------*/

  ACCEPT_NODE = 'f&&f(c[k]);r[r.length]=c[k];continue main;',

  TO_UPPER_CASE = typeof doc.createElementNS == 'function' ?
    '.toUpperCase()' : '',

  CONTAINS_TEXT =
    'textContent' in root ?
    'e.textContent' :
    (function() {
      var div = doc.createElement('div'), p;
      div.appendChild(p = doc.createElement('p'));
      p.appendChild(doc.createTextNode('p'));
      div.style.display = 'none';
      return div.innerText ?
        'e.innerText' :
        's.stripTags(e.innerHTML)';
    })(),

  compileGroup =
    function(selector, source, mode) {
      var i = -1, seen = { }, parts, token;
      if ((parts = selector.match(reSplitGroup))) {
        while ((token = parts[++i])) {
          token = token.replace(reTrimSpaces, '');
          if (!seen[token]) {
            seen[token] = true;
            source += i > 0 ? (mode ? 'e=c[k];': 'e=k;') : '';
            source += compileSelector(token, mode ? ACCEPT_NODE : 'f&&f(k);return true;');
          }
        }
      }
      if (mode) {
        return new Function('c,s,r,d,h,g,f',
          'var N,n,x=0,k=-1,e;main:while(e=c[++k]){' + source + '}return r;');
      } else {
        return new Function('e,s,r,d,h,g,f',
          'var N,n,x=0,k=e;' + source + 'return false;');
      }
    },

  compileSelector =
    function(selector, source) {

      var i, a, b, n, k, expr, match, result, status, test, type;

      k = 0;

      while (selector) {

        if ((match = selector.match(Patterns.universal))) {
          true;
        }

        else if ((match = selector.match(Patterns.id))) {
          source = 'if(' + (isXMLDocument ?
            's.getAttribute(e,"id")' :
            '(e.submit?s.getAttribute(e,"id"):e.id)') +
            '=="' + match[1] + '"' +
            '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.tagName))) {
          source = 'if(e.nodeName' + (isXMLDocument ?
            '=="' + match[1] + '"' : TO_UPPER_CASE +
            '=="' + match[1].toUpperCase() + '"') +
            '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.className))) {
          source = 'if((n=' + (isXMLDocument ?
            's.getAttribute(e,"class")' : 'e.className') +
            ')&&n.length&&(" "+' + (isQuirksMode ? 'n.toLowerCase()' : 'n') +
            '.replace(' + reWhiteSpace +'," ")+" ").indexOf(" ' +
            (isQuirksMode ? match[1].toLowerCase() : match[1]) + ' ")>-1' +
            '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.attribute))) {
          expr = match[1].split(':');
          expr = expr.length == 2 ? expr[1] : expr[0] + '';

          if (match[2] && !Operators[match[2]]) {
            emit('unsupported operator in attribute selectors "' + selector + '"');
            return '';
          }

          if (match[2] && match[4] && (type = Operators[match[2]])) {
            HTML_TABLE['class'] = isQuirksMode ? 1 : 0;
            match[4] = match[4].replace(/\\([0-9a-f]{2,2})/, '\\x$1');
            test = (isXMLDocument ? XHTML_TABLE : HTML_TABLE)[expr.toLowerCase()];
            type = type.replace(/\%m/g, test ? match[4].toLowerCase() : match[4]);
          } else {
            test = false;
            type = match[2] == '=' ? 'n==""' : 'false';
          }

          expr = 'n=s.' + (match[2] ? 'get' : 'has') +
            'Attribute(e,"' + match[1] + '")' +
            (test ? '.toLowerCase();' : ';');

          source = expr + 'if(' + (match[2] ? type : 'n') + '){' + source + '}';
        }

        else if ((match = selector.match(Patterns.adjacent))) {
          k++;
          source = NATIVE_TRAVERSAL_API ?
            'var N' + k + '=e;if(e&&(e=e.previousElementSibling)){' + source + '}e=N' + k + ';' :
            'var N' + k + '=e;while(e&&(e=e.previousSibling)){if(e.nodeName>"@"){' + source + 'break;}}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.relative))) {
          k++;
          source = NATIVE_TRAVERSAL_API ?
            ('var N' + k + '=e;e=e.parentNode.firstElementChild;' +
            'while(e&&e!=N' + k + '){' + source + 'e=e.nextElementSibling;}e=N' + k + ';') :
            ('var N' + k + '=e;e=e.parentNode.firstChild;' +
            'while(e&&e!=N' + k + '){if(e.nodeName>"@"){' + source + '}e=e.nextSibling;}e=N' + k + ';');
        }

        else if ((match = selector.match(Patterns.children))) {
          k++;
          source = 'var N' + k + '=e;if(e&&e!==h&&e!==g&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.ancestor))) {
          k++;
          source = 'var N' + k + '=e;while(e&&e!==h&&e!==g&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }

        else if ((match = selector.match(Patterns.spseudos)) &&
          CSS3PseudoClasses.Structural[selector.match(reClassValue)[0]]) {

          switch (match[1]) {
            case 'root':
              source = 'if(e===h){' + source + '}';
              break;

            case 'empty':
              source = 'if(s.isEmpty(e)){' + source + '}';
              break;

            default:
              if (match[1] && match[5]) {
                if (match[5] == 'n') {
                  source = 'if(e!==h){' + source + '}';
                  break;
                } else if (match[5] == 'even') {
                  a = 2;
                  b = 0;
                } else if (match[5] == 'odd') {
                  a = 2;
                  b = 1;
                } else {
                  b = ((n = match[5].match(/(-?\d{1,})$/)) ? parseInt(n[1], 10) : 0);
                  a = ((n = match[5].match(/(-?\d{0,})n/)) ? parseInt(n[1], 10) : 0);
                  if (n && n[1] == '-') a = -1;
                }

                type = match[4] ? 'n[N]' : 'n';
                expr = match[2] == 'last' && b >= 0 ? type + '.length-(' + (b - 1) + ')' : b;

                type = type + '[e.' + CSS_INDEX + ']';

                test =  b < 1 && a > 1 ? '(' + type + '-(' + expr + '))%' + a + '==0' : a > +1 ?
                  (match[2] == 'last') ? '(' + type + '-(' + expr + '))%' + a + '==0' :
                  type + '>=' + expr + '&&(' + type + '-(' + expr + '))%' + a + '==0' : a < -1 ?
                  (match[2] == 'last') ? '(' + type + '-(' + expr + '))%' + a + '==0' :
                  type + '<=' + expr + '&&(' + type + '-(' + expr + '))%' + a + '==0' : a=== 0 ?
                  type + '==' + expr : a == -1 ? type + '<=' + expr : type + '>=' + expr;

                source =
                  (match[4] ? 'N=e.nodeName' + TO_UPPER_CASE + ';' : '') +
                  'if(e!==h){' +
                    'n=s.getIndexesBy' + (match[4] ? 'NodeName' : 'NodeType') +
                    '(e.parentNode' + (match[4] ? ',N' : '') + ');' +
                    'if(' + test + '){' + source + '}' +
                  '}';

              } else {
                a = match[2] == 'first' ? 'previous' : 'next';
                n = match[2] == 'only' ? 'previous' : 'next';
                b = match[2] == 'first' || match[2] == 'last';

                type = match[4] ? '&&n.nodeName!=e.nodeName' : '&&n.nodeName<"@"';

                source = 'if(e!==h){' +
                  ( 'n=e;while((n=n.' + a + 'Sibling)' + type + ');if(!n){' + (b ? source :
                    'n=e;while((n=n.' + n + 'Sibling)' + type + ');if(!n){' + source + '}') + '}' ) + '}';
              }
              break;
          }
        }

        else if ((match = selector.match(Patterns.dpseudos)) &&
          CSS3PseudoClasses.Others[selector.match(reClassValue)[0]]) {

          switch (match[1]) {
            case 'not':
              expr = match[3].replace(reTrimSpaces, '');

              if (SIMPLENOT && !reSimpleNot.test(expr)) {
                emit('negated pseudo-class only accept simple selectors "' + selector + '"');
                return '';
              } else {
                if ('compatMode' in doc) {
                  source = 'N=' + compileGroup(expr, '', false) + '(e,s,r,d,h,g);if(!N){' + source + '}';
                } else {
                  source = 'if(!s.match(e, "' + expr.replace(/\x22/g, '\\"') + '",r)){' + source +'}';
                }
              }
              break;

            case 'checked':
              source = 'if(((typeof e.form!=="undefined"&&(/radio|checkbox/i).test(e.type))||/option/i.test(e.nodeName))&&(e.checked||e.selected)){' + source + '}';
              break;
            case 'enabled':
              source = 'if(((typeof e.form!=="undefined"&&!(/hidden/i).test(e.type))||s.isLink(e))&&!e.disabled){' + source + '}';
              break;
            case 'disabled':
              source = 'if(((typeof e.form!=="undefined"&&!(/hidden/i).test(e.type))||s.isLink(e))&&e.disabled){' + source + '}';
              break;

            case 'lang':
              test = '';
              if (match[3]) test = match[3].substr(0, 2) + '-';
              source = 'do{(n=e.lang||"").toLowerCase();' +
                'if((n==""&&h.lang=="' + match[3].toLowerCase() + '")||' +
                '(n&&(n=="' + match[3].toLowerCase() +
                '"||n.substr(0,3)=="' + test.toLowerCase() + '")))' +
                '{' + source + 'break;}}while((e=e.parentNode)&&e!==g);';
              break;

            case 'target':
              n = doc.location ? doc.location.hash : '';
              if (n) {
                source = 'if(e.id=="' + n.slice(1) + '"){' + source + '}';
              }
              break;

            case 'link':
              source = 'if(s.isLink(e)&&!e.visited){' + source + '}';
              break;
            case 'visited':
              source = 'if(s.isLink(e)&&e.visited){' + source + '}';
              break;

            case 'active':
              if (isXMLDocument) break;
              source = 'if(e===d.activeElement){' + source + '}';
              break;
            case 'hover':
              if (isXMLDocument) break;
              source = 'if(e===d.hoverElement){' + source + '}';
              break;
            case 'focus':
              if (isXMLDocument) break;
              source = NATIVE_FOCUS ?
                'if(e===d.activeElement&&d.hasFocus()&&(e.type||e.href)){' + source + '}' :
                'if(e===d.activeElement&&(e.type||e.href)){' + source + '}';
              break;

            case 'contains':
              source = 'if(' + CONTAINS_TEXT + '.indexOf("' + match[3] + '")>-1){' + source + '}';
              break;
            case 'selected':
              expr = BUGGY_SELECTED ? '||(n=e.parentNode)&&n.options[n.selectedIndex]===e' : '';
              source = 'if(e.nodeName=="OPTION"&&(e.selected' + expr + ')){' + source + '}';
              break;

            default:
              break;
          }
        } else {

          expr = false;
          status = true;

          for (expr in Selectors) {
            if ((match = selector.match(Selectors[expr].Expression))) {
              result = Selectors[expr].Callback(match, source);
              source = result.source;
              status = result.status;
              if (status) break;
            }
          }

          if (!status) {
            emit('unknown pseudo selector "' + selector + '"');
            return '';
          }

          if (!expr) {
            emit('unknown token in selector "' + selector + '"');
            return '';
          }

        }

        selector = match && match[match.length - 1];
      }

      return source;
    },

  /*----------------------------- QUERY METHODS ------------------------------*/

  match =
    function(element, selector, from, callback) {

      var changed, parts, resolver;

      if (!element || element.nodeName < 'A') {
        emit('passed element is not a DOM ELEMENT_NODE !');
        return false;
      }

//      if (from && !contains(from, element) || !selector) return false;

      selector = selector.replace(reTrimSpaces, '');

      from || (from = doc);

      if (lastMatchContext != from) {
        lastMatchContext = from;
        root = (doc = element.ownerDocument || element).documentElement;
        isQuirksMode = isQuirks(doc);
        isXMLDocument = isXML(doc);
      }

      if (changed = lastMatcher != selector) {
        if (reValidator.test(selector)) {
          lastMatcher = selector;
          isSingleMatch = (parts = selector.match(reSplitGroup)).length < 2;
        } else {
          emit('"' + selector + '" is not a valid CSS selector.');
          return false;
        }
      }

      if (isXMLDocument && !(resolver = XMLMatchers[selector])) {
        resolver = XMLMatchers[selector] = isSingleMatch ?
          new Function('e,s,r,d,h,g,f', 'var N,n,x=0,k=e;' +
            compileSelector(selector, 'f&&f(k);return true;') +
            'return false;') : compileGroup(selector, '', false);
      } else if (!(resolver = HTMLMatchers[selector])) {
        resolver = HTMLMatchers[selector] = isSingleMatch ?
          new Function('e,s,r,d,h,g,f', 'var N,n,x=0,k=e;' +
            compileSelector(selector, 'f&&f(k);return true;') +
            'return false;') : compileGroup(selector, '', false);
      }

      indexesByNodeType = { };
      indexesByNodeName = { };

      return resolver(element, snap, [ ], doc, root, from || doc, callback);
    },

  select =
    function(selector, from, callback) {

      var i, changed, element, elements, parts, resolver, token;

      if (arguments.length === 0) {
        emit('missing required selector parameters');
        return [ ];
      } else if (selector === '') {
        emit('empty selector string');
        return [ ];
      } else if (typeof selector != 'string') {
        return [ ];
      }

      selector = selector.replace(reTrimSpaces, '');

      from || (from = doc);

      if (RE_SIMPLE_SELECTOR.test(selector)) {
        switch (selector.charAt(0)) {
          case '#':
            if ((element = byId(selector.slice(1), from))) {
              callback && callback(element);
              return [ element ];
            }
            return [ ];
          case '.':
            elements = byClass(selector.slice(1), from);
            break;
          default:
            elements = byTag(selector, from);
            break;
        }
        return callback ?
          concatCall([ ], elements, callback) : elements;
      }

      if (USE_QSAPI && !RE_BUGGY_QSAPI.test(selector) &&
        (!from || QSA_NODE_TYPES[from.nodeType])) {

        try {
          elements = (from || doc).querySelectorAll(selector);
        } catch(e) { if (selector === '') throw e; }

        if (elements) {
          switch (elements.length) {
            case 0:
              return [ ];
            case 1:
              element = elements.item(0);
              callback && callback(element);
              return [ element ];
            default:
              return callback ?
                concatCall([ ], elements, callback) :
                NATIVE_SLICE_PROTO ?
                  slice.call(elements) :
                  concatList([ ], elements);
          }
        }
      }

      if (SHORTCUTS) {
        if (reLeftContext.test(selector)) {
          selector = !from ? '*' + selector :
            from.id ? '#' + from.id + selector :
              selector;
        }
        if (reRightContext.test(selector)) {
          selector = selector + '*';
        }
      }

      if (lastSelectContext != from) {
        lastSelectContext = from;
        root = (doc = from.ownerDocument || from).documentElement;
        isQuirksMode = isQuirks(doc);
        isXMLDocument = isXML(doc);
      }

      if (changed = lastSelector != selector) {
        if (reValidator.test(selector)) {
          lastSelector = selector;
          isSingleSelect = (parts = selector.match(reSplitGroup)).length < 2;
        } else {
          emit('"' + selector + '" is not a valid CSS selector.');
          return [ ];
        }
      }


      if (isSingleSelect && from.nodeType != 11) {

        if (changed) {
          parts = selector.match(reSplitToken);
          token = parts[parts.length - 1];

          lastSlice = token.split(':not')[0];
        }

        if ((parts = lastSlice.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = byId(token, from))) {
            if (match(element, selector)) {
              callback && callback(element);
              return [ element ];
            }
          }
          return [ ];
        }

        else if ((parts = selector.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = byId(token, doc))) {
            if (/[>+~]/.test(selector)) {
              from = element.parentNode;
            } else {
              selector = selector.replace('#' + token, '*');
              from = element;
            }
          } else return [ ];
        }

        if (NATIVE_GEBCN) {
          if ((parts = lastSlice.match(Optimize.CLASS)) && (token = parts[1])) {
            if ((elements = byClass(token, from)).length === 0) { return [ ]; }
          } else if ((parts = lastSlice.match(Optimize.TAG)) && (token = parts[1])) {
            if ((elements = byTag(token, from)).length === 0) { return [ ]; }
          }
        } else {
          if ((parts = lastSlice.match(Optimize.TAG)) && (token = parts[1])) {
            if ((elements = from.getElementsByTagName(token)).length === 0) { return [ ]; }
          } else if ((parts = lastSlice.match(Optimize.CLASS)) && (token = parts[1])) {
            if ((elements = byClass(token, from)).length === 0) { return [ ]; }
          }
        }

      }

      if (!elements) {
        elements = byTag('*', from);
      }

      if (isXMLDocument && !(resolver = XMLResolvers[selector])) {
        resolver = XMLResolvers[selector] = isSingleSelect ?
          new Function('c,s,r,d,h,g,f',
            'var N,n,x=0,k=-1,e;main:while(e=c[++k]){' +
            compileSelector(selector, ACCEPT_NODE) + '}return r;') :
          compileGroup(selector, '', true);
      } else if (!(resolver = HTMLResolvers[selector])) {
        resolver = HTMLResolvers[selector] = isSingleSelect ?
          new Function('c,s,r,d,h,g,f',
            'var N,n,x=0,k=-1,e;main:while(e=c[++k]){' +
            compileSelector(selector, ACCEPT_NODE) + '}return r;') :
          compileGroup(selector, '', true);
      }

      indexesByNodeType = { };
      indexesByNodeName = { };

      return resolver(elements, snap, [ ], doc, root, from, callback);
    },

  /*-------------------------------- STORAGE ---------------------------------*/

  CSS_ID = 1,

  CSS_INDEX = 'uniqueID' in root ? 'uniqueID' : 'CSS_ID',

  indexesByNodeType = { },
  indexesByNodeName = { },

  HTMLResolvers = { },
  XMLResolvers = { },

  HTMLMatchers = { },
  XMLMatchers = { },

  snap = {

    getIndexesByNodeType: getIndexesByNodeType,
    getIndexesByNodeName: getIndexesByNodeName,

    getAttribute: getAttribute,
    hasAttribute: hasAttribute,

    byClass: byClass,
    byName: byName,
    byTag: byTag,
    byId: byId,

    stripTags: stripTags,
    isEmpty: isEmpty,
    isLink: isLink,

    select: select,
    match: match
  };

  /*------------------------------- PUBLIC API -------------------------------*/

  global.NW || (global.NW = { });

  NW.Dom = {

    byId: byId,

    byTag: byTag,

    byName: byName,

    byClass: byClass,

    getAttribute: getAttribute,

    hasAttribute: hasAttribute,

    match: match,

    select: select,

    compile: compile,

    configure: configure,

    registerOperator:
      function(symbol, resolver) {
        if (!Operators[symbol]) {
          Operators[symbol] = resolver;
        }
      },

    registerSelector:
      function(name, rexp, func) {
        if (!Selectors[name]) {
          Selectors[name] = { };
          Selectors[name].Expression = rexp;
          Selectors[name].Callback = func;
        }
      }
  };

})(this);

/*! Scotch JavaScript unit testing library (Browser version) 0.3.1
*  (c) 2010 Kit Goncharov (http://kitgoncharov.github.com)
*  Distributed under an MIT-style license. For details, see the Scotch web site: <http://kitgoncharov.github.com/scotch>
*
*  Acknowledgements:
		*  Diego Perini (NWMatcher; http://javascript.nwbox.com/NWMatcher)
		*  John-David Dalton (FuseJS; http://fusejs.com, http://allyoucanleet.com)
		*  Andrea Giammarchi (http://webreflection.blogspot.com/)
		*  Tobie Langel (Evidence; http://tobielangel.com, http://evidencejs.org)
		*  Thomas Fuchs (Script.aculo.us; http://script.aculo.us, http://mir.aculo.us)
		*  Jon Tirsen (http://www.tirsen.com)
		*  Michael Schuerig (http://www.schuerig.de/michael/)
*
*  Built: Tue. May 11 2010 13:05:46 CEST
*  ----------------------------------------------------------------------------*/

(function(global){
	var originalScotch = global.Scotch,
	UNDEFINED_TYPE = "undefined",
	Scotch = global.Scotch = (function(){
		var Runners = [];
		function run(){
			for(var index = 0, length = Runners.length; index < length; index++){
				Runners[index].run();
			}
			return Runners;
		}
		function ninja(){
			delete Scotch.ninja;
			if(typeof(originalScotch) === UNDEFINED_TYPE){
				delete global.Scotch;
			}else{
				global.Scotch = originalScotch;
			}
			return Scotch;
		}
		return {
			Version: "0.3.1",
			Runners: Runners,
			run: run,
			ninja: ninja
		};
	}()),
	getClass = Object.prototype.toString,
	slice = Array.prototype.slice,
	INTERNAL_PROTOTYPE = "__proto__",
	FUNCTION_CLASS = "[object Function]",
	STRING_CLASS = "[object String]",
	OBJECT_CLASS = "[object Object]",
	NUMBER_CLASS = "[object Number]",
	TRUE = true,
	FALSE = false,
	NIL = null,
	Assertion,
	Refutation;
	if(global.addEventListener){
		global.addEventListener("load", Scotch.run, FALSE);
	}else if(global.attachEvent){
		global.attachEvent("onload", Scotch.run);
	}
	Scotch.Utility = (function(){
		function emptyFunction(){}
		var SUPPORTS_INTERNAL_PROTOTYPE = (function(){
			var object = {}, list = [], backupPrototype, isSupported;
			if(object[INTERNAL_PROTOTYPE] === Object.prototype && list[INTERNAL_PROTOTYPE] === Array.prototype){
				backupPrototype = list[INTERNAL_PROTOTYPE];
				list[INTERNAL_PROTOTYPE] = NIL;
				isSupported = typeof(list.reverse) === UNDEFINED_TYPE;
				list[INTERNAL_PROTOTYPE] = backupPrototype;
				isSupported = isSupported && getClass.call(list.reverse) === FUNCTION_CLASS;
			}
			object = list = backupPrototype = NIL;
			return isSupported;
		}()),
		BUGGY_REPLACE = (function(){
			var string = "a", isBuggy = (string.replace(string, function(){
				return "";
			}).length !== 0);
			string = NIL;
			return isBuggy;
		}()),
		nativeHOP = Object.prototype.hasOwnProperty,
		definesOwnProperty,
		printf,
		pattern = /%([a-zA-Z]{1})/g,
		leadingWhitespace = /^\s\s*/,
		whitespace = /\s/,
		stripSpace;
		/* Based on `Fuse.Object.hasKey` in FuseJS */
		if(getClass.call(nativeHOP) === FUNCTION_CLASS){
			definesOwnProperty = function(object, key){
				return nativeHOP.call(object, key);
			};
		}else if(SUPPORTS_INTERNAL_PROTOTYPE){
			definesOwnProperty = function(object, key){
				var prototypeChain, hasProperty;
				object = Object(object);
				prototypeChain = object[INTERNAL_PROTOTYPE];
				object[INTERNAL_PROTOTYPE] = NIL;
				hasProperty = (key in object);
				object[INTERNAL_PROTOTYPE] = prototypeChain;
				return hasProperty;
			};
		}else{
			definesOwnProperty = function(object, key){
				object = Object(object);
				return (object.constructor && object.constructor.prototype ? (object[key] !== object.constructor.prototype[key]) : TRUE);
			};
		}
		definesOwnProperty.displayName = 'definesOwnProperty';
		function inspect(object){
			var key, length, result, value, displayName, nodeRepresentation, functionRepresentation;
			if(typeof(object) === UNDEFINED_TYPE){
				return UNDEFINED_TYPE;
			}
			if(object === NIL){
				return "null";
			}
			if(getClass.call(object) === "[object Boolean]"){
				return String(object);
			}
			object = Object(object);
			if(object.name && object.message){
				return ('#<' + object.name + ': "' + object.message + '">');
			}
			if(getClass.call(object) === STRING_CLASS){
				return ('"' + object.replace(/"/g, '\\"') + '"');
			}
			if(getClass.call(object) === NUMBER_CLASS){
				return isFinite(object) ? String(object) : "NaN";
			}
			if(getClass.call(object.nodeType) === NUMBER_CLASS && getClass.call(object.nodeName) === STRING_CLASS){
				nodeRepresentation = "<" + object.nodeName.toLowerCase();
				if(object.id){
					nodeRepresentation += ' id="' + object.id + '"';
				}
				if(object.className){
					nodeRepresentation += ' class="' + object.className + '"';
				}
				nodeRepresentation += ">";
				return nodeRepresentation;
			}
			if(getClass.call(object) === FUNCTION_CLASS){
				if((displayName = object[getClass.call(object.displayName) === STRING_CLASS ? "displayName" : "name"]) === ""){
					displayName = "anonymous";
				}
				functionRepresentation = "#<Function";
				if(displayName){
					functionRepresentation += ": " + displayName;
				}
				functionRepresentation += ">";
				return functionRepresentation;
			}
			if(getClass.call(object.length) === NUMBER_CLASS){
				if(object.length === 0){
					return "[]";
				}
				key = 0;
				length = object.length;
				result = [];
				for(; key < length; key++){
					value = object[key];
					result[result.length] = inspect(value);
				}
				return ("[" + result.join(", ") + "]");
			}
			if(getClass.call(object) === OBJECT_CLASS){
				result = [];
				for(key in object){
					if(definesOwnProperty(object, key)){
						value = inspect(object[key]);
						result[result.length] = ('"' + key + '": ' + value);
					}
				}
				return ("{" + result.join(", ") + "}");
			}
			return String(object);
		}
		/* Inspired by Juriy "kangax" Zaytsev's modified `String#sprintf` implementation
		<https://prototype.lighthouseapp.com/projects/8886/tickets/479-sprintf-feature-on-string> */
		printf = (BUGGY_REPLACE ? function(message, template){
			var replacements = slice.call(arguments, 2),
			prefix = (message ? message + "\n" : ""),
			index = 0, match, result = "",
			lastIndex = pattern.lastIndex = 0,
			length = template.length;
			while((match = pattern.exec(template))){
				result += template.slice(lastIndex, match.index);
				lastIndex = pattern.lastIndex;
				result += (index in replacements ? inspect(replacements[index]) : match[0]);
				index++;
				pattern.lastIndex = lastIndex;
			}
			if(lastIndex < length){
				result += template.slice(lastIndex, length);
			}
			return prefix + result;
		} : function(message, template){
			var replacements = slice.call(arguments, 2),
			prefix = (message ? message + "\n" : ""),
			index = 0;
			return prefix + template.replace(pattern, function(match){
				var value = (index in replacements ? inspect(replacements[index]) : match);
				index++;
				return value;
			});
		});
		printf.displayName = "printf";
		stripSpace = (getClass.call(String.prototype.trim) === FUNCTION_CLASS ? function(string){
			return string.trim();
		} : function(string){
			string = string.replace(leadingWhitespace, "");
			var length = string.length;
			while(whitespace.test(string.charAt(--length))){}
			return string.slice(0, length + 1);
		});
		stripSpace.displayName = "stripSpace";
		return {
			definesOwnProperty: definesOwnProperty,
			inspect: inspect,
			printf: printf,
			stripSpace: stripSpace,
			emptyFunction: emptyFunction
		};
	}());

	var document = global.document;
	Scotch.Logger = (function(){
		var HEADER = '<div class="logsummary">Running...</div><table class="logtable"><thead><tr><th>Test</th><th>Status</th><th>Messages</th></tr></thead><tbody class="loglines"></tbody></table></div>',
		TABLE_DATA = "td",
		TABLE_ROW = "tr",
		ampersands = /&/g,
		leftBrackets = /</g,
		rightBrackets = />/g,
		newlines = /\n/g,
		stripSpace = Scotch.Utility.stripSpace,
		Prototype;
		function Logger(element){
			if(!(this instanceof Logger)){
				return new Logger(element);
			}
			this.element = element || Logger.DefaultElementID;
		}
		Logger.DefaultElementID = "testlog";
		Prototype = Logger.prototype;
		function setup(name){
			this.element = document.getElementById(this.element);
			if(!this.element){
				throw new TypeError("Scotch.Logger#setup: The specified logger element was not found.");
			}
			this.element.innerHTML = ("<h1>" + name + "</h1>" + HEADER);
			this.tbody = this.element.getElementsByTagName("tbody")[0];
		}
		function start(testName){
			var tr = document.createElement(TABLE_ROW), first = document.createElement(TABLE_DATA);
			first.appendChild(document.createTextNode(testName));
			tr.appendChild(first);
			tr.appendChild(document.createElement(TABLE_DATA));
			tr.appendChild(document.createElement(TABLE_DATA));
			this.tbody.appendChild(tr);
		}
		function finish(status, summary){
			var rows, lastLine;
			rows = this.element.getElementsByTagName(TABLE_ROW);
			lastLine = rows[rows.length - 1];
			lastLine.className = status;
			lastLine.getElementsByTagName(TABLE_DATA)[1].innerHTML = status;
			this.message(summary);
		}
		function message(text){
			var rows = this.element.getElementsByTagName(TABLE_ROW);
			rows[rows.length - 1].getElementsByTagName(TABLE_DATA)[2].innerHTML = stripSpace(text.replace(ampersands, "&amp;").replace(leftBrackets, "&lt;").replace(rightBrackets, "&gt;")).replace(newlines, "<br>");
		}
		function summary(text){
			this.element.getElementsByTagName("div")[0].innerHTML = stripSpace(text.replace(ampersands, "&amp;").replace(leftBrackets, "&lt;").replace(rightBrackets, "&gt;")).replace(newlines, "<br>");
		}
		Prototype.setup = setup;
		Prototype.start = start;
		Prototype.finish = finish;
		Prototype.message = message;
		Prototype.summary = summary;
		return Logger;
	}());
	Scotch.Runner = (function(){
		var HAS_TIMEOUT = "setTimeout" in global,
		HAS_JAVA = "java" in global,
		definesOwnProperty = Scotch.Utility.definesOwnProperty,
		runners = Scotch.Runners,
		inspect = Scotch.Utility.inspect;
		/* Based on JsContext by Christian Johansen
		<http://github.com/cjohansen/jscontext> */
		function getTests(testcases, prefix){
			var tests = [], name, test, testClass, testsLength, contextLength, contextTests;
			prefix = prefix || "";
			for(name in testcases){
				if(definesOwnProperty(testcases, name)){
					test = testcases[name];
					testClass = getClass.call(test);
					if(testClass === FUNCTION_CLASS){
						tests[tests.length] = new Scotch.Case(prefix + name, test);
					}else if(testClass === OBJECT_CLASS){
						contextTests = getTests(test, prefix + name + "::");
						contextLength = contextTests.length;
						testsLength = tests.length;
						while(contextLength--){
							tests[testsLength + contextLength] = contextTests[contextLength];
						}
					}else{
						throw new TypeError("Scotch.Runner: `" + inspect(test) + "` is not a valid testcase or context.");
					}
				}
			}
			return tests;
		}
		function Runner(name, testcases){
			if(!(this instanceof Runner)){
				return new Runner(name, testcases);
			}
			if(testcases.logger){
				this.logger = testcases.logger;
				delete testcases.logger;
			}else{
				this.logger = new Scotch.Logger();
			}
			this.name = name;
			this.tests = getTests(testcases);
			this.currentTest = 0;
			runners[runners.length] = this;
		}
		function runTests(runner){
			var test = runner.tests[runner.currentTest], timeToWait;
			if(!test){
				return runner.finish();
			}
			if(!test.isWaiting){
				runner.logger.start(test.name);
			}
			test.run();
			if(test.isWaiting){
				if(!(HAS_TIMEOUT || HAS_JAVA)){
					test.info("Skipping all asynchronous tests; not supported by the current environment.");
				}else{
					timeToWait = test.timeToWait || 1000;
					runner.logger.message("Waiting for " + timeToWait + "ms...");
					if(HAS_TIMEOUT){
						global.setTimeout(function(){
							runTests(runner);
						}, timeToWait);
						return;
					}else if(HAS_JAVA){
						global.java.lang.Thread.sleep(timeToWait);
						return runTests(runner);
					}
				}
			}
			runner.logger.finish(test.status(), test.summary());
			runner.currentTest++;
			runTests(runner);
		}
		function run(){
			this.logger.setup(this.name);
			runTests(this);
		}
		function results(){
			var result = {
				tests: this.tests.length,
				assertions: 0,
				failures: 0,
				errors: 0
			}, tests = this.tests, test, index = 0, length = tests.length;
			for(; index < length; index++){
				test = tests[index];
				result.assertions += test.assertions;
				result.failures += test.failures;
				result.errors += test.errors;
			}
			return result;
		}
		function finish(){
			this.logger.summary(this.summary());
		}
		function summary(){
			var result = this.results();
			return (result.tests + " tests, " + result.assertions + " assertions, " + result.failures + " failures, " + result.errors + " errors");
		}
		Runner.prototype.run = run;
		Runner.prototype.results = results;
		Runner.prototype.finish = finish;
		Runner.prototype.summary = summary;
		return Runner;
	}());

	(function(){
		var definesOwnProperty = Scotch.Utility.definesOwnProperty, printf = Scotch.Utility.printf;
		function toArray(object){
			object = Object(object);
			var results = [], property;
			for(property in object){
				if(definesOwnProperty(object, property)){
					results[results.length] = [property, object[property]];
				}
			}
			return results.sort();
		}
		Scotch.Assertion = (function(){
			function Assertion(expression, testcase){
				if(!(this instanceof Assertion)){
					return new Assertion(expression, testcase);
				}
				this.expression = expression;
				this.testcase = testcase;
			}
			var Prototype = Assertion.prototype;
			function True(message){
				var expression = this.expression,
				testcase = this.testcase;
				if(expression){
					testcase.pass();
				}else{
					testcase.fail("Assertion: " + (message || "True"), "Expression: %o", expression);
				}
				return this;
			}
			function equalTo(expected, message){
				var actual = this.expression,
				testcase = this.testcase;
				if(actual == expected){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "equalTo"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function identicalTo(expected, message){
				var actual = this.expression,
				testcase = this.testcase;
				if(actual === expected){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "identicalTo"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function equalToList(expected, message){
				var actual = this.expression, testcase = this.testcase,
				index, length, pass = TRUE;
				if(actual.length !== expected.length){
					pass = FALSE;
				}else{
					for(index = 0, length = actual.length; index < length; index++){
						if(actual[index] != expected[index]){
							pass = FALSE;
							break;
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "equalToList"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function identicalToList(expected, message){
				var actual = this.expression, testcase = this.testcase,
				actualType = getClass.call(actual), expectedType = getClass.call(expected),
				index, length, pass = TRUE;
				if((actual.length !== expected.length) || (actualType !== expectedType)){
					/* Compare types ([[Class]] names)
					NOTE: You can still compare two nodeLists or two arrays for identity...you just can't compare a nodeList and an array */
					pass = FALSE;
				}else{
					for(index = 0, length = actual.length; index < length; index++){
						if(actual[index] !== expected[index]){
							pass = FALSE;
							break;
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "identicalToList"), "Expected: %o, type %s; Actual: %o, type %s", expected, expectedType, actual, actualType));
				}
				return this;
			}
			function equalToHash(expected, message){
				var actual = toArray(this.expression), testcase = this.testcase,
				index, length, expectedPair, actualPair, pass = TRUE;
				expected = toArray(expected);
				if(actual.length !== expected.length){
					pass = FALSE;
				}else{
					for(index = 0, length = actual.length; index < length; index++){
						actualPair = actual[index];
						expectedPair = expected[index];
						if(actualPair[0] !== expectedPair[0] || actualPair[1] != expectedPair[1]){
							/* Object keys are always strings, so a strict comparison can be used for them.
							*Pair[0] is the key/property name, *Pair[1] is the value. */
							pass = FALSE;
							break;
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "equalToHash"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function identicalToHash(expected, message){
				var actual = this.expression, testcase = this.testcase,
				actualType = getClass.call(actual), expectedType = getClass.call(expected),
				index, length, expectedPair, actualPair, pass = TRUE;
				if(actualType !== expectedType){
					pass = FALSE;
				}else{
					actual = toArray(actual);
					expected = toArray(expected);
					if(actual.length !== expected.length){
						pass = FALSE;
					}else{
						for(index = 0, length = actual.length; index < length; index++){
							actualPair = actual[index];
							expectedPair = expected[index];
							if(actualPair[0] !== expectedPair[0] || actualPair[1] !== expectedPair[1]){
								pass = FALSE;
								break;
							}
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "identicalToHash"), "Expected: %o, type %s; Actual: %o, type %s", expected, expectedType, actual, actualType));
				}
				return this;
			}
			function Null(message){
				var expression = this.expression, testcase = this.testcase;
				if(expression === NIL){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "Null"), "Expression: %o", expression));
				}
				return this;
			}
			function Undefined(message){
				var expression = this.expression, testcase = this.testcase;
				if(typeof(expression) === UNDEFINED_TYPE){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "Undefined"), "Expression: %o", expression));
				}
				return this;
			}
			function nullOrUndefined(message){
				var expression = this.expression, testcase = this.testcase;
				if(expression == NIL){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "nullOrUndefined"), "Expression: %o", expression));
				}
				return this;
			}
			function matchesPattern(pattern, message){
				var expression = this.expression, testcase = this.testcase;
				pattern = RegExp(pattern);
				if(pattern.exec(expression)){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "matchesPattern"), "RegExp: %p; String: %s", pattern, expression));
				}
				return this;
			}
			function instanceOf(konstructor, message){
				var object = this.expression, testcase = this.testcase;
				if((object instanceof konstructor)){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "instanceOf"), "Object: %o; Constructor: %f", object, konstructor));
				}
				return this;
			}
			function hasKey(key, message){
				var object = this.expression, testcase = this.testcase;
				if(definesOwnProperty(object, key)){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "hasKey"), "Object: %o; Key: %s", object, key));
				}
				return this;
			}
			function throwsException(exceptionName, message){
				var method = this.expression,
				testcase = this.testcase;
				message = "Assertion: " + (message || "throwsException");
				if(getClass.call(method) !== FUNCTION_CLASS){
					testcase.fail(printf(message, "%o must be a function", method));
				}else{
					try{
						method();
						testcase.fail(printf(message, "Function: %f, Exception: %s", method, exceptionName));
					}catch(exception){
						if(exception.name === exceptionName){
							testcase.pass();
						}else{
							throw exception;
						}
					}
				}
				return this;
			}
			function throwsNothing(message){
				var method = this.expression,
				testcase = this.testcase;
				message = "Assertion: " + (message || "throwsNothing");
				if(getClass.call(method) !== FUNCTION_CLASS){
					testcase.fail(printf(message, "%o must be a function", method));
				}else{
					try{
						method();
						testcase.pass();
					}catch(exception){
						testcase.fail(printf(message, "Function: %f, Exception: %s", method, exception));
					}
				}
				return this;
			}
			Prototype.True = True;
			Prototype.equalTo = equalTo;
			Prototype.identicalTo = identicalTo;
			Prototype.equalToList = equalToList;
			Prototype.identicalToList = identicalToList;
			Prototype.equalToArray = equalToList;
			Prototype.identicalToArray = identicalToList;
			Prototype.equalToHash = equalToHash;
			Prototype.identicalToHash = identicalToHash;
			Prototype.equalToObject = equalToHash;
			Prototype.identicalToObject = identicalToHash;
			Prototype.Null = Null;
			Prototype.Undefined = Undefined;
			Prototype.nullOrUndefined = nullOrUndefined;
			Prototype.matchesPattern = matchesPattern;
			Prototype.instanceOf = instanceOf;
			Prototype.hasKey = hasKey;
			Prototype.throwsException = throwsException;
			Prototype.throwsNothing = throwsNothing;
			return Assertion;
		}());
		Scotch.Refutation = (function(){
			function Refutation(expression, testcase){
				if(!(this instanceof Refutation)){
					return new Refutation(expression, testcase);
				}
				this.expression = expression;
				this.testcase = testcase;
			}
			var Prototype = Refutation.prototype;
			function True(message){
				var expression = this.expression,
				testcase = this.testcase;
				if(!expression){
					testcase.pass();
				}else{
					testcase.fail("Refutation: " + (message || "True"), "Expression: %o", expression);
				}
				return this;
			}
			function equalTo(expected, message){
				var actual = this.expression,
				testcase = this.testcase;
				if(actual != expected){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "equalTo"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function identicalTo(expected, message){
				var actual = this.expression,
				testcase = this.testcase;
				if(actual !== expected){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "identicalTo"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function equalToList(expected, message){
				var actual = this.expression, testcase = this.testcase,
				index, length, pass = FALSE;
				if(actual.length !== expected.length){
					pass = TRUE;
				}else{
					for(index = 0, length = actual.length; index < length; index++){
						if(actual[index] != expected[index]){
							pass = TRUE;
							break;
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "equalToList"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function identicalToList(expected, message){
				var actual = this.expression, testcase = this.testcase,
				actualType = getClass.call(actual), expectedType = getClass.call(expected),
				index, length, pass = FALSE;
				if((actual.length !== expected.length) || (actualType !== expectedType)){
					/* Compare types ([[Class]] names)
					NOTE: You can still compare two nodeLists or two arrays for identity...you just can't compare a nodeList and an array */
					pass = TRUE;
				}else{
					for(index = 0, length = actual.length; index < length; index++){
						if(actual[index] !== expected[index]){
							pass = TRUE;
							break;
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "identicalToList"), "Expected: %o, type %s; Actual: %o, type %s", expected, expectedType, actual, actualType));
				}
				return this;
			}
			function equalToHash(expected, message){
				var actual = toArray(this.expression), testcase = this.testcase,
				index, length, expectedPair, actualPair, pass = FALSE;
				expected = toArray(expected);
				if(actual.length !== expected.length){
					pass = TRUE;
				}else{
					for(index = 0, length = actual.length; index < length; index++){
						actualPair = actual[index];
						expectedPair = expected[index];
						if(actualPair[0] !== expectedPair[0] || actualPair[1] != expectedPair[1]){
							/* Object keys are always strings, so a strict comparison can be used for them.
							*Pair[0] is the key/property name, *Pair[1] is the value. */
							pass = TRUE;
							break;
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "equalToHash"), "Expected: %o; Actual: %o", expected, actual));
				}
				return this;
			}
			function identicalToHash(expected, message){
				var actual = this.expression, testcase = this.testcase,
				actualType = getClass.call(actual), expectedType = getClass.call(expected),
				index, length, expectedPair, actualPair, pass = FALSE;
				if(actualType !== expectedType){
					pass = TRUE;
				}else{
					actual = toArray(actual);
					expected = toArray(expected);
					if(actual.length !== expected.length){
						pass = TRUE;
					}else{
						for(index = 0, length = actual.length; index < length; index++){
							actualPair = actual[index];
							expectedPair = expected[index];
							if(actualPair[0] !== expectedPair[0] || actualPair[1] !== expectedPair[1]){
								pass = TRUE;
								break;
							}
						}
					}
				}
				if(pass){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "identicalToHash"), "Expected: %o, type %s; Actual: %o, type %s", expected, expectedType, actual, actualType));
				}
				return this;
			}
			function Null(message){
				var expression = this.expression, testcase = this.testcase;
				if(expression !== NIL){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "Null"), "Expression: %o", expression));
				}
				return this;
			}
			function Undefined(message){
				var expression = this.expression, testcase = this.testcase;
				if(typeof(expression) !== UNDEFINED_TYPE){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "Undefined"), "Expression: %o", expression));
				}
				return this;
			}
			function nullOrUndefined(message){
				var expression = this.expression, testcase = this.testcase;
				if(expression != NIL){
					testcase.pass();
				}else{
					testcase.fail(printf("Refutation: " + (message || "nullOrUndefined"), "Expression: %o", expression));
				}
				return this;
			}
			function matchesPattern(pattern, message){
				var expression = this.expression, testcase = this.testcase;
				pattern = RegExp(pattern);
				if(pattern.exec(expression)){
					testcase.fail(printf("Refutation: " + (message || "matchesPattern"), "RegExp: %p; String: %s", pattern, expression));
				}else{
					testcase.pass();
				}
				return this;
			}
			function instanceOf(konstructor, message){
				var object = this.expression, testcase = this.testcase;
				if((object instanceof konstructor)){
					testcase.fail(printf("Refutation: " + (message || "instanceOf"), "Object: %o; Constructor: %f", object, konstructor));
				}else{
					testcase.pass();
				}
				return this;
			}
			function hasKey(key, message){
				var object = this.expression, testcase = this.testcase;
				if(definesOwnProperty(object, key)){
					testcase.fail(printf("Refutation: " + (message || "hasKey"), "Object: %o; Key: %s", object, key));
				}else{
					testcase.pass();
				}
				return this;
			}
			Prototype.True = True;
			Prototype.equalTo = equalTo;
			Prototype.identicalTo = identicalTo;
			Prototype.equalToList = equalToList;
			Prototype.identicalToList = identicalToList;
			Prototype.equalToArray = equalToList;
			Prototype.identicalToArray = identicalToList;
			Prototype.equalToHash = equalToHash;
			Prototype.identicalToHash = identicalToHash;
			Prototype.equalToObject = equalToHash;
			Prototype.identicalToObject = identicalToHash;
			Prototype.Null = Null;
			Prototype.Undefined = Undefined;
			Prototype.nullOrUndefined = nullOrUndefined;
			Prototype.matchesPattern = matchesPattern;
			Prototype.instanceOf = instanceOf;
			Prototype.hasKey = hasKey;
			return Refutation;
		}());
	}());
	(function(Assertions, Refutations){
		var SUPPORTS_COMPUTED_STYLE = !!(document.defaultView && document.defaultView.getComputedStyle),
		printf = Scotch.Utility.printf,
		match = global.NW.Dom.match;
		function checkVisibility(element){
			var display;
			if(element.style){
				display = element.style.display;
				if(!display || display === "auto"){
					display = (SUPPORTS_COMPUTED_STYLE ? document.defaultView.getComputedStyle(element, NIL) : element.currentStyle).display;
				}
				if(display === "none"){
					return FALSE;
				}
			}
			return (element.parentNode ? checkVisibility(element.parentNode) : TRUE);
		}
		function matchSelectors(selectors, message){
			var elements = this.expression,
			testcase = this.testcase,
			index, length, element, selector, pass = TRUE;
			message = "Assertion: " + (message || "matchSelectors");
			if(elements.length !== selectors.length){
				testcase.fail(printf(message, "size mismatch: %n elements, %n expressions (%o)", elements.length, selectors.length, selectors));
			}else{
				for(index = 0, length = elements.length; index < length; index++){
					element = elements[index];
					selector = selectors[index];
					if(!global.NW.Dom.match(element, selector)){
						testcase.fail(printf(message, "In index %n: expected element matching selector %s, but got %e", index, selector, element));
						pass = FALSE;
						break;
					}
				}
			}
			if(pass){
				testcase.pass();
			}
			return this;
		}
		Assertions.matchSelectors = matchSelectors;
		Assertions.isVisible = (function(){
			function isVisible(message){
				var element = this.expression,
				testcase = this.testcase;
				message = "Assertion: " + (message || "isVisible");
				if(!element || getClass.call(element.nodeType) !== NUMBER_CLASS){
					testcase.fail(printf(message, "%e is not a valid element", element));
				}else{
					if(checkVisibility(element)){
						testcase.pass();
					}else{
						testcase.fail(printf(message, "Element: %e", element));
					}
				}
				return this;
			}
			return isVisible;
		}());
		Assertions.matchesSelector = (function(){
			function matchesSelector(selector, message){
				var element = this.expression,
				testcase = this.testcase;
				if(match(element, selector)){
					testcase.pass();
				}else{
					testcase.fail(printf("Assertion: " + (message || "matchesSelector"), "Selector: %s, Element: %e", selector, element));
				}
				return this;
			}
			return matchesSelector;
		}());
		Refutations.isVisible = (function(){
			function isVisible(message){
				var element = this.expression,
				testcase = this.testcase;
				message = "Refutation: " + (message || "isVisible");
				if(!element || getClass.call(element.nodeType) !== NUMBER_CLASS){
					testcase.fail(printf(message, "%e is not a valid element", element));
				}else{
					if(checkVisibility(element)){
						testcase.fail(printf(message, "Element: %e", element));
					}else{
						testcase.pass();
					}
				}
				return this;
			}
			return isVisible;
		}());
		Refutations.matchesSelector = (function(){
			function matchesSelector(selector, message){
				var element = this.expression,
				testcase = this.testcase;
				if(match(element, selector)){
					testcase.fail(printf("Refutation: " + (message || "matchesSelector"), "Selector: %s, Element: %e", selector, element));
				}else{
					testcase.pass();
				}
				return this;
			}
			return matchesSelector;
		}());
	}(Scotch.Assertion.prototype, Scotch.Refutation.prototype));
	Scotch.Case = (function(){
		var Prototype, inspect = Scotch.Utility.inspect;
		function Case(name, test){
			if(!(this instanceof Case)){
				return new Case(name, test);
			}
			this.name = name;
			this.test = test;
			this.messages = [];
		}
		Prototype = Case.prototype;
		function assert(expression){
			return new Scotch.Assertion(expression, this);
		}
		function refute(expression){
			return new Scotch.Refutation(expression, this);
		}
		function wait(time, nextPart){
			this.isWaiting = TRUE;
			this.test = nextPart;
			this.timeToWait = time;
		}
		function run(){
			try{
				this.isWaiting = FALSE;
				this.test();
			}catch(exception){
				this.error(exception);
			}
		}
		function summary(){
			return (this.assertions + " assertions, " + this.failures + " failures, " + this.errors + " errors\n") + this.messages.join("\n");
		}
		function pass(){
			this.assertions++;
		}
		function fail(message){
			this.failures++;
			this.messages[this.messages.length] = ("Failure: " + message);
		}
		function info(message){
			this.messages[this.messages.length] = ("Info: " + message);
		}
		function error(exception){
			this.errors++;
			this.messages[this.messages.length] = ("Error: " + inspect(exception));
		}
		function status(){
			return (this.failures > 0 ? 'failed' : this.errors > 0 ? 'error' : 'passed');
		}
		function benchmark(operation, iterations, methodName){
			/* See <http://gist.github.com/227048> */
			var number = iterations, startTime = new Date(), endTime;
			while(iterations--){
				operation();
			}
			endTime = new Date();
			this.info((methodName || 'Operation') + ' finished ' + number + ' iterations in ' + (endTime.getTime() - startTime.getTime()) + 'ms');
		}
		Prototype.isWaiting = FALSE;
		Prototype.timeToWait = 1000;
		Prototype.assertions = 0;
		Prototype.failures = 0;
		Prototype.errors = 0;
		Prototype.assert = assert;
		Prototype.refute = refute;
		Prototype.wait = wait;
		Prototype.run = run;
		Prototype.summary = summary;
		Prototype.pass = pass;
		Prototype.fail = fail;
		Prototype.info = info;
		Prototype.error = error;
		Prototype.status = status;
		Prototype.benchmark = benchmark;
		return Case;
	}());
}(this));
