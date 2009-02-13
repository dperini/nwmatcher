/*
 * Copyright (C) 2007-2009 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast CSS selector engine and matcher
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.1beta
 * Created: 20070722
 * Release: 20090127
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

window.NW || (window.NW = {});

NW.Dom = function(global) {

  var version = 'nwmatcher-1.1beta',

  // processing context
  base = global.document,

  // current DOM viewport
  view = base.defaultView,

  // script loading context
  context = global.document,

  // context root element (HTML)
  root = context.documentElement,

  /* BEGIN FEATURE TESTING */

  // detect native method in object
  // not same scope of isHostObject
  isNative = function(object, method) {
    return object && method in object &&
      typeof object[method] != 'string' &&
      // IE & W3C browser return "[native code]"
      // Safari <= 2.0.4 will return "[function]"
      (/\{\s*\[native code\]\s*\}|^\[function\]$/).
      test(object[method]);
    },

  // NOTE: NATIVE_XXXXX check for existance of method only
  // so through the code read it as "supported", maybe BUGGY

  // detect native getAttribute/hasAttribute methods,
  // frameworks extend these to elements, but it seems
  // this does not work for XML namespaced attributes,
  // used to check both getAttribute/hasAttribute in IE
  NATIVE_HAS_ATTRIBUTE = isNative(root, 'hasAttribute'),

  // detect if DOM methods are native in browsers
  NATIVE_QSAPI = isNative(context, 'querySelector'),
  NATIVE_GEBTN = isNative(root, 'getElementsByTagName'),
  NATIVE_GEBCN = isNative(root, 'getElementsByClassName'),

  // get name of best children collection property available
  // detect Safari 2.0.x different children implementation
  NATIVE_CHILDREN =
    'children' in root ?
      (view && global !== view ?
        'childNodes' :
        'children') :
      'childNodes',

  // nodeList can be converted by Array.slice() natively
  // on Opera 9.27 an id="length" will fold Array.slice()
  NATIVE_SLICE_PROTO =
    (function() {
      try {
        return !!Array.prototype.slice.call(root.childNodes)[0];
      } catch(e) { }
      return false;
    })(),

  // check for Mutation Events, DOMAttrModified should be
  // enough to ensure DOMNodeInserted/DOMNodeRemoved exist
  NATIVE_MUTATION_EVENTS = root.addEventListener ?
    (function() {
      var e, l, f = false;
      l = root.id;
      e = function() {
        root.removeEventListener('DOMAttrModified', e, false);
        NATIVE_MUTATION_EVENTS = true;
        root.id = l;
      };
      root.addEventListener('DOMAttrModified', e, false);
      // now modify a property
      root.id = 'nw';
      f = root.id != 'nw';
      root.id = l;
      return f;
    })() :
    false,

  // NOTE: BUGGY_XXXXX check both for existance and no known bugs,
  // so through the code read it as "not supported", or "undefined"

  // detect IE gEBTN comment nodes bug
  BUGGY_GEBTN = NATIVE_GEBTN ?
    (function() {
      var t = context.createElement('div');
      t.appendChild(context.createComment(''));
      t = t.getElementsByTagName('*')[0];
      return !!(t && t.nodeType == 8);
    })() :
    true,

  // detect Opera gEBCN second class and/or UTF8 bugs
  // test is taken from the jQuery selector test suite
  BUGGY_GEBCN = NATIVE_GEBCN ?
    (function() {
      var t = context.createElement('div');
      t.innerHTML = '<span class="台北abc 台北"></span>';
      return !t.getElementsByClassName('台北')[0];
    })() :
    true,

  // detect Safari < 3.1.2 bug where className
  // case sensitivity is not treated correclty
  // for example when no DOCTYPE was specified
  BUGGY_QSAPI = NATIVE_QSAPI ?
    (function() {
      var f = false, t = root.className;
      root.className = 'Case';
      f = context.compatMode == 'BackCompat' &&
        context.querySelector('.case') !== null;
      root.className = t;
      return f;
    })() :
    true,

  /* END FEATURE TESTING */

  // map of attribute names (in HTML and DOM namespaces)
  // many are missing here, or maybe there are too many
  // first two lines will cover most real cases anyway
  Attributes = {
    'class': 'className', 'for': 'htmlFor',
    'classname': 'className', 'htmlfor': 'htmlFor',
    'tabindex': 'tabIndex', 'accesskey': 'accessKey', 'maxlength': 'maxLength',
    'readonly': 'readOnly', 'longdesc': 'longDesc', 'frameborder': 'frameBorder',
    'ismap': 'isMap', 'usemap': 'useMap', 'nohref': 'noHref', 'nowrap': 'noWrap',
    'colspan': 'colSpan', 'rowspan': 'rowSpan',
    'cellpadding': 'cellPadding', 'cellspacing': 'cellSpacing',
    'marginwidth': 'marginWidth', 'marginheight': 'marginHeight'
  },

  // See Niels Leenheer blog http://rakaz.nl/item/css_selector_bugs_case_sensitivity
  //
  // Each attribute definition includes information about the case-sensitivity of its values.
  // http://www.w3.org/TR/html4/types.html#h-6.1
  //
  // HTML 4 and XHTML both have some attributes that have pre-defined and limited sets of values.
  // http://www.w3.org/TR/xhtml1/#h-4.11

  // Safari 2.0.x seems to always treat attributes as in Quirks mode
  insensitiveMap = /^CSS/i.test(context.compatMode) || (view && global !== view) ? {
    // must be trated case insensitive in both HTML and XHTML (Strict ?)
    'accept': 1, 'accept-charset': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'codetype': 1, 'color': 1,
    'face': 1, 'enctype': 1, 'hreflang': 1, 'http-equiv': 1,
    'lang': 1, 'language': 1, 'link': 1, 'media': 1, 'rel': 1,
    'rev': 1, 'target': 1, 'text': 1, 'type': 1, 'vlink': 1
    } : {
    // must be treated case insensitive in HTML (Quirks ?)
    'align': 1, 'checked': 1, 'clear': 1, 'compact': 1, 'declare': 1,
    'defer': 1, 'dir': 1, 'disabled': 1, 'frame': 1, 'method': 1,
    'multiple': 1, 'nohref': 1, 'noresize': 1, 'noshade': 1, 'nowrap': 1,
    'readonly': 1, 'rules': 1, 'scope': 1, 'scrolling': 1, 'selected': 1,
    'shape': 1, 'valign': 1, 'valuetype': 1
  },

  // attribute referencing URL values need special treatment in IE
  attributesUrl = {
    'action': 2, 'data': 2, 'href': 2, 'longdesc': 2, 'lowsrc': 2, 'src': 2
  },

  // attribute names may contain an XML namespace
  attributesXml = /(?:[-\w]|\\.)+:(?:[-\w]|\\.)+/,

  // selection functions returning collections
  compiledSelectors = { },

  // matching functions returning booleans
  compiledMatchers = { },

  // place to add exotic functionalities
  Selectors = {
    // as a simple example this will check
    // for chars not in standard ascii table
    //
    // 'mySpecialSelector': {
    //  'Expression': /\u0080-\uffff/,
    //  'Callback': mySelectorCallback
    //}
    //
    // 'mySelectorCallback' will be invoked
    // only after passing all other standard
    // checks and only if none of them worked
  },

  // trim leading/trailing whitespaces
  trim = /^\s+|\s+$/g,

  // nth pseudo selectors
  position = /:(nth|of-type)/,

  // Safari 2.0.x crashes with escaped (\\)
  // unicode ranges in regular expressions

  // ascii extended
  ascii = /\x00-\xff/,
  // ascii + unicode
  encoding = '\u0080-\uffff',

  // selector validator discard invalid chars
  validator = new RegExp("[-_*\\w" + encoding + "]"),

  // split comma separated selector groups, exclude commas inside () []
  // example: (#div a, ul > li a) group 1 is (#div a) group 2 is (ul > li a)
  group = /(([^,\(\)\[\]]+|\([^\(\)]+\)|\(.*\)|\[[^\[\]]+\]|\[.*\]|\\.|\*)+)/g,

  // attribute operators
  Operators = {
    // ! is not really in the specs
    // still unit tests have to pass
    '!': "%p!=='%m'",
    '=': "%p==='%m'",
    '^': "%p.indexOf('%m')==0",
    '*': "%p.indexOf('%m')>-1",
    // sensitivity handled by compiler
    // NOTE: working alternative
    // '|': "/%m-/i.test(%p+'-')",
    '|': "(%p+'-').indexOf('%m-')==0",
    '~': "(' '+%p+' ').indexOf(' %m ')>-1",
    // precompile in '%m' string length to optimize
    // NOTE: working alternative
    // '$': "%p.lastIndexOf('%m')==%p.length-'%m'.length"
    '$': "%p.substr(%p.length - '%m'.length) === '%m'"
  },

  // optimization expressions
  Optimize = {
    ID: new RegExp("\\#((?:[-_\\w" + encoding + "]|\\\\.)+)*"),
    TAG: new RegExp("((?:[-_\\w" + encoding + "]|\\\\.)+)*"),
    CLASS: new RegExp("\\.((?:[-_\\w" + encoding + "]|\\\\.)+)*"),
    // split last, right most, selector group token
    TOKEN: /([^\ \>\+\~\,\(\)\[\]]+|\([^\(\)]+\)|\(.*\)|\[[^\[\]]+\]|\[.*\])+/g,
    descendants: /[^> \w]/,
    siblings: /[^+~\w]/
  },

  // precompiled Regular Expressions
  Patterns = {
    // element attribute matcher
    attribute: /^\[([-\w]*:?(?:[-\w])+)\s*(?:([!^$*~|]*)?(\=)?\s*(["']*)?([^'"]*?)\4)\](.*)/,
    // structural pseudo-classes
    spseudos: /^\:(root|empty|nth)?-?(first|last|only)?-?(child)?-?(of-type)?(\((?:even|odd|[^\)]*)\))?(.*)/,
    // uistates + dynamic + negation pseudo-classes
    dpseudos: /^\:((?:[-\w]|\\.)+)(\(([\x22\x27]*)?(.*?(\(.*?\))?[^(]*?)\3\))?(.*)/,
    // E > F
    children: /^\s*\>\s*(.*)/,
    // E + F
    adjacent: /^\s*\+\s*(.*)/,
    // E ~ F
    relative: /^\s*\~\s*(.*)/,
    // E F
    ancestor: /^(\s+)(.*)/,
    // all
    all: /^\*(.*)/,
    // id
    id: new RegExp("^\\#((?:[-_\\w" + encoding + "]|\\\\.)+)(.*)"),
    // tag
    tagName: new RegExp("^((?:[-_\\w" + encoding + "]|\\\\.)+)(.*)"),
    // class
    className: new RegExp("^\\.((?:[-_\\w" + encoding + "]|\\\\.)+)(.*)")
  },

  // current CSS3 grouping of Pseudo-Classes
  // they allowed implementing extensions
  // and to improve error notification
  CSS3PseudoClasses = {
    Structural: {
      'root': 0, 'empty': 0,
      'first-child': 0, 'last-child': 0, 'only-child': 0,
      'first-of-type': 0, 'last-of-type': 0, 'only-of-type': 0,
      'first-child-of-type': 0, 'last-child-of-type': 0, 'only-child-of-type': 0,
      'nth-child': 0, 'nth-last-child': 0, 'nth-of-type': 0, 'nth-last-of-type': 0
      // (the 3rd line is not in W3C CSS specs but is an accepted alias of 2nd line)
    },
    // originally separated in different pseudo-classes
    // we have grouped them to optimize a bit size+speed
    // all are going through the same code path (switch)
    // the assigned value represent current spec status:
    // 0 = CSS3, 1 = CSS2, 2 = maybe implemented
    Others: {
    //UIElementStates: {
    // we group them to optimize
      'enabled': 0, 'disabled': 0, 'checked': 0, 'selected': 1, 'indeterminate': 2,
    //},
    //Dynamic: {
      'active': 0, 'hover': 0, 'visited': 0, 'link': 0, 'hover': 1,
    //},
    // Target: {
      'target': 0,
    //},
    // Language: {
      'lang': 0,
    //},
    // Negation: {
      'not': 0,
    //},
    // Content: {
    // http://www.w3.org/TR/2001/CR-css3-selectors-20011113/#content-selectors
      'contains': 2
    //}
    }
  },

  // conditionals optimizers for the compiler

  // do not change this, it is searched & replaced
  ACCEPT_NODE = 'r[r.length]=c[k];continue main;',

  // fix for IE gEBTN('*') returning collection with comment nodes
  SKIP_COMMENTS = BUGGY_GEBTN ? 'if(e.nodeType!=1){continue;}' : '',

  // use the textContent or innerText property to check CSS3 :contains
  // Safari 2 has a bug with innerText and hidden content, using an
  // internal replace on the innerHTML property avoids trashing it
  CONTAINS_TEXT =
    'textContent' in root ?
    'e.textContent' :
    (function() {
      var t = context.createElement('div');
      t.innerHTML = '<p>p</p>';
      t.style.display = 'none';
      return t.innerText.length > 0 ?
        'e.innerText' :
        'this.stripTags(e.innerHTML)';
    })(),

  // to check if the base context contains offending names
  // @return nodeList (live)
  OFFENDING_NAME =
    function(name) {
      return !!base.getElementsByName(name);
    },

  // to check extensions have not yet been registered
  // @return boolean
  IS_EMPTY =
    function(object) {
      if (object && typeof object == 'object') {
        for (i in object) { return false; }
        return true;
      }
      return false;
    },

  // compile a comma separated group of selector
  // @mode boolean true for select, false for match
  // @return function (compiled)
  compileGroup =
    function(selector, source, mode) {
      var i = 0, seen = { }, parts, token;
      if ((parts = selector.match(group))) {
        // for each selector in the group
        for ( ; i < parts.length; ++i) {
          token = parts[i].replace(trim, '');
          // avoid repeating the same token
          // in comma separated group (p, p)
          if (!seen[token]) {
            seen[token] = true;
            // reset element reference after the
            // first comma if using select() mode
            if (i > 0 && mode) {
              source += 'e=c[k];';
            }
            // insert corresponding mode function
            if (mode) {
              source += compileSelector(token, ACCEPT_NODE);
            } else {
              source += compileSelector(token, 'return true;');
            }
          }
        }
      }
      if (mode) {
        // for select method
        return new Function('c,s', 'var k,e,r,n,x=0;main:for(k=0,r=[];e=c[k];k++){' + SKIP_COMMENTS + source + '}return r;');
      } else {
        // for match method
        return new Function('e,s', 'var n,x=0;' + source + 'return false;');
      }
    },

  // compile a CSS3 string selector into
  // ad-hoc javascript matching function
  // @return string (to be compiled)
  compileSelector =
    function(selector, source) {

      var i, a, b, n, k, expr, match, result, status, test, type;

      while (selector) {

        // *** Universal selector
        // * match all (empty block, do not remove)
        if ((match = selector.match(Patterns.all))) {
          // do nothing, handled in the compiler where
          // BUGGY_GEBTN return comment nodes (ex: IE)
        }
        // *** ID selector
        // #Foo Id case sensitive
        else if ((match = selector.match(Patterns.id))) {
          // document contains elements with names like "id" or "length" ?
          if (OFFENDING_NAME('id')) {
            // necessary since form elements using reserved words as
            // id/name can overwrite form properties (ex. name="id")
            // NOTE: tests available in Prototype selector test unit
            source = 'if(e.id=="' + match[1] + '"||(e.nodeName=="FORM"&&e==e.ownerDocument.getElementById("' + match[1] + '"))){' + source + '}';
          } else {
            // faster/sufficient to pass jQuery selector test unit
            source = 'if(e.id=="' + match[1] + '"){' + source + '}';
          }
        }
        // *** Type selector
        // Foo Tag (case insensitive)
        else if ((match = selector.match(Patterns.tagName))) {
          // both tagName & nodeName are Upper/Lower cased strings depending on their creation NAMESPACE (createElementNS et all)
          source = 'if(e.nodeName=="' + match[1].toUpperCase() + '"||e.nodeName=="' + match[1].toLowerCase() + '"){' + source + '}';
          //source = 'if(e.nodeName=="' + match[1].toUpperCase() + '"){' + source + '}';
        }
        // *** Class selector
        // .Foo Class (case sensitive)
        else if ((match = selector.match(Patterns.className))) {
          // W3C CSS3 specs: element whose "class" attribute has been assigned a list of whitespace-separated values
          // see section 6.4 Class selectors and notes at the bottom; explicitly non-normative in this specification.
          //source = 'if(((" "+e.className+" ").replace(/\\s+/g," ").indexOf(" ' + match[1] + ' ")>-1)){' + source + '}';
          source = 'if(e.className&&(" "+e.className+" ").indexOf(" ' + match[1] + ' ")>-1){' + source + '}';
        }
        // *** Attribute selector
        // [attr] [attr=value] [attr="value"] [attr='value'] and !=, *=, ~=, |=, ^=, $=
        // case sensitivity is treated differently depending on the document type (see map)
        else if ((match = selector.match(Patterns.attribute))) {
          // xml namespaced attribute ?
          expr = match[1].split(':');
          expr = expr.length == 2 ? expr[1] : expr[0];
          // check case treatment from insensitiveMap
          if (insensitiveMap[expr.toLowerCase()] === 1) {
            match[5] = match[5].toLowerCase();
          } else {
            expr = '';
          }
          source = 'if(' +
            (Operators[(match[2] || match[3])] || 'this.hasAttribute(e,"' + match[1] + '")').
              replace(/\%p/g, 'this.getAttribute(e,"' + match[1] + '")' +
                (expr === '' ? '' : '.toLowerCase()')).
                  replace(/\%m/g, match[5]) +
          '){' + source + '}';
          expr = '';
        }
        // *** Adjacent sibling combinator
        // E + F (F adiacent sibling of E)
        else if ((match = selector.match(Patterns.adjacent))) {
          source = 'while((e=e.previousSibling)){if(e.nodeType==1){' + source + 'break;}}';
        }
        // *** General sibling combinator
        // E ~ F (F relative sibling of E)
        else if ((match = selector.match(Patterns.relative))) {
          k++; // count nested instances
          source = 'var i%=0,y%=e,z%=this.getChildren(e.parentNode);while((e=z%[i%++])&&e!=y%){if(e.nodeType==1){'.replace(/%/g, k) + source + '}}';
          //source = 'while((e=e.previousSibling)){if(e.nodeType==1){' + source + '}}';
        }
        // *** Child combinator
        // E > F (F children of E)
        else if ((match = selector.match(Patterns.children))) {
          source = 'if(e.nodeName!="HTML"){e=e.parentNode;' + source + '}';
        }
        // *** Descendant combinator
        // E F (E ancestor of F)
        else if ((match = selector.match(Patterns.ancestor))) {
          source = 'while(e.nodeName!="HTML"){e=e.parentNode;' + source + '}';
        }
        // *** Structural pseudo-classes
        // :root, :empty,
        // :first-child, :last-child, :only-child,
        // :first-of-type, :last-of-type, :only-of-type,
        // :first-child-of-type, :last-child-of-type, :only-child-of-type,
        // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
        // (the 3rd line is not in W3C CSS specs but is an accepted alias of 2nd line)
        else if ((match = selector.match(Patterns.spseudos)) &&
          selector.match(/([-\w]+)/)[0] in CSS3PseudoClasses.Structural) {

          switch (match[1]) {
            case 'root':
              // only one root element for document, so break on match
              source = 'if(e==e.ownerDocument.documentElement){' + source + 'break;}';
              break;
            case 'empty':
              // IE does not support empty text nodes,
              // original whitespaces not kept in DOM
              source = 'if(!e.firstChild){' + source + '}';
              break;
            default:
              type = match[4] == 'of-type' ? 'OfType' : 'Element';

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
                  a = a || ((n = match[5].match(/(-?\d{1,})n/)) ? parseInt(n[1], 10) : 0);
                  b = 0 || ((n = match[5].match(/(-?\d{1,})$/)) ? parseInt(n[1], 10) : 0);
                }

                // executed after the count is computed
                expr = match[2] == 'last' ? (match[4] ?
                    's.TwinsCount[e.parentNode._cssId][e.nodeName]' :
                    's.ChildCount[e.parentNode._cssId]') + '-' + (b - 1) : b;

                test =
                  b < 0 ?
                    a <= 1 ?
                      '<=' + Math.abs(b) :
                      '%' + a + '===' + (a + b) :
                  a > Math.abs(b) ? '%' + a + '===' + b :
                  a === Math.abs(b) ? '%' + a + '===' + 0 :
                  a === 0 ? '==' + expr :
                  a < 0 ? '<=' + b :
                  a > 0 ? '>=' + b :
                    '';

                // 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
                source = 'if((this.' + match[1] + type + '(e)' + test + ')){' + source + '}';
              } else {
                // 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
                source = 'if((this.' + match[2] + type + '(e))){' + source + '}';
              }
              break;
          }

        }
        // *** Dynamic pseudo-classes
        // CSS3 :not, :contains, :enabled, :disabled, :checked, :target
        // CSS2 :active, :focus, :hover (no way yet)
        // CSS1 :link, :visited
        else if ((match = selector.match(Patterns.dpseudos)) &&
          selector.match(/([-\w]+)/)[0] in CSS3PseudoClasses.Others) {

          if (match[2]) {
            // if the pseudo-class is one with a parameter
            // remove round brackets grabbed by expression
            match[2] = match[2].replace(/^\((.*)\)$/, '$1');
          }

          switch (match[1]) {
            // CSS3 part of structural pseudo-classes
            case 'not':
              // compile nested selectors
              expr = match[2].split(',');
              for (i = 0; expr[i]; i++) {
                source = compileSelector(expr[i], source).replace(/(if|while)([^\{]+)/, '$1(!($2))');
              }
              break;
            // maybe deprecated in latest proposals
            case 'contains':
              match[2] = match[2].replace(/^["']*|['"]*$/g, '');
              source = 'if(' + CONTAINS_TEXT + '.indexOf("' + match[2] + '")>-1){' + source + '}';
              break;
            // CSS3 part of UI element states
            case 'checked':
              source = 'if(e.type&&e.checked){' + source + '}';
              break;
            case 'enabled':
              // does not return hidden input fields, even if they are enabled
              source = 'if(e.type&&!e.disabled&&e.type!="hidden"){' + source + '}';
              break;
            case 'disabled':
              source = 'if(e.type&&e.disabled){' + source + '}';
              break;
            case 'selected':
              source = 'e.parentNode.selectedIndex;if(e.selected===true||e.selected=="selected"){' + source + '}';
              break;
            // CSS3 target element
            case 'target':
              source = 'if(e.id==location.href.match(/#((?:[-_\w]|\\.)+)$/)[1]){' + source + '}';
              break;
            // CSS1 & CSS2 link
            case 'link':
              source = 'if(e.nodeName.toUpperCase()=="A"&&e.href){' + source + '}';
              break;
            case 'visited':
              source = 'if(e.nodeName.toUpperCase()=="A"&&e.visited){' + source + '}';
              break;
            // CSS1 & CSS2 UI States IE & FF3 have native support
            // these capabilities may be emulated by event managers
            case 'active':
            case 'hover':
            case 'focus':
              source = 'if(getUIState(e,"' + match[1] + '")){' + source + '}';
              break;
            default:
              break;
          }
        }
        else if (!IS_EMPTY(Selectors)) {
          // this is where external extensions are
          // invoked if expressions match selectors
          status = true;
          for (name in Selectors) {
            if ((match = selector.match(Selectors[name].Expression))) {
              result = Selectors[name].Callback(match, source);
              source = result.source;
              status = result.status;
            }
            // if an extension fails to parse the selector
            // it must return a false boolean in "status"
            if (!status) {
              // log error but continue execution, don't throw real exceptions
              // because blocking following processes maybe is not a good idea
              emit('DOMException: unknown pseudo selector "' + selector + '"');
              return source;
            }
          }
        }
        else {
          // see above, log error but continue execution
          emit('DOMException: unknown token in selector "' + selector + '"');
          return source;
        }

        // ensure "match" is not null or empty since
        // we do not throw real DOMExceptions above
        selector = match && match[match.length - 1];
      }

      return source;
    },

  // enable/disable notifications
  VERBOSE = false,

  // a way to control user notification
  emit =
    function(message) {
      if (VERBOSE) {
        if (global.console && global.console.log) {
          global.console.log(message);
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

  // get specific host properties
  // currently handle active/focus
  // @return boolean
  getUIState =
    function(element, state) {
      var host = element.ownerDocument || element;
      if (state == 'focus' && host.hasFocus) {
        return element.type && host.hasFocus() &&
          element === host.activeElement;
      }
      return ((state + 'Element') in host) &&
        element === host[state + 'Element'];
    },

  // match element with selector
  // @return boolean
  match =
    function(element, selector) {
      // make sure an element node was passed
      if (element && element.nodeType == 1) {
        if (typeof selector == 'string' && selector.length) {
          // save compiled matchers
          if (!compiledMatchers[selector]) {
            compiledMatchers[selector] = compileGroup(selector, '', false);
          }
          // result of compiled matcher
          return compiledMatchers[selector].call(this, element, snap);
        }
        else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
        }
      }
      return false;
    },

  // select elements matching selector
  // version using new Selector API
  // @return array
  select_qsa =
    function (selector, from) {
      if (typeof selector == 'string' && selector.length) {
        if (!from || from.nodeType == 9) {
          try {
            // use available Selectors API
            return toArray((from || context).querySelectorAll(selector));
          } catch(e) { }
        }
        // fall back to NWMatcher select
        return client_api.call(this, selector, from || context);
      }
      return [ ];
    },

  // select elements matching selector
  // version using cross-browser client API
  // @return array
  client_api =
    function client_api(selector, from) {

      var done, elements, last, match, part, slice, token;

      // only process valid strings
      if (validator.test(selector)) {

        // remove trailing/leading spaces
        selector = selector.replace(trim, '');

        // use the passed from context
        from || (from = context);

        // caching  enabled ?
        if (cachingEnabled) {
          // reference context ownerDocument
          base = from.ownerDocument || from;
          snap = base.snapshot;
          // valid base context storage
          if (snap && !snap.isExpired) {
            if (snap.Results[selector] &&
              snap.Roots[selector] == from) {
              return snap.Results[selector];
            }
          } else {
            setCache(true, base);
            snap = base.snapshot;
          }
        } else {
          if (position.test(selector)) {
            // need to clear storage
            snap = new Snapshot();
          }
        }

        // pre-filtering pass allow to scale proportionally with big DOM trees;
        // this block can be safely removed, it is a speed booster on big pages
        // and still maintain the mandatory "document ordered" result set

        // commas separators are treated
        // sequentially to maintain order
        if (selector.indexOf(',') < 0) {

          // ID optimization (on full selector)
          if (!elements && (part = selector.match(Optimize.ID)) &&
            (token = part[part.length - 1]) && from.getElementById) {
            elements = [from.getElementById(token.replace(/\\/g, ''))];
            if (elements[0]) {
              if (selector == '#' + token) {
                return elements;
              }
              // optimize partial existing id selections
              if (selector.length != (selector.lastIndexOf('#' + token) + token.length + 1)) {
                from = elements[0].parentNode;
                elements = null;
              }
            } else {
              return [ ];
            }
          }

          // MULTI TAG optimization (on full selector)
          if (!elements && !Optimize.descendants.test(selector) && NATIVE_GEBTN) {
            part = selector.match(/([-_\w]+)/g);
            if (part.length > 1) {
              elements = byTags(part, from);
              if (!(/[^ \w]/).test(selector)) {
                done = true;
              }
            } else {
              elements = byTag(part[0], from);
              done = true;
            }
          }

          // get right most selector token
          last = selector.match(Optimize.TOKEN);
          slice = last[last.length - 1];

          // only slice before :not rules
          slice = slice.split(':not')[0];

          // TAG optimization (partial slice when using :not)
          if (!elements && (part = slice.match(Optimize.TAG)) &&
            (token = part[part.length - 1]) && NATIVE_GEBTN) {
            elements = byTag(token, from);
            if (selector == token) {
              done = true;
            }
          }

          // CLASS optimization (partial slice when using :not)
          if (!elements && (part = slice.match(Optimize.CLASS)) &&
            (token = part[part.length - 1]) && !ascii.test(token)) {
            elements = byClass(token.replace(/\\/g, ''), from);
            if (selector == '.' + token) {
              done = true;
            }
          }

        }
        // end of prefiltering pass

        if (!done) {
          // when a context is not passed and no id, tag, class in selector
          // elements is undefined, so we collect all elements from context
          elements || (elements = toArray(byTag('*', from)));
        } else {
          if (!elements || elements.length === 0) {
            elements = [ ];
          }
          elements = elements.constructor == Array ? elements : toArray(elements);
        }

        // save compiled selectors
        if (!compiledSelectors[selector]) {
          compiledSelectors[selector] = compileGroup(selector, '', true);
        }

        if (cachingEnabled) {
          // a cached result set for the requested selector
          snap.Results[selector] =
            compiledSelectors[selector].call(this, elements, snap);
          snap.Roots[selector] = from;
          return snap.Results[selector];
        }

        // a fresh result set for the requested selector
        return compiledSelectors[selector].call(this, elements, snap);

      }
      else {
        emit('DOMException: "' + selector + '" is not a valid CSS selector.');
      }

      return [ ];
    },

  // use the new native Selector API if available,
  // if missing, use the cross-browser client api
  // @return array
  select = NATIVE_QSAPI ?
    select_qsa :
    client_api,

  // element by id
  // @return array
  byId =
    function(id, from) {
      return this.select('[id="' + id + '"]', from);
    },

  // elements by tag
  // @return nodeList (live)
  byTag =
    function(tag, from) {
      return (from || context).getElementsByTagName(tag || '*');
    },

  // elements by name
  // @return array
  byName =
    function(name, from) {
      return this.select('[name="' + name + '"]', from);
    },

  // elements by class
  // @return nodeList (native GEBCN)
  // @return array (non native GEBCN)
  byClass = !BUGGY_GEBCN ?
    function(name, from) {
      return (from || context).getElementsByClassName(name);
    } :
    function(name, from) {
      // context is handled in byTag for non native gEBCN
      var i = 0, j = 0, r = [ ], node, nodes = byTag('*', from);
      name = ' ' + name + ' ';
      while ((node = nodes[i++])) {
        if (node.className && (' ' + node.className + ' ').indexOf(name) > -1) {
          r[j++] = node;
        }
      }
      return r;
    },

  // recursively get nested tagNames
  // example: for "div" pass ["div"]
  // "ul li a" pass ["ul", "li", "a"]
  // @c array of tag names combinators
  // @f from context or default
  // @return array
  byTags =
    function(c, f) {
      var i, j, k, n, o, p,
        id, e = [f || context],
        r = [ ], s = [ ], t = [ ];
      i = 0;
      while ((n = c[i++])) {
        j= 0;
        while ((o = e[j++])) {
          k = 0;
          r = byTag(n.replace(trim, ''), o);
          while ((p = r[k++])) {
            id = (p._cssId || (p._cssId = ++cssId));
            if (t[id]) {
              // discard duplicates
              continue;
            }
            t[id] = true;
            s[s.length] = p;
          }
        }
        e = s;
        s = [ ];
        t = [ ];
      }
      return e;
    },

  // attribute value
  // @type string
  getAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(element, attribute) {
      return element.getAttribute(attribute) + "";
    } :
    function(element, attribute) {
      var node, property;
      if (attributesXml.test(attribute)) {
        // XML namespaced attributes
        return ((node = element.getAttributeNode(attribute, 1)) && node.value) + "";
      } else if (attributesUrl[attribute.toLowerCase()]) {
        // specific URI attributes (parameter 2 to fix IE bug)
        return element.getAttribute(attribute, 2) + "";
      }
      // map attributes/properties names for HTML and DOM namespaces
      property = Attributes[attribute.toLowerCase()] || attribute;
      // fall back check for dynamic values of element properties
      return (element.getAttribute(attribute) || element[property]) + "";
    },

  // attribute presence
  // @return boolean
  hasAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(element, attribute) {
      return element.hasAttribute(attribute);
    } :
    function(element, attribute) {
      // need to get at AttributeNode first on IE
      var node = element.getAttributeNode(attribute);
      // use both "specified" & "nodeValue" properties
      return !!(node && (node.specified || node.nodeValue));
    },

  // get best children collection available
  // Safari 2.0.x "children" implementation
  // differs, taken care by feature testing
  // @return nodeList (live)
  getChildren =
    function(element) {
      // childNodes is slower to loop through because it contains text nodes
      // empty text nodes could be removed at startup to compensate this a bit
      return element[NATIVE_CHILDREN] || element.childNodes;
    },

  // test element to be the only element child in its parent
  // @return boolean
  firstElement =
    function(element) {
      while ((element = element.previousSibling) && element.nodeType != 1) { }
      return !element;
    },

  // test element to be the only element child in its parent
  // @return boolean
  lastElement =
    function(element) {
      while ((element = element.nextSibling) && element.nodeType != 1) { }
      return !element;
    },

  // test element to be the only element child in its parent
  // @return boolean
  onlyElement =
    function(element) {
      return firstElement(element) && lastElement(element);
    },

  // test element to be the first element of-type in its parent
  // @return boolean
  firstOfType =
    function(element) {
      var nodeName = element.nodeName;
      while ((element = element.previousSibling) && element.nodeName != nodeName) { }
      return !element;
    },

  // test element to be the last element of-type in its parent
  // @return boolean
  lastOfType =
    function(element) {
      var nodeName = element.nodeName;
      while ((element = element.nextSibling) && element.nodeName != nodeName) { }
      return !element;
    },

  // test element to be the only element of-type in its parent
  // @return boolean
  onlyOfType =
    function(element) {
      return firstOfType(element) && lastOfType(element);
    },

  // child position by nodeType
  // @return number
  nthElement =
    function(element) {
      var i, j, node, nodes, parent, cache = snap.ChildIndex;
      if (!element._cssId || !cache[element._cssId]) {
        if ((parent = element.parentNode).nodeType == 1) {
          i = 0;
          j = 0;
          nodes = parent[NATIVE_CHILDREN];
          while ((node = nodes[i++])) {
            if (node.nodeType == 1) {
              cache[node._cssId || (node._cssId = ++cssId)] = ++j;
            }
          }
          snap.ChildCount[parent._cssId || (parent._cssId = ++cssId)] = j;
        } else {
          // does not have a parent (ex.: document)
          return 0;
        }
      }
      return cache[element._cssId];
    },

  // child position by nodeName
  // @return number
  nthOfType =
    function(element) {
      var i, j, node, nodes, pid, parent, tag, cache = snap.TwinsIndex;
      if (!element._cssId || !cache[element._cssId]) {
        if ((parent = element.parentNode).nodeType == 1) {
          i = 0;
          j = 0;
          nodes = parent[NATIVE_CHILDREN];
          tag = element.nodeName;
          while ((node = nodes[i++])) {
            // tagName ensures it is an element
            // avoids visiting the DOCTYPE node
            // and probably other comment nodes
            if (node.tagName == tag) {
              cache[node._cssId || (node._cssId = ++cssId)] = ++j;
            }
          }
          pid = (parent._cssId || (parent._cssId = ++cssId));
          snap.TwinsCount[pid] || (snap.TwinsCount[pid] = { });
          snap.TwinsCount[pid][tag] = j;
        } else {
          // does not have a parent (ex.: document)
          return 0;
        }
      }
      return cache[element._cssId];
    },

  // convert nodeList to array
  // @return array
  toArray = NATIVE_SLICE_PROTO ?
    function(list) {
      var fix, elements;
      if ((fix = list[0].ownerDocument.getElementById('length'))) {
        fix.id = '';
      }
      elements = Array.prototype.slice.call(list);
      if (fix) {
        fix.id = 'length';
      }
      return elements;
    } :
    function(list) {
      // avoid using the length property of nodeLists
      // it may have been overwritten by bad HTML code
      if (list.constructor == Array) {
        return list;
      }
      var i = 0, array = [ ];
      while ((array[i] = list[i++])) { }
      array.length--;
      return array;
    },

  // cssId expando on elements,
  // used to keep child indexes
  // during a selection session
  cssId = 1,

  // BEGIN: local context caching system

  // ****************** CACHING ******************
  // keep caching states for each context document
  // set manually by using setCache(true, context)
  cachingEnabled = NATIVE_MUTATION_EVENTS,

  // indexes/count of elements contained in rootElement
  // expired by Mutation Events on DOM tree changes
  Snapshot =
    function() {
      return {
        // validation flag, creating it already expired,
        // code validation will set it valid first time
        isExpired: false,
        // count of siblings by nodeType or nodeName
        ChildCount: [ ],
        TwinsCount: [ ],
        // ordinal position by nodeType or nodeName
        ChildIndex: [ ],
        TwinsIndex: [ ],
        // result sets and related root contexts
        Results: [ ],
        Roots: [ ]
      };
    },

  // local indexes, cleared
  // between selection calls
  snap = new Snapshot(),

  // enable/disable context caching system
  // @d optional document context (iframe, xml document)
  // script loading context will be used as default context
  setCache =
    function(enable, d) {
      d || (d = context);
      if (!!enable) {
        d.snapshot = new Snapshot();
        startMutation(d);
      } else {
        stopMutation(d);
      }
      cachingEnabled = !!enable;
    },

  // invoked by mutation events to expire cached parts
  mutationWrapper =
    function(event) {
      var d = event.target.ownerDocument || event.target;
      stopMutation(d);
      switch (event.type) {
        case 'DOMAttrModified':
          expireCache(d);
          break;
        case 'DOMNodeInserted':
          expireCache(d);
          break;
        case 'DOMNodeRemoved':
          expireCache(d);
          break;
        default:
          break;
      }
    },

  // append mutation events
  startMutation =
    function(d) {
      if (!d.isCaching) {
        // FireFox/Opera/Safari/KHTML have support for Mutation Events
        d.addEventListener('DOMAttrModified', mutationWrapper, false);
        d.addEventListener('DOMNodeInserted', mutationWrapper, false);
        d.addEventListener('DOMNodeRemoved', mutationWrapper, false);
        d.isCaching = true;
      }
    },

  // remove mutation events
  stopMutation =
    function(d) {
      if (d.isCaching) {
        d.removeEventListener('DOMAttrModified', mutationWrapper, false);
        d.removeEventListener('DOMNodeInserted', mutationWrapper, false);
        d.removeEventListener('DOMNodeRemoved', mutationWrapper, false);
        d.isCaching = false;
      }
    },

  // expire complete cache
  // can be invoked by Mutation Events or
  // programmatically by other code/scripts
  // document context is mandatory no checks
  expireCache =
    function(d) {
      if (d && d.snapshot) {
        d.snapshot.isExpired = true;
      }
    };

  // END: local context caching system

  return {

    // for testing purposes only!
    compile:
      function(selector) {
        return compileGroup(selector, '', true).toString();
      },

    // enable/disable cache
    setCache: setCache,

    // forced expire of DOM tree cache
    expireCache: expireCache,

    // element match selector, return boolean true/false
    match: match,

    // elements matching selector, starting from element
    select: select,

    // Safari 2 bug with innerText (gasp!)
    // used to strip tags from innerHTML
    // shouldn't be public, but needed
    stripTags:
      function(s) {
        return s.replace(/<\/?("[^\"]*"|'[^\']*'|[^>])+>/gi, '');
      },

    // add selector patterns for user defined callbacks
    registerSelector:
      function (name, rexp, func) {
        if (!Selectors[name]) {
          Selectors[name] = { };
          Selectors[name].Expression = rexp;
          Selectors[name].Callback = func;
        }
      },

    // add or overwrite user defined operators
    // TODO: check when overwriting standard operators
    registerOperator:
      function (symbol, resolver) {
        if (!Operators[symbol]) {
          Operators[symbol] = resolver;
        }
      },

    // retrieve element by id attr
    byId: byId,

    // retrieve elements by tag name
    byTag: byTag,

    // retrieve elements by name attr
    byName: byName,

    // retrieve elements by class name
    byClass: byClass,

    // retrieve all children elements
    getChildren: getChildren,

    // read the value of the attribute
    // as was in the original HTML code
    getAttribute: getAttribute,

    // check for the attribute presence
    // as was in the original HTML code
    hasAttribute: hasAttribute,

    // first child element any type
    firstElement: firstElement,

    // last child element any type
    lastElement: lastElement,

    // only child element any type
    onlyElement: onlyElement,

    // first child element of-type
    firstOfType: firstOfType,

    // last child element of-type
    lastOfType: lastOfType,

    // only child element of-type
    onlyOfType: onlyOfType,

    // nth child element any type
    nthElement: nthElement,

    // nth child element of-type
    nthOfType: nthOfType,

    // convert nodeList to array
    toArray: toArray

  };

}(this);
