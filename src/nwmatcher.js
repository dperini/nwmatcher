/*
 * Copyright (C) 2007-2011 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast CSS selector engine and matcher
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.2.4beta
 * Created: 20070722
 * Release: 20110426
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

(function(global) {

  var version = 'nwmatcher-1.2.4beta',

  // processing context
  doc = global.document,

  // context root element
  root = doc.documentElement,

  // save method reference
  slice = Array.prototype.slice,
  string = Object.prototype.toString,

  // persist last selector/matcher parsing data
  lastError = '',
  lastSlice = '',
  lastPosition = 0,
  lastMatcher = '',
  lastSelector = '',
  isSingleMatch = false,
  isSingleSelect = false,

  // selector/matcher context
  lastContext,

  // initialized with the loading context
  // and reset for each selection query
  BUGGY_QSAPI_QUIRKS,
  QUIRKS_MODE,
  TO_UPPER_CASE,
  XML_DOCUMENT,

  // prefixes identifying id, class & pseudo-class
  prefixes = '[.:#]?',

  // attributes operators
  // ! invalid but compat !
  operators = '([~*^$|!]?={1})',

  // whitespace characters
  whitespace = '[\\x20\\t\\n\\r\\f]*',

  // 4 combinators F E, F>E, F+E, F~E
  combinators = '[\\x20]|[>+~][^>+~]',

  // an+b format params for psuedo-classes
  pseudoparms = '[-+]?\\d*n?[-+]?\\d*',

  // CSS quoted string values
  quotedvalue = '"[^"]*"' + "|'[^']*'",

  // http://www.w3.org/TR/css3-syntax/#characters
  // unicode/ISO 10646 characters 161 and higher
  // NOTE: Safari 2.0.x crashes with escaped (\\)
  // Unicode ranges in regular expressions so we
  // use a negated character range class instead
  encoding = '(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)',

  // CSS identifier syntax
  identifier = '(?:-?[_a-zA-Z]{1}[-\\w]*|[^\\x00-\\xa0]+|\\\\.+)+',

  // build attribute string
  attributes =
    whitespace + '(' + encoding + '+:?' + encoding + '+)' +
    whitespace + '(?:' + operators + whitespace + '(' +
    quotedvalue + '|' + identifier + '))?' + whitespace,

  // build pseudoclass string
  pseudoclass = '((?:' +
    // an+b parameters or quoted string
    pseudoparms + '|' + quotedvalue + '|' +
    // id, class, pseudo-class selector
    prefixes + '|' + encoding + '+|' +
    // nested HTML attribute selector
    '\\[' + attributes + '\\]|' +
    // nested pseudo-class selector
    '\\(.+\\)|' + whitespace + '|' +
    // nested pseudos/separators
    ',)+)',

  // placeholder for extensions
  extensions = '.+',

  // CSS3: syntax scanner and
  // one pass validation only
  // using regular expression
  standardValidator =
    // discard start
    '(?=\s*[^>+~(){}<>])' +
    // open match group
    '(' +
    //universal selector
    '\\*' +
    // id/class/tag/pseudo-class identifier
    '|(?:' + prefixes + identifier + ')' +
    // combinator selector
    '|' + combinators +
    // HTML attribute selector
    '|\\[' + attributes + '\\]' +
    // pseudo-classes parameters
    '|\\(' + pseudoclass + '\\)' +
    // dom properties selector (extension)
    '|\\{' + extensions + '\\}' +
    // selector group separator (comma)
    '|,' +
    // close match group
    ')+',

  // validator for standard selectors as default
  reValidator = new RegExp(standardValidator, 'g'),

  // validator for complex selectors in ':not()' pseudo-classes
  extendedValidator = standardValidator.replace(pseudoclass, '.*'),

  // whitespace is any combination of these 5 character [\x20\t\n\r\f]
  // http://www.w3.org/TR/css3-selectors/#selector-syntax
  reTrimSpaces = new RegExp('^' +
    whitespace + '|' + whitespace + '$', 'g'),

  // only allow simple selectors nested in ':not()' pseudo-classes
  reSimpleNot = new RegExp('^(' +
    '(?!:not)' +
    '(' + prefixes +
    '|' + identifier +
    '|\\([^()]*\\))+' +
    '|\\[' + attributes + '\\]' +
    ')$'),

  // skip group of round brackets
  skipround = '\\([^()]+\\)|\\(.*\\)',
  // skip group of curly brackets
  skipcurly = '\\{[^{}]+\\}|\\{.*\\}',
  // skip group of square brackets
  skipsquare = '\\[[^[\\]]*\\]|\\[.*\\]',

  // skip [ ], ( ), { } groups in token tails
  skipgroup = '\\[.*\\]|\\(.*\\)|\\{.*\\}',

  // split comma groups, exclude commas from
  // quotes '' "" and from brackets () [] {}
  reSplitGroup = new RegExp('(' +
    '[^(,)\\\\\\[\\]]+' +
    '|\\[(?:' + skipsquare +
    '|' + quotedvalue +
    '|[^\\[\\]]+)+\\]' +
    '|' + skipround +
    '|' + skipcurly +
    '|\\\\.' +
    ')+', 'g'),

  // split last, right most, selector group token
  reSplitToken = new RegExp('(' +
    '\\(' + pseudoclass + '\\)|' +
    '\\[' + attributes + '\\]|' +
    '[^\x20>+~]|\\\\.)+', 'g'),

  // for in excess whitespace removal
  reWhiteSpace = /[\x20\t\n\r\f]+/g,

  // match missing R/L context
  reLeftContext = /^\s*[>+~]{1}/,
  reRightContext = /[>+~]{1}\s*$/,

  reOptimizeSelector = new RegExp(identifier + '|^$'),

  // simulates a negative RegExp#test
  testFalse = { 'test': function() { return false; } },

  // simulates a positive RegExp#test
  testTrue = { 'test': function() { return true; } },

  /*----------------------------- FEATURE TESTING ----------------------------*/

  // detect native methods
  isNative = (function() {
    var s = (doc.childNodes.item + '').replace(/item/g, '');
    return function(object, method) {
      var m = object && object[method] || false, r = new RegExp(method, 'g');
      return m && typeof m != 'string' && s == (m + '').replace(r, '');
    };
  })(),

  isQuirksBuggy =
    function(document) {
      // In quirks mode css class names are case insensitive.
      // In standards mode they are case sensitive. See docs:
      // https://developer.mozilla.org/en/Mozilla_Quirks_Mode_Behavior
      // http://www.whatwg.org/specs/web-apps/current-work/#selectors

      // Safari 3.2 QSA doesn't work with mixedcase in quirksmode
      // https://bugs.webkit.org/show_bug.cgi?id=19047
      // must test the attribute selector '[class~=xxx]'
      // before '.xXx' or the bug may not present itself
      var div = document.createElement('div');
      div.appendChild(doc.createElement('p')).setAttribute('class', 'xXx');
      div.appendChild(doc.createElement('p')).setAttribute('class', 'xxx');
      return (NATIVE_QSAPI && isQuirks(document) &&
        (div.querySelectorAll('[class~=xxx]').length != 2 ||
        div.querySelectorAll('.xXx').length != 2));
    },

  // Safari 2 missing document.compatMode property
  // makes harder to detect Quirks vs. Strict mode
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

  // XML is functional in W3C browsers
  isXML = function(document) {
      return document.createElement('DiV').nodeName == 'DiV';
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
  NATIVE_GET_ATTRIBUTE = isNative(root, 'getAttribute'),
  NATIVE_HAS_ATTRIBUTE = isNative(root, 'hasAttribute'),

  // check if slice() can convert nodelist to array
  // see http://yura.thinkweb2.com/cft/
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

  // supports the new traversal API
  NATIVE_TRAVERSAL_API =
    'nextElementSibling' in root && 'previousElementSibling' in root,

  // select Matches Selector API to use if available
  NATIVE_MATCHES_SELECTOR =
    isNative(root, 'matchesSelector') ? 'matchesSelector' :
    isNative(root, 'oMatchesSelector') ? 'oMatchesSelector' :
    isNative(root, 'msMatchesSelector') ? 'msMatchesSelector' :
    isNative(root, 'mozMatchesSelector') ? 'mozMatchesSelector' :
    isNative(root, 'webkitMatchesSelector') ? 'webkitMatchesSelector' : null,

  // BUGGY_XXXXX true if method is feature tested and has known bugs
  // detect buggy gEBID
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

  // detect IE bug with dynamic attributes
  BUGGY_GET_ATTRIBUTE = NATIVE_GET_ATTRIBUTE ?
    (function() {
      var isBuggy, input;
      (input = doc.createElement('input')).setAttribute('value', '5');
      return isBuggy = input.defaultValue != 5;
    })() :
    true,

  // detect IE bug with non-standard boolean attributes
  BUGGY_HAS_ATTRIBUTE = NATIVE_HAS_ATTRIBUTE ?
    (function() {
      var isBuggy, option = doc.createElement('option');
      option.setAttribute('selected', 'selected');
      isBuggy = !option.hasAttribute('selected');
      return isBuggy;
    })() :
    true,

  // detect matchesSelector correctly throw errors
  BUGGY_PSEUDOS = NATIVE_MATCHES_SELECTOR ?
    (function() {
      var isBuggy = false;
      try {
        root[NATIVE_MATCHES_SELECTOR](':buggy');
        isBuggy = true;
      } catch(e) { }
      return isBuggy;
    })() :
    true,

  // detect Safari bug with selected option elements
  BUGGY_SELECTED =
    (function() {
      var isBuggy, select = doc.createElement('select');
      select.appendChild(doc.createElement('option'));
      isBuggy = !select.firstChild.selected;
      return isBuggy;
    })(),

  // detect Opera browser
  OPERA = /opera/i.test(string.call(global.opera)),

  // skip simpe selector optimizations for Opera >= 11
  OPERA_QSAPI = OPERA && parseFloat(opera.version()) >= 11,

  // check Seletor API implementations
  RE_BUGGY_QSAPI = NATIVE_QSAPI ?
    (function() {
      var pattern = [ ], div = doc.createElement('div'),
        element = doc.createElement('input');

      // ^= $= *= operators bugs with empty values (IE8 / Opera 10 / Safari 3)
      element.setAttribute('type', 'checkbox');
      element.setAttribute('checked', 'checked');
      div.appendChild(element).setAttribute('class', '');
      try {
        div.querySelectorAll('[class^=""]').length == 1 &&
          pattern.push('[*^$]=\\s*(?:""|' + "'')");
      } catch(e) { }

      // :checked bugs whith checkbox elements (Opera 10+)
      try {
        div.querySelectorAll(':checked').length == 1 ||
          pattern.push(':checked');
      } catch(e) { }

      // :enabled :disabled bugs with hidden fields (Firefox 3.5, Opera 10+)
      // http://www.w3.org/TR/html5/interactive-elements.html#selector-enabled
      // IE8 QSA has problems too and throws error with these dynamic pseudos
      (element = doc.createElement('input')).setAttribute('type', 'hidden');
      div.replaceChild(element, div.firstChild);
      try {
        div.querySelectorAll(':enabled').length == 1 &&
          pattern.push(':enabled', ':disabled');
      } catch(e) { }

      // :link bugs with hyperlinks matching (Firefox/Safari)?
      div.appendChild(doc.createElement('a')).setAttribute('href', 'x');
      div.querySelectorAll(':link').length != 1 && pattern.push(':link');

      // avoid attribute selectors for IE QSA
      if (BUGGY_HAS_ATTRIBUTE) {
        // IE fails in reading:
        // - original values for input/textarea
        // - original boolean values for controls
        pattern.push('\\[\\s*(?:checked|disabled|ismap|multiple|readonly|selected|value)');
      }

      return pattern.length ?
        new RegExp(pattern.join('|')) :
        testFalse;
    })() :
    testTrue,

  // check for HTML5 Selector API bugs
  RE_BUGGY_QSAPI_HTML5 = NATIVE_QSAPI ?
    (function() {
      var div = doc.createElement('div'),
        element = doc.createElement('option'),
        pattern = testFalse;

      // :checked bug with option elements (at least Chrome 4+)
      // wrongly excludes 'selected' option elements
      element.setAttribute('selected', 'selected');
      div.appendChild(element);
      try {
        div.querySelectorAll(':checked').length == 0 &&
          (pattern = /:checked/);
      } catch(e) { }

      return pattern;
    })() :
    testTrue,

  // matches class selectors
  RE_CLASS = new RegExp('(?:\\[[\\x20\\t\\n\\r\\f]*class\\b|\\.' + identifier + ')'),

  // matches pseudo-classes
  RE_PSEUDOS = new RegExp(':[-\\w]+'),

  // matches simple id, tag & class selectors
  RE_SIMPLE_SELECTOR = new RegExp(
    !(BUGGY_GEBTN && BUGGY_GEBCN) ? !OPERA ?
      '^(?:\\*|[.#]?-?[_a-zA-Z]{1}' + encoding + '*)$' :
      '^(?:\\*|#-?[_a-zA-Z]{1}' + encoding + '*)$' :
      '^#?-?[_a-zA-Z]{1}' + encoding + '*$'),

  /*----------------------------- LOOKUP OBJECTS -----------------------------*/

  LINK_NODES = { 'a': 1, 'A': 1, 'area': 1, 'AREA': 1, 'link': 1, 'LINK': 1 },

  QSA_NODE_TYPES = { '9': 1, '11': 1 },

  // boolean attributes should return attribute name instead of true/false
  ATTR_BOOLEAN = {
    checked: 1, disabled: 1, ismap: 1, multiple: 1, readonly: 1, selected: 1
  },

  // dynamic attributes that needs to be checked against original HTML value
  ATTR_DEFAULT = {
    value: 'defaultValue',
    checked: 'defaultChecked',
    selected: 'defaultSelected'
  },

  // HTML to DOM namespace mapping for special case attributes (IE engines)
  ATTR_MAPPING = {
    'class': 'className', 'for': 'htmlFor'
  },

  // attribute referencing URI data values need special treatment in IE
  ATTR_URIDATA = {
    'action': 2, 'cite': 2, 'codebase': 2, 'data': 2, 'href': 2,
    'longdesc': 2, 'lowsrc': 2, 'src': 2, 'usemap': 2
  },

  // HTML 5 draft specifications
  // http://www.whatwg.org/specs/web-apps/current-work/#selectors
  HTML_TABLE = {
    // class attribute must be treated case-insensitive in HTML quirks mode
    // initialized by default to Standard Mode (case-sensitive),
    // set dynamically by the attribute resolver
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

  // the following attributes must be treated case-insensitive in XHTML mode
  // Niels Leenheer http://rakaz.nl/item/css_selector_bugs_case_sensitivity
  XHTML_TABLE = {
    'accept': 1, 'accept-charset': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'codetype': 1, 'color': 1,
    'enctype': 1, 'face': 1, 'hreflang': 1, 'http-equiv': 1,
    'lang': 1, 'language': 1, 'link': 1, 'media': 1, 'rel': 1,
    'rev': 1, 'target': 1, 'text': 1, 'type': 1, 'vlink': 1
  },

  /*-------------------------- REGULAR EXPRESSIONS ---------------------------*/

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

  // optimization expressions
  Optimize = {
    ID: new RegExp('^\\*?#(' + encoding + '+)|' + skipgroup),
    TAG: new RegExp('^(' + encoding + '+)|' + skipgroup),
    CLASS: new RegExp('^\\*?\\.(' + encoding + '+$)|' + skipgroup),
    NAME: /\[\s*name\s*=\s*((["']*)([^'"()]*?)\2)?\s*\]/
  },

  // precompiled Regular Expressions
  Patterns = {
    // structural pseudo-classes and child selectors
    spseudos: /^\:((root|empty|nth-)?(?:(first|last|only)-)?(child)?-?(of-type)?)(?:\(([^\x29]*)\))?(.*)/,
    // uistates + dynamic + negation pseudo-classes
    dpseudos: /^\:(link|visited|target|lang|not|active|focus|hover|checked|disabled|enabled|selected)(?:\((["']*)(.*?(\(.*\))?[^'"()]*?)\2\))?(.*)/,
    // element attribute matcher
    attribute: new RegExp('^\\[' + attributes + '\\](.*)'),
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
    id: new RegExp('^#(' + encoding + '+)(.*)'),
    // tag
    tagName: new RegExp('^(' + encoding + '+)(.*)'),
    // class
    className: new RegExp('^\\.(' + encoding + '+)(.*)')
  },

  /*------------------------------ UTIL METHODS -------------------------------*/

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

  // change context specific variables
  switchContext =
    function(from, force) {
      var oldDoc = doc;
      // save passed context
      lastContext = from;
      // reference context ownerDocument and document root (HTML)
      root = (doc = from.ownerDocument || from).documentElement;
      if (force || oldDoc != doc) {
        // set flags
        BUGGY_QSAPI_QUIRKS = isQuirksBuggy(doc);
        QUIRKS_MODE = isQuirks(doc);
        XML_DOCUMENT = isXML(doc);
        // code chunk used when nodeName comparisons need to be uppercased
        TO_UPPER_CASE = XML_DOCUMENT ? '.toUpperCase()' : '';
      }
    },

  /*------------------------------ DOM METHODS -------------------------------*/

  // element by id (raw)
  // @return reference or null
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

  // element by id
  // @return reference or null
  _byId = !BUGGY_GEBID ?
    function(id, from) {
      id = id.replace(/\\/g, '');
      return from.getElementById && from.getElementById(id) ||
        byIdRaw(id, from.getElementsByTagName('*'));
    } :
    function(id, from) {
      var element = null;
      id = id.replace(/\\/g, '');
      if (XML_DOCUMENT || from.nodeType != 9) {
        return byIdRaw(id, from.getElementsByTagName('*'));
      }
      if ((element = from.getElementById(id)) &&
        element.name == id && from.getElementsByName) {
        return byIdRaw(id, from.getElementsByName(id));
      }
      return element;
    },

  // publicly exposed byId
  // @return reference or null
  byId =
    function(id, from) {
      switchContext(from || (from = doc));
      return _byId(id, from);
    },

  // elements by tag (raw)
  // @return array
  byTagRaw = function(tag, from) {
    var any = tag == '*', element = from, elements = [ ], next = element.firstChild;
    any || (tag = tag.toUpperCase());
    while ((element = next)) {
      if (element.tagName > '@' && (any || element.tagName.toUpperCase() == tag)) {
        elements[elements.length] = element;
      }
      if ((next = element.firstChild || element.nextSibling)) continue;
      while (!next && (element = element.parentNode) && element != from) {
        next = element.nextSibling;
      }
    }
    return elements;
  },

  // elements by tag
  // @return array
  _byTag = !BUGGY_GEBTN && NATIVE_SLICE_PROTO ?
    function(tag, from) {
      return slice.call(from.getElementsByTagName ?
        from.getElementsByTagName(tag) :
        byTagRaw(tag, from), 0);
    } :
    function(tag, from) {
      var i = -1, data = [ ],
        element, elements = from.getElementsByTagName(tag);
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

  // publicly exposed byTag
  // @return array
  byTag =
    function(tag, from) {
      switchContext(from || (from = doc));
      return _byTag(tag, from);
    },

  // publicly exposed byName
  // @return array
  byName =
    function(name, from) {
      return select('[name="' + name.replace(/\\/g, '') + '"]', from);
    },

  // elements by class (raw)
  // @return array
  byClassRaw =
    function(name, from) {
      var i = -1, j = i, data = [ ], element, elements = _byTag('*', from), n;
      name = ' ' + (QUIRKS_MODE ? name.toLowerCase() : name).replace(/\\/g, '') + ' ';
      while ((element = elements[++i])) {
        n = XML_DOCUMENT ? element.getAttribute('class') : element.className;
        if (n && n.length && (' ' + (QUIRKS_MODE ? n.toLowerCase() : n).
          replace(reWhiteSpace, ' ') + ' ').indexOf(name) > -1) {
          data[++j] = element;
        }
      }
      return data;
    },

  // elements by class
  // @return array
  _byClass =
    function(name, from) {
      return (BUGGY_GEBCN || XML_DOCUMENT || !from.getElementsByClassName) ?
        byClassRaw(name, from) : slice.call(from.getElementsByClassName(name.replace(/\\/g, '')), 0);
    },

  // publicly exposed byClass
  // @return array
  byClass =
    function(name, from) {
      switchContext(from || (from = doc));
      return _byClass(name, from);
    },

  // check element is descendant of container
  // @return boolean
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

  // attribute value
  // @return string
  getAttribute = !BUGGY_GET_ATTRIBUTE ?
    function(node, attribute) {
      return node.getAttribute(attribute) || '';
    } :
    function(node, attribute) {
      attribute = attribute.toLowerCase();
      if (ATTR_DEFAULT[attribute] in node) {
        return node[ATTR_DEFAULT[attribute]] || '';
      }
      return (
        // specific URI data attributes (parameter 2 to fix IE bug)
        ATTR_URIDATA[attribute] ? node.getAttribute(attribute, 2) || '' :
        // boolean attributes should return name instead of true/false
        ATTR_BOOLEAN[attribute] ? node.getAttribute(attribute) ? attribute : '' :
          ((node = node.getAttributeNode(attribute)) && node.value) || '');
    },

  // attribute presence
  // @return boolean
  hasAttribute = !BUGGY_HAS_ATTRIBUTE ?
    function(node, attribute) {
      return node.hasAttribute(attribute);
    } :
    function(node, attribute) {
      attribute = attribute.toLowerCase();
      // older IE engines requires DOM mapping
      // see NetFront/Playstation as an example
      attribute = attribute in ATTR_MAPPING ?
        ATTR_MAPPING[attribute] : attribute;
      if (ATTR_DEFAULT[attribute] in node) {
        return !!node[ATTR_DEFAULT[attribute]];
      }
      // need to get at AttributeNode first on IE
      node = node.getAttributeNode(attribute);
      // use both "specified" & "nodeValue" properties
      return !!(node && (node.specified || node.nodeValue));
    },

  // check node emptyness
  isEmpty =
    function(node) {
      node = node.firstChild;
      while (node) {
        if (node.nodeType == 3 || node.nodeName > '@') return false;
        node = node.nextSibling;
      }
      return true;
    },

  // check if element matches the :link pseudo
  // @return boolean
  isLink =
    function(element) {
      return hasAttribute(element,'href') && LINK_NODES[element.nodeName];
    },

  // child position by nodeType
  // @return number
  nthElement =
    function(element, last) {
      var count = 1, succ = last ? 'nextSibling' : 'previousSibling';
      while ((element = element[succ])) {
        if (element.nodeName > '@') ++count;
      }
      return count;
    },

  // child position by nodeName
  // @return number
  nthOfType =
    function(element, last) {
      var count = 1, succ = last ? 'nextSibling' : 'previousSibling', type = element.nodeName;
      while ((element = element[succ])) {
        if (element.nodeName == type) ++count;
      }
      return count;
    },

  /*------------------------------- DEBUGGING --------------------------------*/

  // compile selectors to ad-hoc functions resolvers
  // @selector string
  // @mode boolean
  // false = select resolvers
  // true = match resolvers
  compile =
    function(selector, mode) {
      return compileGroup(selector, '', mode || false);
    },

  // set working mode
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
          USE_QSAPI = false;
          reValidator = new RegExp(extendedValidator, 'g');
        } else if (i == 'SHORTCUTS') {
          SHORTCUTS = !!options[i];
        } else if (i == 'USE_HTML5') {
          USE_HTML5 = !!options[i];
        } else if (i == 'USE_QSAPI') {
          USE_QSAPI = !!options[i] && NATIVE_QSAPI;
          reValidator = new RegExp(standardValidator, 'g');
        }
      }
    },

  // control user notifications
  emit =
    function(message) {
      if (VERBOSITY) {
        // FF/Safari/Opera DOMException.SYNTAX_ERR = 12
        if (typeof global.DOMException !== 'undefined') {
          var err = new Error();
          err.message = 'SYNTAX_ERR: (Selectors) ' + message;
          err.code = 12;
          throw err;
        } else {
          throw new Error(12, 'SYNTAX_ERR: (Selectors) ' + message);
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

  // by default disable complex selectors nested in
  // ':not()' pseudo-classes, as for specifications
  SIMPLENOT = true,

  // by default do not add missing left/right context
  // to selector string shortcuts like "+div" or "ul>"
  SHORTCUTS = false,

  // controls the engine error/warning notifications
  VERBOSITY = true,

  // HTML5 handling for the ":checked" pseudo-class
  USE_HTML5 = false,

  // controls enabling the Query Selector API branch
  USE_QSAPI = NATIVE_QSAPI,

  /*---------------------------- COMPILER METHODS ----------------------------*/

  // do not change this, it is searched & replaced
  // in multiple places to build compiled functions
  ACCEPT_NODE = 'f&&f(c[k]);r[r.length]=c[k];continue main;',

  // compile a comma separated group of selector
  // @mode boolean true for select, false for match
  // return a compiled function
  compileGroup =
    function(selector, source, mode) {

      var i = -1, seen = { }, token,
        parts = typeof selector == 'string' ?
          selector.match(reSplitGroup) : selector;

      // for each selector in the group
      while ((token = parts[++i])) {
        token = token.replace(reTrimSpaces, '');
        // avoid repeating the same token
        // in comma separated group (p, p)
        if (!seen[token]) {
          seen[token] = true;
          source += (i > 0 ? (mode ? 'e=c[k];': 'e=k;') : '') +
            compileSelector(token, mode ? ACCEPT_NODE : 'f&&f(k);return true;');
        }
      }

      if (mode) {
        // for select method
        return new Function('c,s,r,d,h,g,f',
          'var N,n,x=0,k=-1,e;main:while((e=c[++k])){' + source + '}return r;');
      } else {
        // for match method
        return new Function('e,s,r,d,h,g,f',
          'var N,n,x=0,k=e;' + source + 'return false;');
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
          i = true;
        }

        // *** ID selector
        // #Foo Id case sensitive
        else if ((match = selector.match(Patterns.id))) {
          // document can contain conflicting elements (id/name)
          // prototype selector unit need this method to recover bad HTML forms
          source = 'if(' + (XML_DOCUMENT ?
            's.getAttribute(e,"id")' :
            '(e.submit?s.getAttribute(e,"id"):e.id)') +
            '=="' + match[1] + '"' +
            '){' + source + '}';
        }

        // *** Type selector
        // Foo Tag (case insensitive)
        else if ((match = selector.match(Patterns.tagName))) {
          // both tagName and nodeName properties may be upper/lower case
          // depending on their creation NAMESPACE in createElementNS()
          source = 'if(e.nodeName' + (XML_DOCUMENT ?
            '=="' + match[1] + '"' : TO_UPPER_CASE +
            '=="' + match[1].toUpperCase() + '"') +
            '){' + source + '}';
        }

        // *** Class selector
        // .Foo Class (case sensitive)
        else if ((match = selector.match(Patterns.className))) {
          // W3C CSS3 specs: element whose "class" attribute has been assigned a
          // list of whitespace-separated values, see section 6.4 Class selectors
          // and notes at the bottom; explicitly non-normative in this specification.
          source = 'if((n=' + (XML_DOCUMENT ?
            's.getAttribute(e,"class")' : 'e.className') +
            ')&&n.length&&(" "+' + (QUIRKS_MODE ? 'n.toLowerCase()' : 'n') +
            '.replace(' + reWhiteSpace + '," ")+" ").indexOf(" ' +
            (QUIRKS_MODE ? match[1].toLowerCase() : match[1]) + ' ")>-1' +
            '){' + source + '}';
        }

        // *** Attribute selector
        // [attr] [attr=value] [attr="value"] [attr='value'] and !=, *=, ~=, |=, ^=, $=
        // case sensitivity is treated differently depending on the document type (see map)
        else if ((match = selector.match(Patterns.attribute))) {
          if (match[3]) match[3] = match[3].replace(/^\x22|\x22$/g, '').replace(/^\x27|\x27$/g, '');

          // xml namespaced attribute ?
          expr = match[1].split(':');
          expr = expr.length == 2 ? expr[1] : expr[0] + '';

          if (match[2] && !Operators[match[2]]) {
            emit('Unsupported operator in attribute selectors "' + selector + '"');
            return '';
          }

          test = false;
          type = 'false';

          // replace Operators parameter if needed
          if (match[2] && match[3] && (type = Operators[match[2]])) {
            // case treatment depends on document
            HTML_TABLE['class'] = QUIRKS_MODE ? 1 : 0;
            // replace escaped values and HTML entities
            match[3] = match[3].replace(/\\([0-9a-f]{2,2})/, '\\x$1');
            test = (XML_DOCUMENT ? XHTML_TABLE : HTML_TABLE)[expr.toLowerCase()];
            type = type.replace(/\%m/g, test ? match[3].toLowerCase() : match[3]);
          } else if (match[2] == '!=' || match[2] == '=') {
            type = 'n' + match[2] + '="' + match[3] + '"';
          }

          // build expression for has/getAttribute
          expr = 'n=s.' + (match[2] ? 'get' : 'has') +
            'Attribute(e,"' + match[1] + '")' +
            (test ? '.toLowerCase();' : ';');

          source = expr + 'if(' + (match[2] ? type : 'n') + '){' + source + '}';
        }

        // *** Adjacent sibling combinator
        // E + F (F adiacent sibling of E)
        else if ((match = selector.match(Patterns.adjacent))) {
          k++;
          source = NATIVE_TRAVERSAL_API ?
            'var N' + k + '=e;if(e&&(e=e.previousElementSibling)){' + source + '}e=N' + k + ';' :
            'var N' + k + '=e;while(e&&(e=e.previousSibling)){if(e.nodeName>"@"){' + source + 'break;}}e=N' + k + ';';
        }

        // *** General sibling combinator
        // E ~ F (F relative sibling of E)
        else if ((match = selector.match(Patterns.relative))) {
          k++;
          source = NATIVE_TRAVERSAL_API ?
            ('var N' + k + '=e;e=e.parentNode.firstElementChild;' +
            'while(e&&e!=N' + k + '){' + source + 'e=e.nextElementSibling;}e=N' + k + ';') :
            ('var N' + k + '=e;e=e.parentNode.firstChild;' +
            'while(e&&e!=N' + k + '){if(e.nodeName>"@"){' + source + '}e=e.nextSibling;}e=N' + k + ';');
        }

        // *** Child combinator
        // E > F (F children of E)
        else if ((match = selector.match(Patterns.children))) {
          k++;
          source = 'var N' + k + '=e;if(e&&e!==h&&e!==g&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }

        // *** Descendant combinator
        // E F (E ancestor of F)
        else if ((match = selector.match(Patterns.ancestor))) {
          k++;
          source = 'var N' + k + '=e;while(e&&e!==h&&e!==g&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }

        // *** Structural pseudo-classes
        // :root, :empty,
        // :first-child, :last-child, :only-child,
        // :first-of-type, :last-of-type, :only-of-type,
        // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
        else if ((match = selector.match(Patterns.spseudos)) && match[1]) {

          switch (match[2]) {
            case 'root':
              // element root of the document
              if (match[7]) {
                source = 'if(e===h||s.contains(h,e)){' + source + '}';
              } else {
                source = 'if(e===h){' + source + '}';
              }
              break;

            case 'empty':
              // element that has no children
              source = 'if(s.isEmpty(e)){' + source + '}';
              break;

            default:
              if (match[2] && match[6]) {
                if (match[6] == 'n') {
                  source = 'if(e!==h){' + source + '}';
                  break;
                } else if (match[6] == 'even') {
                  a = 2;
                  b = 0;
                } else if (match[6] == 'odd') {
                  a = 2;
                  b = 1;
                } else {
                  // assumes correct "an+b" format, "b" before "a" to keep "n" values
                  b = ((n = match[6].match(/(-?\d+)$/)) ? parseInt(n[1], 10) : 0);
                  a = ((n = match[6].match(/(-?\d*)n/)) ? parseInt(n[1], 10) : 0);
                  if (n && n[1] == '-') a = -1;
                }

                // build test expression out of structural pseudo (an+b) parameters
                // see here: http://www.w3.org/TR/css3-selectors/#nth-child-pseudo
                test =  b < 1 && a > 1 ? '(n-(' + b + '))%' + a + '==0' : a > +1 ?
                  (match[3] == 'last') ? '(n-(' + b + '))%' + a + '==0' :
                  'n>=' + b + '&&(n-(' + b + '))%' + a + '==0' : a < -1 ?
                  (match[3] == 'last') ? '(n-(' + b + '))%' + a + '==0' :
                  'n<=' + b + '&&(n-(' + b + '))%' + a + '==0' : a=== 0 ?
                  'n==' + b :
                  (match[3] == 'last') ?
                    a == -1 ? 'n>=' + b : 'n<=' + b :
                    a == -1 ? 'n<=' + b : 'n>=' + b;

                // 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
                source =
                  'if(e!==h){' +
                    'n=s[' + (match[5] ? '"nthOfType"' : '"nthElement"') + ']' +
                      '(e,' + (match[3] == 'last' ? 'true' : 'false') + ');' +
                    'if(' + test + '){' + source + '}' +
                  '}';

              } else {
                // 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
                a = match[3] == 'first' ? 'previous' : 'next';
                n = match[3] == 'only' ? 'previous' : 'next';
                b = match[3] == 'first' || match[3] == 'last';

                type = match[5] ? '&&n.nodeName!=e.nodeName' : '&&n.nodeName<"@"';

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
        else if ((match = selector.match(Patterns.dpseudos)) && match[1]) {

          switch (match[1]) {
            // CSS3 negation pseudo-class
            case 'not':
              // compile nested selectors, DO NOT pass the callback parameter
              // SIMPLENOT allow disabling complex selectors nested
              // in ':not()' pseudo-classes, breaks some test units
              expr = match[3].replace(reTrimSpaces, '');

              if (SIMPLENOT && !reSimpleNot.test(expr)) {
                // see above, log error but continue execution
                emit('Negation pseudo-class only accepts simple selectors "' + selector + '"');
                return '';
              } else {
                if ('compatMode' in doc) {
                  source = 'if(!' + compileGroup(expr, '', false) + '(e,s,r,d,h,g)){' + source + '}';
                } else {
                  source = 'if(!s.match(e, "' + expr.replace(/\x22/g, '\\"') + '",r)){' + source +'}';
                }
              }
              break;

            // CSS3 UI element states
            case 'checked':
              test = 'typeof e.form!=="undefined"&&(/radio|checkbox/i).test(e.type)';
              if (USE_HTML5) {
                // for radio buttons, checkboxes and options
                source = 'if(((' + test + ')||/option/i.test(e.nodeName))&&(e.checked||e.selected)){' + source + '}';
              } else {
                // for radio buttons and checkboxes
                source = 'if(' + test + '&&e.checked){' + source + '}';
              }
              break;
            case 'disabled':
              // does not consider hidden input fields
              source = 'if(((typeof e.form!=="undefined"&&!(/hidden/i).test(e.type))||s.isLink(e))&&e.disabled){' + source + '}';
              break;
            case 'enabled':
              // does not consider hidden input fields
              source = 'if(((typeof e.form!=="undefined"&&!(/hidden/i).test(e.type))||s.isLink(e))&&!e.disabled){' + source + '}';
              break;

            // CSS3 lang pseudo-class
            case 'lang':
              test = '';
              if (match[3]) test = match[3].substr(0, 2) + '-';
              source = 'do{(n=e.lang||"").toLowerCase();' +
                'if((n==""&&h.lang=="' + match[3].toLowerCase() + '")||' +
                '(n&&(n=="' + match[3].toLowerCase() +
                '"||n.substr(0,3)=="' + test.toLowerCase() + '")))' +
                '{' + source + 'break;}}while((e=e.parentNode)&&e!==g);';
              break;

            // CSS3 target pseudo-class
            case 'target':
              n = doc.location ? doc.location.hash : '';
              if (n) {
                source = 'if(e.id=="' + n.slice(1) + '"){' + source + '}';
              }
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
              if (XML_DOCUMENT) break;
              source = 'if(e===d.activeElement){' + source + '}';
              break;
            case 'hover':
              if (XML_DOCUMENT) break;
              source = 'if(e===d.hoverElement){' + source + '}';
              break;
            case 'focus':
              if (XML_DOCUMENT) break;
              source = NATIVE_FOCUS ?
                'if(e===d.activeElement&&d.hasFocus()&&(e.type||e.href)){' + source + '}' :
                'if(e===d.activeElement&&(e.type||e.href)){' + source + '}';
              break;

            // CSS2 selected pseudo-classes, not part of current CSS3 drafts
            // the 'selected' property is only available for option elements
            case 'selected':
              // fix Safari selectedIndex property bug
              expr = BUGGY_SELECTED ? '||(n=e.parentNode)&&n.options[n.selectedIndex]===e' : '';
              source = 'if(e.nodeName.toLowerCase()=="option"&&(e.selected' + expr + ')){' + source + '}';
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
            if ((match = selector.match(Selectors[expr].Expression)) && match[1]) {
              result = Selectors[expr].Callback(match, source);
              source = result.source;
              status = result.status;
              if (status) break;
            }
          }

          // if an extension fails to parse the selector
          // it must return a false boolean in "status"
          if (!status) {
            // log error but continue execution, don't throw real exceptions
            // because blocking following processes maybe is not a good idea
            emit('Unknown pseudo-class selector "' + selector + '"');
            return '';
          }

          if (!expr) {
            // see above, log error but continue execution
            emit('Unknown token in selector "' + selector + '"');
            return '';
          }

        }

        // error if no matches found by the pattern scan
        if (!match) {
          emit('Invalid syntax in selector "' + selector + '"');
          return '';
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
    function(element, selector, from, callback) {

      var changed, parts, resolver;

      // ensures a valid element node was passed
      if (!(element && element.nodeName > '@')) {
        emit("Invalid element argument");
        return false;
      }

      // ensures a valid selector string was passed
      if (!selector || typeof selector != 'string') {
        emit("Invalid selector argument");
        return false;
      }

      // if passed, check context contains element
      if (from && from.nodeType == 1 && !contains(from, element)) {
        return false;
      }

      selector = selector.replace(reTrimSpaces, '');

      // ensure context is set
      from || (from = element.ownerDocument);

      if (SHORTCUTS) {
        // add left context if missing
        if (reLeftContext.test(selector)) {
          selector = from.nodeType == 1 && from.id ?
            '#' + from.id + ' ' + selector :
            '* ' + selector;
        }
        // add right context if missing
        if (reRightContext.test(selector)) {
          selector = selector + ' *';
        }
      }

      // extract context if changed
      if (lastContext != from) {
        switchContext(from);
      }

      if ((changed = lastMatcher != selector)) {
        // process valid selector strings
        if ((parts = selector.match(reValidator)) && parts[0] == selector) {
          // save passed selector
          lastMatcher = selector;
          isSingleMatch = (parts = selector.match(reSplitGroup)).length < 2;
        } else {
          emit('The string "' + selector + '", is not a valid CSS selector');
          return false;
        }
      }

      // use matchesSelector API if available
      if (USE_QSAPI && element[NATIVE_MATCHES_SELECTOR] &&
        !(USE_HTML5 == RE_BUGGY_QSAPI_HTML5.test(selector)) &&
        !(BUGGY_QSAPI_QUIRKS && RE_CLASS.test(selector)) &&
        !(BUGGY_PSEUDOS && RE_PSEUDOS.test(selector)) &&
        !RE_BUGGY_QSAPI.test(selector)) {
        try {
          if (element[NATIVE_MATCHES_SELECTOR](selector)) {
            if (typeof callback == 'function') {
              callback(element);
            }
            return true;
          }
          return false;
        } catch(e) { }
      }

      // compile matcher resolver if necessary
      resolver = (XML_DOCUMENT && XMLMatchers[selector]) ?
        XMLMatchers[selector] : HTMLMatchers[selector] ?
          HTMLMatchers[selector] : (XML_DOCUMENT ?
            XMLMatchers : HTMLMatchers)[selector] = isSingleMatch ?
              new Function('e,s,r,d,h,g,f', 'var N,n,x=0,k=e;' +
                compileSelector(selector, 'f&&f(k);return true;') + 'return false;') :
              compileGroup(parts || selector, '', false);

      return resolver(element, Snapshot, [ ], doc, root, from || doc, callback);
    },

  // select elements matching selector
  // using new Query Selector API
  // or cross-browser client API
  // @return array
  select =
    function(selector, from, callback) {

      var i, changed, element, elements, parts, resolver, token;

      if (arguments.length === 0) {
        emit('Missing required selector parameters');
        return [ ];
      } else if (selector === '') {
        emit('Empty selector string');
        return [ ];
      } else if (typeof selector != 'string') {
        // QSA capable browsers do not throw
        return [ ];
      }

      // ensure context is set
      from || (from = doc);

      // extract context if changed
      if (lastContext != from) {
        switchContext(from);
      }

      if (!OPERA_QSAPI && RE_SIMPLE_SELECTOR.test(selector)) {
        switch (selector.charAt(0)) {
          case '#':
            if ((element = _byId(selector.slice(1), from))) {
              callback && callback(element);
              return [ element ];
            }
            return [ ];
          case '.':
            elements = _byClass(selector.slice(1), from);
            break;
          default:
            elements = _byTag(selector, from);
            break;
        }
        return callback ?
          concatCall([ ], elements, callback) : elements;
      }

      if (USE_QSAPI &&
        !(USE_HTML5 == RE_BUGGY_QSAPI_HTML5.test(selector)) &&
        !(BUGGY_QSAPI_QUIRKS && RE_CLASS.test(selector)) &&
        !RE_BUGGY_QSAPI.test(selector) &&
        QSA_NODE_TYPES[from.nodeType]) {

        // clear error state
        lastError = null;

        try {
          elements = from.querySelectorAll(selector);
        } catch(e) {
          // remember last error
          lastError = e;
          if (selector === '') throw e;
        }

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

      selector = selector.replace(reTrimSpaces, '');

      if (SHORTCUTS) {
        // add left context if missing
        if (reLeftContext.test(selector)) {
          selector = from.nodeType == 1 && from.id ?
            '#' + from.id + ' ' + selector :
            '* ' + selector;
        }
        // add right context if missing
        if (reRightContext.test(selector)) {
          selector = selector + ' *';
        }
      }

      if ((changed = lastSelector != selector)) {
        // process valid selector strings
        if ((parts = selector.match(reValidator)) && parts[0] == selector) {
          // save passed selector
          lastSelector = selector;
          isSingleSelect = (parts = selector.match(reSplitGroup)).length < 2;
        } else {
          emit('The string "' + selector + '", is not a valid CSS selector');
          return [ ];
        }
      }

      // commas separators are treated sequentially to maintain order
      if (isSingleSelect && from.nodeType != 11) {

        if (changed) {
          // get right most selector token
          parts = selector.match(reSplitToken);
          token = parts[parts.length - 1];

          // position where token was found
          lastPosition = selector.length - token.length;

          // only last slice before :not rules
          lastSlice = token.split(':not')[0];
        }

        // ID optimization RTL, to reduce number of elements to visit
        if ((parts = lastSlice.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = _byId(token, from))) {
            if (match(element, selector)) {
              callback && callback(element);
              return [ element ];
            }
          }
          return [ ];
        }

        // ID optimization LTR, to reduce selection context searches
        else if ((parts = selector.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = _byId(token, doc))) {
            if ('#' + token == selector) {
              callback && callback(element);
              return [ element ];
            }
            if (/[>+~]/.test(selector)) {
              from = element.parentNode;
            } else {
              selector = selector.replace('#' + token, '*');
              lastPosition -= token.length + 1;
              from = element;
            }
          } else return [ ];
        }

        if (!NATIVE_GEBCN && (parts = lastSlice.match(Optimize.TAG)) && (token = parts[1])) {
          if ((elements = _byTag(token, from)).length === 0) { return [ ]; }
          selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace(token, '*');
        }

        else if ((parts = lastSlice.match(Optimize.CLASS)) && (token = parts[1])) {
          if ((elements = _byClass(token, from)).length === 0) { return [ ]; }
          if (reOptimizeSelector.test(selector.charAt(selector.indexOf(token) - 1))) {
            selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace('.' + token, '');
          } else {
            selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace('.' + token, '*');
          }
        }

        else if ((parts = selector.match(Optimize.CLASS)) && (token = parts[1])) {
          if ((elements = _byClass(token, from)).length === 0) { return [ ]; }
          for (var z = 0, els = [ ]; elements.length > z; ++z) {
            els = concatList(els, elements[z].getElementsByTagName('*'));
          }
          elements = els;
          if (reOptimizeSelector.test(selector.charAt(selector.indexOf(token) - 1))) {
            selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace('.' + token, '');
          } else {
            selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace('.' + token, '*');
          }
        }

        else if (NATIVE_GEBCN && (parts = lastSlice.match(Optimize.TAG)) && (token = parts[1])) {
          if ((elements = _byTag(token, from)).length === 0) { return [ ]; }
          selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace(token, '*');
        }

      }

      if (!elements) {
        elements = _byTag('*', from);
      }
      // end of prefiltering pass

      // compile selector resolver if necessary
      resolver = (XML_DOCUMENT && XMLResolvers[selector]) ?
        XMLResolvers[selector] : HTMLResolvers[selector] ?
          HTMLResolvers[selector] : (XML_DOCUMENT ?
            XMLResolvers : HTMLResolvers)[selector] = isSingleSelect ?
              new Function('c,s,r,d,h,g,f', 'var N,n,x=0,k=-1,e;main:while((e=c[++k])){' +
                compileSelector(selector, ACCEPT_NODE) + '}return r;') :
              compileGroup(parts || selector, '', true);

      return resolver(elements, Snapshot, [ ], doc, root, from, callback);
    },

  /*-------------------------------- STORAGE ---------------------------------*/

  // compiled select functions returning collections
  HTMLResolvers = { },
  XMLResolvers = { },

  // compiled match functions returning booleans
  HTMLMatchers = { },
  XMLMatchers = { },

  // used to pass methods to compiled functions
  Snapshot = {

    // element indexing methods
    nthElement: nthElement,
    nthOfType: nthOfType,

    // element inspection methods
    getAttribute: getAttribute,
    hasAttribute: hasAttribute,

    // element selection methods
    byClass: _byClass,
    byName: byName,
    byTag: _byTag,
    byId: _byId,

    // helper/check methods
    contains: contains,
    isEmpty: isEmpty,
    isLink: isLink,

    // selection/matching
    select: select,
    match: match
  };

  /*------------------------------- PUBLIC API -------------------------------*/

  // create/extend NW namespace
  global.NW || (global.NW = { });
  global.NW.Dom || (global.NW.Dom = { });

  // export the public API for CommonJS implementations,
  // for headless JS engines or for standard web browsers
  var Dom = typeof exports == 'object' && exports || global.NW.Dom;

  // retrieve element by id attr
  Dom.byId = byId;

  // retrieve elements by tag name
  Dom.byTag = byTag;

  // retrieve elements by name attr
  Dom.byName = byName;

  // retrieve elements by class name
  Dom.byClass = byClass;

  // read the value of the attribute
  // as was in the original HTML code
  Dom.getAttribute = getAttribute;

  // check for the attribute presence
  // as was in the original HTML code
  Dom.hasAttribute = hasAttribute;

  // element match selector, return boolean true/false
  Dom.match = match;

  // elements matching selector, starting from element
  Dom.select = select;

  // compile selector into ad-hoc javascript resolver
  Dom.compile = compile;

  // check that two elements are ancestor/descendant
  Dom.contains = contains;

  // handle selector engine configuration settings
  Dom.configure = configure;

  // pass methods references to compiled resolvers
  Dom.Snapshot = Snapshot;

  // operators descriptor
  // for attribute operators extensions
  Dom.Operators = Operators;

  // selectors descriptor
  // for pseudo-class selectors extensions
  Dom.Selectors = Selectors;

  // add or overwrite user defined operators
  Dom.registerOperator = function(symbol, resolver) {
    Operators[symbol] || (Operators[symbol] = resolver);
  };

  // add selector patterns for user defined callbacks
  Dom.registerSelector = function(name, rexp, func) {
    Selectors[name] || (Selectors[name] = {
      Expression: rexp,
      Callback: func
    });
  };

  /*---------------------------------- INIT ----------------------------------*/

  // init context specific variables
  switchContext(doc, true);

})(this);
