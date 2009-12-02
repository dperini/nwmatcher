/*
 * Copyright (C) 2007-2009 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast CSS selector engine and matcher
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.2.0
 * Created: 20070722
 * Release: 20091201
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

window.NW || (window.NW = { });

NW.Dom = (function(global) {

  var version = 'nwmatcher-1.2.0',

  // processing context
  doc = global.document,

  // document type node
  docType = doc.doctype,

  // context root element
  root = doc.documentElement,

  // current DOM viewport/window, also used to
  // detect Safari 2.0.x [object AbstractView]
  view = doc.defaultView || doc.parentWindow,

  // persist last selector parsing data
  lastSelector, lastSlice,

  // initialize to current loading context
  lastContext = doc,

  // http://www.w3.org/TR/css3-syntax/#characters
  // unicode/ISO 10646 characters 161 and higher
  // NOTE: Safari 2.0.x crashes with escaped (\\)
  // Unicode ranges in regular expressions so we
  // use a negated character range class instead
  encoding = '((?:[-\\w]|[^\\x00-\\xa0]|\\\\.)+)',

  // used to skip [ ] or ( ) groups in token tails
  skipgroup = '(?:\\[.*\\]|\\(.*\\))',

  // discard invalid chars found in passed selector
  reValidator = /^([.:#*]|[>+~a-zA-Z]|[^\x00-\xa0]|\[.*\])/,

  // Only five chars can occur in whitespace, they are:
  // \x20 \t \n \r \f, checks now uniformed in the code
  // http://www.w3.org/TR/css3-selectors/#selector-syntax
  reTrimSpaces = /^[\x20\t\n\r\f]+|[\x20\t\n\r\f]+$/g,

  // split comma groups, exclude commas in '' "" () []
  reSplitGroup = /([^,\\()[\]]+|\([^()]+\)|\(.*\)|\[(?:\[[^[\]]*\]|["'][^'"]*["']|[^'"[\]]+)+\]|\[.*\]|\\.)+/g,

  // split last, right most, selector group token
  reSplitToken = /([^ >+~,\\()[\]]+|\([^()]+\)|\(.*\)|\[[^[\]]+\]|\[.*\]|\\.)+/g,

  // for pseudos, ids and in excess whitespace removal
  reClassValue = /([-\w]+)/,
  reIdSelector = /\#([-\w]+)$/,
  reWhiteSpace = /[\x20\t\n\r\f]+/g,

  // match missing R/L context
  reLeftContext = /^\s*[>+~]+/,
  reRightContext = /[>+~]+\s*$/,

  /*----------------------------- UTILITY METHODS ----------------------------*/

  slice = Array.prototype.slice,

  // Safari 2 bug with innerText (gasp!)
  // used to strip tags from innerHTML
  stripTags = function(s) {
    return s.replace(/<\/?("[^\"]*"|'[^\']*'|[^>])+>/gi, '');
  },

  /*------------------------------- DEBUGGING --------------------------------*/

  // enable/disable notifications
  VERBOSE = false,

  // a way to control user notification
  emit =
    function(message) {
      if (VERBOSE) {
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

  // compile selectors to functions resolvers
  // @selector string
  // @mode boolean
  // false = select resolvers
  // true = match resolvers
  compile =
    function(selector, mode) {
      return compileGroup(selector, '', mode || false);
    },

  USE_QSA = true,

  // use internal or QSA engine
  // @enable boolean
  // false = disable QSA
  // true = enable QSA
  setQSA =
    function(enable) {
      USE_QSA = enable && NATIVE_QSAPI ? true : false;
    },

  /*----------------------------- FEATURE TESTING ----------------------------*/

  // detect native methods
  isNative = (function() {
    var s = (global.open + '').replace(/open/g, '');
    return function(object, method) {
      var m = object ? object[method] : false, r = new RegExp(method, 'g');
      return !!(m && typeof m != 'string' && s === (m + '').replace(r, ''));
    };
  })(),

  // Safari 2 missing document.compatMode property
  // makes harder to detect Quirks vs. Strict mode
  isQuirks = doc.compatMode ?
    doc.compatMode.indexOf('CSS') < 0 :
    (function() {
      var div = document.createElement('div'),
        isStrict = div.style &&
          (div.style.width = 1) &&
          div.style.width != '1px';
      div = null;
      return !isStrict;
    })(),

  // XML is functional in W3C browsers
  isXML = 'xmlVersion' in doc ?
    function(element) {
      var document = element.ownerDocument || element;
      return !!document.xmlVersion ||
        (/xml$/).test(document.contentType) ||
        document.documentElement.nodeName != 'HTML';
    } :
    function(element) {
      var document = element.ownerDocument || element;
      return (document.firstChild.nodeType == 7 &&
        document.firstChild.nodeName == 'xml') ||
        document.documentElement.nodeName != 'HTML';
    },

  // NATIVE_XXXXX true if method exist and is callable

  // detect if DOM methods are native in browsers
  NATIVE_FOCUS = isNative(doc, 'hasFocus'),
  NATIVE_QSAPI = isNative(doc, 'querySelector'),
  NATIVE_GEBID = isNative(doc, 'getElementById'),
  NATIVE_GEBTN = isNative(root, 'getElementsByTagName'),
  NATIVE_GEBCN = isNative(root, 'getElementsByClassName'),

  // detect native getAttribute/hasAttribute methods,
  // frameworks extend these to elements, but it seems
  // this does not work for XML namespaced attributes,
  // used to check both getAttribute/hasAttribute in IE
  NATIVE_HAS_ATTRIBUTE = isNative(root, 'hasAttribute'),

  // check if slice() can convert nodelist to array
  // see http://yura.thinkweb2.com/cft/
  NATIVE_SLICE_PROTO =
    (function() {
      try {
        return slice.call(doc.childNodes, 0) instanceof Array;
      } catch(e) {
        return false;
      }
    })(),

  // supports the new traversal API
  NATIVE_TRAVERSAL_API =
    'nextElementSibling' in root && 'previousElementSibling' in root,

  // BUGGY_XXXXX true if method is feature tested and has known bugs

  // detect IE gEBTN comment nodes bug
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

  // detect Opera gEBCN second class and/or UTF8 bugs as well as Safari 3.2
  // caching class name results and not detecting when changed,
  // tests are based on the jQuery selector test suite
  BUGGY_GEBCN = NATIVE_GEBCN ?
    (function() {
      var isBuggy, div = doc.createElement('div'), test = '\u53f0\u5317';

      // Opera tests
      div.appendChild(doc.createElement('span')).
        setAttribute('class', test + 'abc ' + test);
      div.appendChild(doc.createElement('span')).
        setAttribute('class', 'x');

      // Opera tests
      isBuggy = !div.getElementsByClassName(test)[0];

      // Safari test
      div.lastChild.className = test;
      if (!isBuggy)
        isBuggy = div.getElementsByClassName(test).length !== 2;

      div.removeChild(div.firstChild);
      div.removeChild(div.firstChild);
      div = null;
      return isBuggy;
    })() :
    true,

  // check Seletor API implementations
  RE_BUGGY_QSAPI = NATIVE_QSAPI ?
    (function() {
      var pattern = [ '!=', ':contains', ':selected' ],
        div = doc.createElement('div'), input;

      // WebKit is correct with className case insensitivity (when no DOCTYPE)
      // obsolete bug https://bugs.webkit.org/show_bug.cgi?id=19047
      // so the bug is in all other browsers code now :-)
      // http://www.whatwg.org/specs/web-apps/current-work/#selectors

      // Safari 3.2 QSA doesn't work with mixedcase on quirksmode
      // must test the attribute selector '[class~=xxx]'
      // before '.xXx' or the bug may not present itself
      div.appendChild(doc.createElement('p')).setAttribute('class', 'xXx');
      div.appendChild(doc.createElement('p')).setAttribute('class', 'xxx');
      if (isQuirks &&
        (div.querySelectorAll('[class~=xxx]').length != 2 ||
        div.querySelectorAll('.xXx').length != 2)) {
        pattern.push('(?:\\[[\\x20\\t\\n\\r\\f]*class\\b|\\.' + encoding + ')');
      }
      div.removeChild(div.firstChild);
      div.removeChild(div.firstChild);

      // :enabled :disabled bugs with hidden fields (Firefox 3.5 QSA bug)
      // http://www.w3.org/TR/html5/interactive-elements.html#selector-enabled
      // IE8 throws error with these pseudos
      (input = doc.createElement('input')).setAttribute('type', 'hidden');
      div.appendChild(input);
      try {
        div.querySelectorAll(':enabled').length === 1 &&
          pattern.push(':enabled', ':disabled');
      } catch(e) { }
      div.removeChild(div.firstChild);

      // :checked bugs whith checkbox fields (Opera 10beta3 bug)
      (input = doc.createElement('input')).setAttribute('type', 'hidden');
      div.appendChild(input);
      input.setAttribute('checked', 'checked');
      try {
        div.querySelectorAll(':checked').length !== 1 &&
          pattern.push(':checked');
      } catch(e) { }
      div.removeChild(div.firstChild);

      // :link bugs with hyperlinks matching (Firefox/Safari)
      div.appendChild(doc.createElement('a')).setAttribute('href', 'x');
      div.querySelectorAll(':link').length !== 1 && pattern.push(':link');
      div.removeChild(div.firstChild);

      div = null;
      return pattern.length ?
        new RegExp(pattern.join('|')) :
        { 'test': function() { return false; } };
    })() :
    true,

  // matches simple id, tagname & classname selectors
  RE_SIMPLE_SELECTOR = new RegExp((
    BUGGY_GEBTN &&
    BUGGY_GEBCN ? '^#@$' :
    BUGGY_GEBTN ? '^[.#]?@$' :
    BUGGY_GEBCN ? '^(?:\\*|#@)$' : '^(?:\\*|[.#]?@)$').replace('@', encoding)),

  /*----------------------------- LOOKUP OBJECTS -----------------------------*/

  LINK_NODES = { 'a': 1, 'A': 1, 'area': 1, 'AREA': 1, 'link': 1, 'LINK': 1 },

  QSA_NODE_TYPES = { '9': 1, '11': 1 },

  // attribute referencing URI values need special treatment in IE
  ATTRIBUTES_URI = {
    'action': 2, 'cite': 2, 'codebase': 2, 'data': 2, 'href': 2,
    'longdesc': 2, 'lowsrc': 2, 'src': 2, 'usemap': 2
  },

  // HTML 5 draft specifications
  // http://www.whatwg.org/specs/web-apps/current-work/#selectors
  HTML_TABLE = {
    // class attribute must be treated case-insensitive in HTML quirks mode
    'class': isQuirks ? 1 : 0,
    'accept': 1, 'accept-charset': 1, 'align': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'checked': 1, 'clear': 1, 'codetype': 1, 'color': 1,
    'compact': 1, 'declare': 1, 'defer': 1, 'dir': 1, 'direction': 1, 'disabled': 1,
    'enctype': 1, 'face': 1, 'frame': 1, 'hreflang': 1, 'http-equiv': 1, 'lang': 1,
    'language': 1, 'link': 1, 'media': 1, 'method': 1, 'multiple': 1, 'nohref': 1,
    'noresize': 1, 'noshade': 1, 'nowrap': 1, 'readonly': 1, 'rel': 1, 'rev': 1,
    'rules': 1, 'scope': 1, 'scrolling': 1, 'selected': 1, 'shape': 1, 'target': 1,
    'text': 1, 'type': 1, 'valign': 1, 'valuetype': 1, 'vlink': 1
  },

  // the following attributes must be treated case insensitive in XHTML
  // See Niels Leenheer blog
  // http://rakaz.nl/item/css_selector_bugs_case_sensitivity
  XHTML_TABLE = {
    'accept': 1, 'accept-charset': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'codetype': 1, 'color': 1,
    'enctype': 1, 'face': 1, 'hreflang': 1, 'http-equiv': 1,
    'lang': 1, 'language': 1, 'link': 1, 'media': 1, 'rel': 1,
    'rev': 1, 'target': 1, 'text': 1, 'type': 1, 'vlink': 1
  },

  INSENSITIVE_TABLE =
    docType && (docType.publicId === '' ||
    (/ XHTML /).test(docType.publicId)) ?
      XHTML_TABLE : HTML_TABLE,

  // placeholder to add functionalities
  Selectors = {
    // as a simple example this will check
    // for chars not in standard ascii table
    //
    // 'mySpecialSelector': {
    //  'Expression': /\u0080-\uffff/,
    //  'Callback': mySelectorCallback
    // }
    //
    // 'mySelectorCallback' will be invoked
    // only after passing all other standard
    // checks and only if none of them worked
  },

  // attribute operators
  Operators = {
     '=': "n=='%m'",
    '^=': "n.indexOf('%m')==0",
    '*=': "n.indexOf('%m')>-1",
    '|=': "(n+'-').indexOf('%m-')==0",
    '~=': "(' '+n+' ').indexOf(' %m ')>-1",
    '$=': "n.substr(n.length-'%m'.length)=='%m'"
  },

  TAGS = "(?:^|[>+~\\x20\\t\\n\\r\\f])",

  // optimization expressions
  Optimize = {
    ID: new RegExp("#" + encoding + "|" + skipgroup),
    TAG: new RegExp(TAGS + encoding + "|" + skipgroup),
    CLASS: new RegExp("\\." + encoding + "|" + skipgroup),
    NAME: /\[\s*name\s*=\s*((["']*)([^'"()]*?)\2)?\s*\]/
  },

  // precompiled Regular Expressions
  Patterns = {
    // element attribute matcher
    attribute: /^\[[\x20\t\n\r\f]*([-\w]*:?(?:[-\w])+)[\x20\t\n\r\f]*(?:([~*^$|!]?=)[\x20\t\n\r\f]*(["']*)([^'"()]*?)\3)?[\x20\t\n\r\f]*\](.*)/,
    // structural pseudo-classes
    spseudos: /^\:(root|empty|nth)?-?(first|last|only)?-?(child)?-?(of-type)?(?:\(([^\x29]*)\))?(.*)/,
    // uistates + dynamic + negation pseudo-classes
    dpseudos: /^\:([\w]+|[^\x00-\xa0]+)(?:\((["']*)(.*?(\(.*\))?[^'"()]*?)\2\))?(.*)/,
    // E > F
    children: /^[\x20\t\n\r\f]*\>[\x20\t\n\r\f]*(.*)/,
    // E + F
    adjacent: /^[\x20\t\n\r\f]*\+[\x20\t\n\r\f]*(.*)/,
    // E ~ F
    relative: /^[\x20\t\n\r\f]*\~[\x20\t\n\r\f]*(.*)/,
    // E F
    ancestor: /^[\x20\t\n\r\f]+(.*)/,
    // all
    universal: /^\*(.*)/,
    // id
    id: new RegExp("^#" + encoding + "(.*)"),
    // tag
    tagName: new RegExp("^" + encoding + "(.*)"),
    // class
    className: new RegExp("^\\." + encoding + "(.*)")
  },

  // current CSS3 grouping of Pseudo-Classes
  // they allow implementing extensions
  // and improve error notifications;
  // the assigned value represent current spec status:
  // 3 = CSS3, 2 = CSS2, '?' = maybe implemented
  CSS3PseudoClasses = {
    Structural: {
      'root': 3, 'empty': 3,
      'first-child': 3, 'last-child': 3, 'only-child': 3,
      'first-of-type': 3, 'last-of-type': 3, 'only-of-type': 3,
      'first-child-of-type': 3, 'last-child-of-type': 3, 'only-child-of-type': 3,
      'nth-child': 3, 'nth-last-child': 3, 'nth-of-type': 3, 'nth-last-of-type': 3
      // (the 4rd line is not in W3C CSS specs but is an accepted alias of 3nd line)
    },

    // originally separated in different pseudo-classes
    // we have grouped them to optimize a bit size+speed
    // all are going through the same code path (switch)
    Others: {
      // UIElementStates (grouped to optimize)
      'checked': 3, 'disabled': 3, 'enabled': 3, 'selected': 2, 'indeterminate': '?',
      // Dynamic pseudo classes
      'active': 3, 'focus': 3, 'hover': 3, 'link': 3, 'visited': 3,
      // Target, Language and Negated pseudo classes
      'target': 3, 'lang': 3, 'not': 3,
      // http://www.w3.org/TR/2001/CR-css3-selectors-20011113/#content-selectors
      'contains': '?'
    }
  },

  /*------------------------------ DOM METHODS -------------------------------*/

  // concat elements to data
  concatList =
    function(data, elements) {
      var i = -1, element;
      if (data.length === 0 && Array.slice)
        return Array.slice(elements);
      while ((element = elements[++i]))
        data[data.length] = element;
      return data;
    },

  // concat elements to data and callback
  concatCall =
    function(data, elements, callback) {
      var i = -1, element;
      while ((element = elements[++i]))
        callback(data[data.length] = element);
      return data;
    },

  // element by id
  // @return element reference or null
  byId =
    function(id, from) {
      var i = -1, element, elements, node;
      from || (from = doc);
      id = id.replace(/\\/g, '');
      if (from.getElementById) {
        if ((element = from.getElementById(id)) &&
          id != getAttribute(element, 'id') && from.getElementsByName) {
          elements = from.getElementsByName(id);
          while ((element = elements[++i])) {
            if ((node = element.getAttributeNode('id')) &&
              node.value == id) {
              return element;
            }
          }
          return null;
        }
        return element;
      }

      // fallback to manual
      elements = byTag('*', from);
      while ((element = elements[++i])) {
        if (element.getAttribute('id') == id) {
          return element;
        }
      }
      return null;
    },

  // elements by tag
  // @return nodeList (live)
  byTag =
    function(tag, from) {
      return (from || doc).getElementsByTagName(tag);
    },

  // elements by name
  // @return array
  byName =
    function(name, from) {
      return select('[name="' + name.replace(/\\/g, '') + '"]', from || doc);
    },

  // elements by class
  byClass = !BUGGY_GEBCN ?
    // @return native nodelist
    function(className, from) {
      return (from || doc).getElementsByClassName(className.replace(/\\/g, ''));
    } :
    // @return converted array
    function(className, from) {
      var i = -1, j = i,
        data = [ ], element, xml = isXML(from || doc),
        elements = (from || doc).getElementsByTagName('*'),
        n = isQuirks ? className.toLowerCase() : className;
      className = ' ' + n.replace(/\\/g, '') + ' ';
      while ((element = elements[++i])) {
        n = xml ? element.getAttribute('class') : element.className;
        if (n && n.length && (' ' + (isQuirks ? n.toLowerCase() : n).
          replace(reWhiteSpace, ' ') + ' ').indexOf(className) > -1) {
          data[++j] = element;
        }
      }
      return data;
    },

  // children position by nodeType
  // @return number
  getIndexesByNodeType =
    function(element) {
      var i = 0, indexes,
        id = element[CSS_INDEX] || (element[CSS_INDEX] = ++CSS_ID);
      if (!indexesByNodeType[id]) {
        indexes = { };
        element = element.firstChild;
        while (element) {
          if (element.nodeName.charCodeAt(0) > 64) {
            indexes[element[CSS_INDEX] || (element[CSS_INDEX] = ++CSS_ID)] = ++i;
          }
          element = element.nextSibling;
        }
        indexes.length = i;
        indexesByNodeType[id] = indexes;
      }
      return indexesByNodeType[id];
    },

  // children position by nodeName
  // @return number
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

  // attribute value
  // @return string
  getAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(node, attribute) {
      return node.getAttribute(attribute) + '';
    } :
    function(node, attribute) {
      // specific URI attributes (parameter 2 to fix IE bug)
      if (ATTRIBUTES_URI[attribute]) {
        return node.getAttribute(attribute, 2) + '';
      }
      node = node.getAttributeNode(attribute);
      return (node && node.value) + '';
    },

  // attribute presence
  // @return boolean
  hasAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(node, attribute) {
      return node.hasAttribute(attribute);
    } :
    function(node, attribute) {
      // need to get at AttributeNode first on IE
      node = node.getAttributeNode(attribute);
      // use both "specified" & "nodeValue" properties
      return !!(node && (node.specified || node.nodeValue));
    },

  // check if element matches the :link pseudo
  // @return boolean
  isLink =
    function(element) {
        return hasAttribute(element,'href') && LINK_NODES[element.nodeName];
    },

  /*---------------------------- COMPILER METHODS ----------------------------*/

  // do not change this, it is searched & replaced
  // in multiple places to build compiled functions
  ACCEPT_NODE = 'f&&f(N);r[r.length]=N;continue main;',

  // conditionals optimizers used internally by compiler

  // checks if nodeName comparisons need to be uppercased
  TO_UPPER_CASE = typeof doc.createElementNS == 'function' ?
    '.toUpperCase()' : '',

  // filter IE gEBTN('*') results containing non-elements
  SKIP_NON_ELEMENTS = BUGGY_GEBTN ?
    'if(e.nodeName.charCodeAt(0)<65){continue;}' : '',

  // use the textContent or innerText property to check CSS3 :contains
  // Safari 2 has a bug with innerText and hidden content, using an
  // internal replace on the innerHTML property avoids trashing it
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

  // compile a comma separated group of selector
  // @mode boolean true for select, false for match
  // @return function (compiled)
  compileGroup =
    function(selector, source, mode) {
      var i = -1, seen = { }, parts, token;
      if ((parts = selector.match(reSplitGroup))) {
        // for each selector in the group
        while ((token = parts[++i])) {
          token = token.replace(reTrimSpaces, '');
          // avoid repeating the same token in comma separated group (p, p)
          if (!seen[token]) {
            source += i > 0 ? 'e=N;' : '';
            source += compileSelector(token, mode ? ACCEPT_NODE : 'return true;');
          }
          seen[token] = true;
        }
      }
      if (mode) {
        // for select method
        return new Function('c,s,r,d,h,g,f',
          'var n,x=0,N,k=0,e;main:while(N=e=c[k++]){' +
          SKIP_NON_ELEMENTS + source + '}return r;');
      } else {
        // for match method
        return new Function('e,s,r,d,h,g,f',
          'var n,x=0,N=e;' + source + 'return false;');
      }
    },

  // compile a CSS3 string selector into ad-hoc javascript matching function
  // @return string (to be compiled)
  compileSelector =
    function(selector, source) {

      var i, a, b, n, k, expr, match, result, status, test, type;

      k = 0;

      while (selector) {

        // *** Universal selector
        // * match all (empty block, do not remove)
        if ((match = selector.match(Patterns.universal))) {
          // do nothing, handled in the compiler where
          // BUGGY_GEBTN return comment nodes (ex: IE)
          true;
        }

        // *** ID selector
        // #Foo Id case sensitive
        else if ((match = selector.match(Patterns.id))) {
          // document can contain conflicting elements (id/name)
          // prototype selector unit need this method to recover bad HTML forms
          source = (isXML(doc) ?
            'if(s.getAttribute(e, "id")=="' + match[1] + '")' :
            'if((e.submit?s.getAttribute(e,"id"):e.id)=="' + match[1] + '")') +
            '{' + source + '}';
        }

        // *** Type selector
        // Foo Tag (case insensitive)
        else if ((match = selector.match(Patterns.tagName))) {
          // both tagName and nodeName properties may be upper/lower case
          // depending on their creation NAMESPACE in createElementNS()
          source =
            'if(' + (isXML(doc) ? 'e.nodeName=="' + match[1] + '"' :
              'e.nodeName=="' + match[1].toUpperCase() + '"||' +
              'e.nodeName=="' + match[1].toLowerCase() + '"') + '){' +
              source +
            '}';
        }

        // *** Class selector
        // .Foo Class (case sensitive)
        else if ((match = selector.match(Patterns.className))) {
          // W3C CSS3 specs: element whose "class" attribute has been assigned a
          // list of whitespace-separated values, see section 6.4 Class selectors
          // and notes at the bottom; explicitly non-normative in this specification.
          expr = 'xmlVersion' in doc ?
            'd.xmlVersion?e.getAttribute("class"):e.className' :
            'h.nodeName.toUpperCase()!="HTML"?e.getAttribute("class"):e.className';

          source = 'if((n=' + expr + ')&&(" "+' +
            (isQuirks ? 'n.toLowerCase()' : 'n') +
            '.replace(' + reWhiteSpace +'," ")+" ").indexOf(" ' +
            (isQuirks ? match[1].toLowerCase() : match[1]) +
            ' ")>-1){' + source + '}';
        }

        // *** Attribute selector
        // [attr] [attr=value] [attr="value"] [attr='value'] and !=, *=, ~=, |=, ^=, $=
        // case sensitivity is treated differently depending on the document type (see map)
        else if ((match = selector.match(Patterns.attribute))) {
          // xml namespaced attribute ?
          expr = match[1].split(':');
          expr = expr.length == 2 ? expr[1] : expr[0] + '';

          // replace Operators parameter if needed
          if ((type = Operators[match[2]])) {
            // check case treatment in INSENSITIVE_TABLE
            test = INSENSITIVE_TABLE[expr.toLowerCase()];
            type = type.replace(/\%m/g, test ? match[4].toLowerCase() : match[4]);
          }

          // build expression for has/getAttribute
          expr = 'n=s.' + (type ? 'get' : 'has') +
            'Attribute(e,"' + match[1] + '")' +
            (test ? '.toLowerCase();' : ';');

          source = expr + 'if(' + (type ? type : 'n') + '){' + source + '}';
        }

        // *** Adjacent sibling combinator
        // E + F (F adiacent sibling of E)
        else if ((match = selector.match(Patterns.adjacent))) {
          source = NATIVE_TRAVERSAL_API ?
            'if((e=e.previousElementSibling)){' + source + '}' :
            'while((e=e.previousSibling)){if(e.nodeName.charCodeAt(0)>64){' + source + 'break;}}';
        }

        // *** General sibling combinator
        // E ~ F (F relative sibling of E)
        else if ((match = selector.match(Patterns.relative))) {
          source = NATIVE_TRAVERSAL_API ?
            'while((e=e.previousElementSibling)){' + source + '}' :
            'while((e=e.previousSibling)){if(e.nodeName.charCodeAt(0)>64){' + source + '}}';
        }

        // *** Child combinator
        // E > F (F children of E)
        else if ((match = selector.match(Patterns.children))) {
          source = 'if(e!==g&&(e=e.parentNode)){' + source + '}';
        }

        // *** Descendant combinator
        // E F (E ancestor of F)
        else if ((match = selector.match(Patterns.ancestor))) {
          source = 'while(e!==g&&(e=e.parentNode)){' + source + '}';
        }

        // *** Structural pseudo-classes
        // :root, :empty,
        // :first-child, :last-child, :only-child,
        // :first-of-type, :last-of-type, :only-of-type,
        // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
        else if ((match = selector.match(Patterns.spseudos)) &&
          CSS3PseudoClasses.Structural[selector.match(reClassValue)[0]]) {

          switch (match[1]) {
            case 'root':
              // element root of the document
              source = 'if(e===h){' + source + '}';
              break;

            case 'empty':
              // element that has no children
              source = 'if(!e.firstChild){' + source + '}';
              break;

            default:
              if (match[1] && match[5]) {
                if (match[5] == 'even') {
                  a = 2;
                  b = 0;
                } else if (match[5] == 'odd') {
                  a = 2;
                  b = 1;
                } else {
                  // assumes correct "an+b" format, "b" before "a" to keep "n" values
                  b = ((n = match[5].match(/(-?\d{1,})$/)) ? parseInt(n[1], 10) : 0);
                  a = ((n = match[5].match(/(-?\d{0,})n/)) ? parseInt(n[1], 10) : 0);
                  if (n && n[1] == '-') a = -1;
                }

                // executed after the count is computed
                type = match[4] ? 'n[e.nodeName' + TO_UPPER_CASE + ']' : 'n';
                expr = match[2] == 'last' ? type + '.length-' + (b - 1) : b;

                // shortcut check for of-type selectors
                type = type + '[e.' + CSS_INDEX + ']';

                // build test expression out of structural pseudo (an+b) parameters
                // see here: http://www.w3.org/TR/css3-selectors/#nth-child-pseudo
                test = b < 1 && a > 1 ? '(' + type + '-(' + b + '))%' + a + '==0' :
                  a > +1 ? type + '>=' + b + '&&(' + type + '-(' + b + '))%' + a + '==0' :
                  a < -1 ? type + '<=' + b + '&&(' + type + '-(' + b + '))%' + a + '==0' :
                  a === 0 ? type + '==' + expr : a == -1 ? type + '<=' + b : type + '>=' + b;

                // 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
                source =
                  'if(e!==h){' +
                    'n=s.getIndexesBy' + (match[4] ? 'NodeName' : 'NodeType') +
                    '(e.parentNode' + (match[4] ? ',e.nodeName' + TO_UPPER_CASE : '') + ');' +
                    'if(' + test + '){' + source + '}' +
                  '}';

              } else {
                // 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
                a = match[2] == 'first' ? 'previous' : 'next';
                n = match[2] == 'only' ? 'previous' : 'next';
                b = match[2] == 'first' || match[2] == 'last';

                type = match[4] ? '&&n.nodeName!=e.nodeName' : '&&n.nodeName.charCodeAt(0)<65';

                source = 'if(e!==h){' +
                  ( 'n=e;while((n=n.' + a + 'Sibling)' + type + ');if(!n){' + (b ? source :
                    'n=e;while((n=n.' + n + 'Sibling)' + type + ');if(!n){' + source + '}') + '}' ) + '}';
              }
              break;
          }
        }

        // *** negation, user action and target pseudo-classes
        // *** UI element states and dynamic pseudo-classes
        // CSS3 :not, :checked, :enabled, :disabled, :target
        // CSS3 :active, :hover, :focus
        // CSS3 :link, :visited
        else if ((match = selector.match(Patterns.dpseudos)) &&
          CSS3PseudoClasses.Others[selector.match(reClassValue)[0]]) {

          switch (match[1]) {
            // CSS3 negation pseudo-class
            case 'not':
              // compile nested selectors, need to escape double quotes characters
              // since the string we are inserting into already uses double quotes
              source = 'if(!s.match(e, "' + match[3].replace(/\x22/g, '\\"') + '")){' + source +'}';
              break;

            // CSS3 UI element states
            case 'checked':
              // only radio buttons and check boxes
              source = 'if(e.type&&/radio|checkbox/i.test(e.type)&&e.checked){' + source + '}';
              break;
            case 'enabled':
              // does not consider hidden input fields
              source = 'if(((e.type&&"form" in e&&e.type.toLowerCase()!=="hidden")||s.isLink(e))&&!e.disabled){' + source + '}';
              break;
            case 'disabled':
              // does not consider hidden input fields
              source = 'if(((e.type&&"form" in e&&e.type.toLowerCase()!=="hidden")||s.isLink(e))&&e.disabled){' + source + '}';
              break;

            // CSS3 lang pseudo-class
            case 'lang':
              source = 'if((e.lang=="' + match[3] + '")||h.lang=="' + match[3] + '"){' + source + '}' +
                'else{while(e!==g&&(e=e.parentNode)){if(e.lang=="' + match[3] + '"){' + source + 'break;}}}';
              break;

            // CSS3 target pseudo-class
            case 'target':
              n = doc.location ? doc.location.hash : '';
              source = 'if(e.id=="' + n + '"&&"href" in e){' + source + '}';
              break;

            // CSS3 dynamic pseudo-classes
            case 'link':
              source = 'if(s.isLink(e)&&!e.visited){' + source + '}';
              break;
            case 'visited':
              source = 'if(s.isLink(e)&&e.visited){' + source + '}';
              break;

            // CSS3 user action pseudo-classes IE & FF3 have native support
            // these capabilities may be emulated by some event managers
            case 'active':
              if (isXML(doc)) break;
              source = 'if(e===d.activeElement){' + source + '}';
              break;
            case 'hover':
              if (isXML(doc)) break;
              source = 'if(e===d.hoverElement){' + source + '}';
              break;
            case 'focus':
              source = NATIVE_FOCUS ?
                'if(e.type&&e===d.activeElement&&d.hasFocus()){' + source + '}' :
                'if(e.type&&e===d.activeElement){' + source + '}';
              break;

            // CSS2 :contains and :selected pseudo-classes
            // not currently part of CSS3 drafts
            case 'contains':
              source = 'if(' + CONTAINS_TEXT + '.indexOf("' + match[3] + '")>-1){' + source + '}';
              break;
            case 'selected':
              // fix Safari selectedIndex property bug
              n = doc.getElementsByTagName('select');
              for (i = 0; n[i]; i++) {
                n[i].selectedIndex;
              }
              source = 'if(e.selected){' + source + '}';
              break;

            default:
              break;
          }
        } else {

          // this is where external extensions are
          // invoked if expressions match selectors
          expr = false;
          status = true;

          for (expr in Selectors) {
            if ((match = selector.match(Selectors[expr].Expression))) {
              result = Selectors[expr].Callback(match, source);
              source = result.source;
              status |= result.status;
            }
          }

          // if an extension fails to parse the selector
          // it must return a false boolean in "status"
          if (!status) {
            // log error but continue execution, don't throw real exceptions
            // because blocking following processes maybe is not a good idea
            emit('DOMException: unknown pseudo selector "' + selector + '"');
            return source;
          }

          if (!expr) {
            // see above, log error but continue execution
            emit('DOMException: unknown token in selector "' + selector + '"');
            return source;
          }

        }

        // ensure "match" is not null or empty since
        // we do not throw real DOMExceptions above
        selector = match && match[match.length - 1];
      }

      return source;
    },

  /*----------------------------- QUERY METHODS ------------------------------*/

  // match element with selector
  // @return boolean
  match =
    function(element, selector, from, data, callback) {
      // make sure an element node was passed
      if (element && element.nodeType == 1 &&
        element.nodeName.charCodeAt(0)>64) {
        if (typeof selector == 'string' && selector.length) {
          doc = element.ownerDocument;
          root = doc.documentElement;
          // save compiled matchers
          if (!compiledMatchers[selector]) {
            compiledMatchers[selector] = compileGroup(selector, '', false);
          }
          // result of compiled matcher
          return compiledMatchers[selector](element, snap, data, doc, root, from || doc, callback);
        } else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
        }
      }
      return false;
    },

  native_api =
    function(selector, from, data, callback) {
      var element, elements;
      switch (selector.charAt(0)) {
        case '#':
          if ((element = byId(selector.slice(1), from))) {
            callback && callback(element);
            data[data.length] = element;
          }
          return data;
        case '.':
          elements = byClass(selector.slice(1), from);
          break;
        default:
          elements = byTag(selector, from);
          break;
      }
      return callback ?
        concatCall(data, elements, callback) :
        data || !NATIVE_SLICE_PROTO ?
          concatList(data, elements) :
          slice.call(elements);
    },

  // select elements matching selector
  // using new Query Selector API
  // @return array
  select_qsa =
    function(selector, from, data, callback) {

      if (USE_QSA) { 

        if (RE_SIMPLE_SELECTOR.test(selector))
          return native_api(selector, from, data || [ ], callback);

        if (!compiledSelectors[selector] &&
          !RE_BUGGY_QSAPI.test(selector) &&
          (!from || QSA_NODE_TYPES[from.nodeType])) {

          try {
            var elements = (from || doc).querySelectorAll(selector);
          } catch(e) { }

          if (elements) {
            switch (elements.length) {
              case 0:
                return data || [ ];
              case 1:
                callback && callback(elements.item(0));
                if (data) data.push(elements.item(0));
                else return [ elements.item(0) ];
                return data;
              default:
                return callback ?
                  concatCall(data || [ ], elements, callback) :
                  data || !NATIVE_SLICE_PROTO ?
                    concatList(data || [ ], elements) :
                    slice.call(elements);
            }
          }
        }
      }

      // fall back to NWMatcher select
      return client_api(selector, from, data, callback);
    },

  // select elements matching selector
  // using cross-browser client API
  // @return array
  client_api =
    function(selector, from, data, callback) {

      var i, done, element, elements, parts, token, hasChanged, isSingle;

      if (RE_SIMPLE_SELECTOR.test(selector))
        return native_api(selector, from, data || [ ], callback);

      // add left context if missing
      if (reLeftContext.test(selector))
        selector = !from ?
          '*' + selector :
          from.id ?
            '#' + from.id + selector :
            selector;

      // add right context if missing
      if (reRightContext.test(selector))
        selector = selector + '*';

      // storage setup
      data || (data = [ ]);

      // ensure context is set
      from || (from = doc);

      // extract context if changed
      if (lastContext != from) {
        // save passed context
        lastContext = from;
        // reference context ownerDocument and document root (HTML)
        root = (doc = from.ownerDocument || from).documentElement;
      }

      if (hasChanged = lastSelector != selector) {
        // process valid selector strings
        if (reValidator.test(selector)) {
          // save passed selector
          lastSelector = selector;
          selector = selector.replace(reTrimSpaces, '');
        } else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
          return data;
        }
      }

      // pre-filtering pass allow to scale proportionally with big DOM trees;

      // commas separators are treated sequentially to maintain order
      if ((isSingle = selector.match(reSplitGroup).length < 2)) {

        if (hasChanged) {
          // get right most selector token
          parts = selector.match(reSplitToken);
          token = parts[parts.length - 1];

          // only last slice before :not rules
          lastSlice = token.split(':not')[0];
        }

        // reduce selection context
        if (doc.getElementById && (parts = selector.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = byId(token, doc))) {
            if (/[>+~]/.test(selector)) from = element.parentNode;
            else from = element;
          } else return data;
        }

        // ID optimization RTL
        if (doc.getElementById && (parts = lastSlice.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = byId(token, doc))) {
            if (match(element, selector)) {
              elements = [ element ];
              done = true;
            }
          } else return data;
        }

        // CLASS optimization RTL
        else if ((parts = lastSlice.match(Optimize.CLASS)) && (token = parts[1])) {
          if ((elements = byClass(token, from)).length === 0) return data;
          if (selector == '.' + token) done = true;
        }

        // TAG optimization RTL
        else if ((parts = lastSlice.match(Optimize.TAG)) && (token = parts[1])) {
          if ((elements = byTag(token, from)).length === 0) return data;
          if (selector == token) done = true;
        }

      }

      if (!elements) {
        elements = from.getElementsByTagName('*');
      }
      // end of prefiltering pass

      // save compiled selectors
      if (!done && !compiledSelectors[selector]) {
        if (isSingle) {
          compiledSelectors[selector] =
            new Function('c,s,r,d,h,g,f',
              'var n,x=0,N,k=0,e;main:while(N=e=c[k++]){' +
              SKIP_NON_ELEMENTS + compileSelector(selector, ACCEPT_NODE) +
              '}return r;');
        } else {
          compiledSelectors[selector] = compileGroup(selector, '', true);
        }
      }

      if (!done) {
        // reinitialize indexes
        indexesByNodeType = { };
        indexesByNodeName = { };
      }

      return done ?
        callback ? concatCall(data, elements, callback) : concatList(data, elements) :
        compiledSelectors[selector](elements, snap, data, doc, root, from, callback);
    },

  // use the new native Selector API if available,
  // if missing, use the cross-browser client api
  // @return array
  select = NATIVE_QSAPI ?
    select_qsa :
    client_api,

  /*-------------------------------- STORAGE ---------------------------------*/

  // CSS_ID expando on elements,
  // used to keep child indexes
  // during a selection session
  CSS_ID = 1,

  CSS_INDEX = 'uniqueID' in root ? 'uniqueID' : 'CSS_ID',

  // ordinal position by nodeType or nodeName
  indexesByNodeType = { },
  indexesByNodeName = { },

  // compiled select functions returning collections
  compiledSelectors = { },

  // compiled match functions returning booleans
  compiledMatchers = { },

  // used to pass methods to compiled functions
  snap = {

    // element indexing methods (nodeType/nodeName)
    getIndexesByNodeType: getIndexesByNodeType,
    getIndexesByNodeName: getIndexesByNodeName,

    // element inspection methods
    getAttribute: getAttribute,
    hasAttribute: hasAttribute,

    // element selection methods
    byClass: byClass,
    byName: byName,
    byTag: byTag,
    byId: byId,

    // helper/check methods
    stripTags: stripTags,
    isLink: isLink,

    // selection/matching
    select: select,
    match: match
  };

  /*------------------------------- PUBLIC API -------------------------------*/

  return {

    // retrieve element by id attr
    byId: byId,

    // retrieve elements by tag name
    byTag: byTag,

    // retrieve elements by name attr
    byName: byName,

    // retrieve elements by class name
    byClass: byClass,

    // read the value of the attribute
    // as was in the original HTML code
    getAttribute: getAttribute,

    // check for the attribute presence
    // as was in the original HTML code
    hasAttribute: hasAttribute,

    // element match selector, return boolean true/false
    match: match,

    // elements matching selector, starting from element
    select: select,

    // compile selector into ad-hoc javascript resolver
    compile: compile,

    // select internal engine or native querySelectorAll
    setQSA: setQSA,

    // add or overwrite user defined operators
    registerOperator:
      function(symbol, resolver) {
        if (!Operators[symbol]) {
          Operators[symbol] = resolver;
        }
      },

    // add selector patterns for user defined callbacks
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
