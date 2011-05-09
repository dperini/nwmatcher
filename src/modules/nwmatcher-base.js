/*
 * Copyright (C) 2007-2011 Diego Perini & NWBOX
 * All rights reserved.
 *
 * nwmatcher.js - A fast CSS selector engine and matcher
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.2.4beta
 * Created: 20070722
 * Release: 20110509
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

(function(global) {

  var version = 'nwmatcher-1.2.4',

  Dom = typeof exports == 'object' ? exports :
    (global.NW || (global.NW = { })) &&
    (global.NW.Dom || (global.NW.Dom = { })),

  slice = [ ].slice,
  doc = global.document,
  root = doc.documentElement,

  isSingleMatch,
  isSingleSelect,

  lastSlice,
  lastContext,
  lastPosition,

  lastMatcher,
  lastSelector,

  lastPartsMatch,
  lastPartsSelect,

  prefixes = '[.:#]?',
  operators = '([~*^$|!]?={1})',
  whitespace = '[\\x20\\t\\n\\r\\f]*',
  combinators = '[\\x20]|[>+~][^>+~]',
  pseudoparms = '[-+]?\\d*n?[-+]?\\d*',
  quotedvalue = '"[^"]*"' + "|'[^']*'",
  skipgroup = '\\[.*\\]|\\(.*\\)|\\{.*\\}',

  encoding = '(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)',
  identifier = '(?:-?[_a-zA-Z]{1}[-\\w]*|[^\\x00-\\xa0]+|\\\\.+)+',

  attrcheck = '(' + quotedvalue + '|' + identifier + ')',
  attributes = whitespace + '(' + encoding + '+:?' + encoding + '+)' +
    whitespace + '(?:' + operators + whitespace + attrcheck + ')?' + whitespace,
  attrmatcher = attributes.replace(attrcheck, '([\\x22\\x27]*)((?:\\\\?.)*?)\\3'),

  pseudoclass = '((?:' +
    pseudoparms + '|' + quotedvalue + '|' +
    prefixes + '|' + encoding + '+|' +
    '\\[' + attributes + '\\]|' +
    '\\(.+\\)|' + whitespace + '|' +
    ',)+)',

  extensions = '.+',

  reValidator = RegExp(
    '(?=[\\x20\\t\\n\\r\\f]*[^>+~(){}<>])' +
    '(' +
    '\\*' +
    '|' + combinators +
    '|(?:' + prefixes + identifier + ')' +
    '|\\[' + attributes + '\\]' +
    '|\\(' + pseudoclass + '\\)' +
    '|\\{' + extensions + '\\}' +
    '|,.' +
    ')+', 'g'),

  reTrimSpaces = RegExp('^' +
    whitespace + '|' + whitespace + '$', 'g'),

  reSplitGroup = RegExp('(' +
    '[^,\\\\\\[\\]]+' +
    '|\\[[^[\\]]*\\]|\\[.*\\]' +
    '|\\([^()]+\\)|\\(.*\\)' +
    '|\\{[^{}]+\\}|\\{.*\\}' +
    '|\\\\.' +
    ')+', 'g'),

  reSplitToken = RegExp('(' +
    '\\[' + attributes + '\\]|' +
    '\\(' + pseudoclass + '\\)|' +
    '[^\x20>+~]|\\\\.)+', 'g'),

  reWhiteSpace = /[\x20\t\n\r\f]+/g,

  reOptimizeSelector = RegExp(identifier + '|^$'),

  Selectors = { },

  Operators = {
     '=': "n=='%m'",
    '^=': "n.indexOf('%m')==0",
    '*=': "n.indexOf('%m')>-1",
    '|=': "(n+'-').indexOf('%m-')==0",
    '~=': "(' '+n+' ').indexOf(' %m ')>-1",
    '$=': "n.substr(n.length-'%m'.length)=='%m'"
  },

  Optimize = {
    ID: RegExp('^\\*?#(' + encoding + '+)|' + skipgroup),
    TAG: RegExp(/*REM*/'^(' + encoding + '+)|' + skipgroup),
    CLASS: RegExp('^\\*?\\.(' + encoding + '+$)|' + skipgroup)
  },

  Patterns = {
    universal: /^\*(.*)/,
    id: RegExp('^#(' + encoding + '+)(.*)'),
    tagName: RegExp('^(' + encoding + '+)(.*)'),
    className: RegExp('^\\.(' + encoding + '+)(.*)'),
    attribute: RegExp('^\\[' + attrmatcher + '\\](.*)'),
    children: /^[\x20\t\n\r\f]*\>[\x20\t\n\r\f]*(.*)/,
    adjacent: /^[\x20\t\n\r\f]*\+[\x20\t\n\r\f]*(.*)/,
    relative: /^[\x20\t\n\r\f]*\~[\x20\t\n\r\f]*(.*)/,
    ancestor: /^[\x20\t\n\r\f]+(.*)/
  },

  QUIRKS_MODE,
  XML_DOCUMENT,
  TO_UPPER_CASE,

  SHORTCUTS = true,

  GEBTN = 'getElementsByTagName' in doc,
  GEBCN = 'getElementsByClassName' in doc,

  REFLECTED = { value: 1, checked: 1, selected: 1 },

  IE_LT_9 = typeof doc.addEventListener != 'function',
  ACCEPT_NODE = 'f&&f(c[k]);r[r.length]=c[k];continue main;',
  REJECT_NODE = IE_LT_9 ? 'if(e.nodeName<"A")continue;' : '',

  switchContext =
    function(from, force) {
      var oldDoc = doc;
      lastContext = from;
      doc = from.ownerDocument || from;
      if (force || oldDoc != doc) {
        root = doc.documentElement;
        XML_DOCUMENT = doc.createElement('DiV').nodeName == 'DiV';
        TO_UPPER_CASE = XML_DOCUMENT ? '.toUpperCase()' : '';
        QUIRKS_MODE = XML_DOCUMENT ||
          typeof doc.compatMode == 'string' && doc.compatMode.indexOf('CSS') < 0;
      }
    },

  byIdRaw =
    function(id, elements) {
      var i = 0, element = null;
      while ((element = elements[i])) {
        if (element.getAttribute('id') == id) {
          break;
        }
        ++i;
      }
      return element;
    },

  _byId = !('fileSize' in doc) ?
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

  byId =
    function(id, from) {
      switchContext(from || (from = doc));
      return _byId(id, from);
    },

  compile =
    function(selector, source, mode) {
      if (typeof selector == 'string') {
        source += (mode ? 'e=c[k];' : 'e=k;') +
          compileSelector(selector, mode ? ACCEPT_NODE : 'f&&f(k);return true;');
      } else {
        var i = -1, seen = { }, token;
        while ((token = selector[++i])) {
          token = token.replace(reTrimSpaces, '');
          if (!seen[token] && (seen[token] = true)) {
            source += (i > 0 ? (mode ? 'e=c[k];' : 'e=k;') : '') +
              compileSelector(token, mode ? ACCEPT_NODE : 'f&&f(k);return true;');
          }
        }
      }
      if (mode)
        return Function('c,s,r,d,h,g,f',
          'var N,n,x=0,k=-1,e;main:while((e=c[++k])){' + source + '}return r;');
      else
        return Function('e,s,r,d,h,g,f',
          'var N,n,x=0,k=e;' + source + 'return false;');
    },

  compileSelector =
    function(selector, source) {
      var k = 0, expr, match, result, status, test, type;
      while (selector) {
        k++;
        if ((match = selector.match(Patterns.universal))) {
          void 0;
        }
        else if ((match = selector.match(Patterns.id))) {
          source = 'if(' + (XML_DOCUMENT ?
            'e.getAttribute("id")' :
            '(e.submit?e.getAttribute("id"):e.id)') +
            '=="' + match[1] + '"' +
            '){' + source + '}';
        }
        else if ((match = selector.match(Patterns.tagName))) {
          source = 'if(e.nodeName' + (XML_DOCUMENT ?
            '=="' + match[1] + '"' : TO_UPPER_CASE +
            '=="' + match[1].toUpperCase() + '"') +
            '){' + source + '}';
        }
        else if ((match = selector.match(Patterns.className))) {
          source = 'if((n=' + (XML_DOCUMENT ?
            'e.getAttribute("class")' : 'e.className') +
            ')&&n.length&&(" "+' + (QUIRKS_MODE ? 'n.toLowerCase()' : 'n') +
            '.replace(' + reWhiteSpace + '," ")+" ").indexOf(" ' +
            (QUIRKS_MODE ? match[1].toLowerCase() : match[1]) + ' ")>-1' +
            '){' + source + '}';
        }
        else if ((match = selector.match(Patterns.attribute))) {
          if (match[2] && !Operators[match[2]]) {
            emit('Unsupported operator in attribute selectors "' + selector + '"');
            return '';
          }
          if (match[2] && match[4] && (type = Operators[match[2]])) {
            match[4] = match[4].replace(/\\([0-9a-f]{2,2})/, '\\x$1');
            expr = 'n=(e.getAttribute("' + match[1] + '")+"").toLowerCase();';
            type = type.replace(/\%m/g, match[4].toLowerCase());
          } else if (match[2] == '!=' || match[2] == '=') {
            expr = 'n=e.getAttribute("' + match[1] + '");';
            type = 'n' + match[2] + '="' + match[4] + '"';
          } else if (!match[2]) {
            if (REFLECTED[match[1].toLowerCase()]) {
              test = 'default' +
                match[1].charAt(0).toUpperCase() +
                match[1].slice(1).toLowerCase();
              expr = 'n=e["' + test + '"];';
              type = 'n';
            } else {
              expr = 'n=e.getAttributeNode("' + match[1] + '");';
              type = 'n&&n.specified';
            }
          } else {
            expr = '';
            type = 'false';
          }
          source = expr + 'if(' + type + '){' + source + '}';
        }
        else if ((match = selector.match(Patterns.adjacent))) {
          source = 'var N' + k + '=e;while(e&&(e=e.previousSibling)){if(e.nodeName>"@"){' + source + 'break;}}e=N' + k + ';';
        }
        else if ((match = selector.match(Patterns.relative))) {
          source = 'var N' + k + '=e;e=e.parentNode.firstChild;while(e&&e!=N' + k + '){if(e.nodeName>"@"){' + source + '}e=e.nextSibling;}e=N' + k + ';';
        }
        else if ((match = selector.match(Patterns.children))) {
          source = 'var N' + k + '=e;if(e&&e!==h&&e!==g&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }
        else if ((match = selector.match(Patterns.ancestor))) {
          source = 'var N' + k + '=e;while(e&&e!==h&&e!==g&&(e=e.parentNode)){' + source + '}e=N' + k + ';';
        }
        else {
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
          if (!status) {
            emit('Unknown pseudo-class selector "' + selector + '"');
            return '';
          }
          if (!expr) {
            emit('Unknown token in selector "' + selector + '"');
            return '';
          }
        }
        if (!match) {
          emit('Invalid syntax in selector "' + selector + '"');
          return '';
        }
        selector = match && match[match.length - 1];
      }
      return source;
    },

  emit =
    function(message) {
      if (typeof global.DOMException !== 'undefined') {
        var err = Error();
        err.message = 'SYNTAX_ERR: (Selectors) ' + message;
        err.code = 12;
        throw err;
      } else {
        throw Error(12, 'SYNTAX_ERR: (Selectors) ' + message);
      }
    },

  match =
    function(element, selector, from, callback) {

      var parts;

      if (!(element && element.nodeName > '@')) {
        emit('Invalid element argument');
        return false;
      } else if (!selector || typeof selector != 'string') {
        emit('Invalid selector argument');
        return false;
      } else if (lastContext != from) {
        switchContext(from || (from = element.ownerDocument));
      }

      selector = selector.replace(reTrimSpaces, '');

      SHORTCUTS && (selector = NW.Dom.shortcuts(selector, element, from));

      if (lastMatcher != selector) {
        if ((parts = selector.match(reValidator)) && parts[0] == selector) {
          isSingleMatch = (parts = selector.match(reSplitGroup)).length < 2;
          lastMatcher = selector;
          lastPartsMatch = parts;
        } else {
          emit('The string "' + selector + '", is not a valid CSS selector');
          return false;
        }
      } else parts = lastPartsMatch;

      if (MatchResolvers[selector]) {
        return MatchResolvers[selector](element, Snapshot, [ ], doc, root, from, callback);
      }

      return (MatchResolvers[selector] =
        compile(isSingleMatch ? selector : parts, '', false))(element, Snapshot, [ ], doc, root, from, callback);
    },

  select =
    function(selector, from, callback) {

      var i, changed, element, elements, parts, token;

      if (arguments.length === 0) {
        emit('Missing required selector parameters');
        return [ ];
      } else if (selector === '') {
        emit('Empty selector string');
        return [ ];
      } else if (typeof selector != 'string') {
        return [ ];
      } else if (lastContext != from) {
        switchContext(from || (from = doc));
      }

      selector = selector.replace(reTrimSpaces, '');

      SHORTCUTS && (selector = NW.Dom.shortcuts(selector, from));

      if ((changed = lastSelector != selector)) {
        if ((parts = selector.match(reValidator)) && parts[0] == selector) {
          isSingleSelect = (parts = selector.match(reSplitGroup)).length < 2;
          lastSelector = selector;
          lastPartsSelect = parts;
        } else {
          emit('The string "' + selector + '", is not a valid CSS selector');
          return [ ];
        }
      } else parts = lastPartsSelect;

      if (from.nodeType == 11) {

        elements = from.childNodes;

      } else if (isSingleSelect) {

        if (changed) {
          parts = selector.match(reSplitToken);
          token = parts[parts.length - 1];
          lastSlice = token.split(':not')[0];
          lastPosition = selector.length - token.length;
        }

        if ((parts = lastSlice.match(Optimize.ID)) && (token = parts[1])) {
          if ((element = _byId(token, from))) {
            if (match(element, selector)) {
              callback && callback(element);
              return [ element ];
            }
          }
          return [ ];
        }

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

        if (!XML_DOCUMENT && GEBTN && (parts = lastSlice.match(Optimize.TAG)) && (token = parts[1])) {
          if ((elements = from.getElementsByTagName(token)).length === 0) return [ ];
          selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace(token, '*');
        }

        else if (!XML_DOCUMENT && GEBCN && (parts = lastSlice.match(Optimize.CLASS)) && (token = parts[1])) {
          if ((elements = from.getElementsByClassName(token.replace(/\\/g, ''))).length === 0) return [ ];
            selector = selector.slice(0, lastPosition) + selector.slice(lastPosition).replace('.' + token,
              reOptimizeSelector.test(selector.charAt(selector.indexOf(token) - 1)) ? '' : '*');
        }
      }

      if (!elements) {
        if (IE_LT_9) {
          elements = /^(?:applet|object)$/i.test(from.nodeName) ?
            from.childNodes : from.getElementsByTagName('*');
          REJECT_NODE = 'if(e.nodeName<"A")continue;';
        } else {
          elements = from.getElementsByTagName('*');
        }
      }

      if (SelectResolvers[selector]) {
        return SelectResolvers[selector](elements, Snapshot, [ ], doc, root, from, callback);
      }

      return (SelectResolvers[selector] =
        compile(isSingleSelect ? selector : parts, REJECT_NODE, true))(elements, Snapshot, [ ], doc, root, from, callback);
    },

  SelectResolvers = { },
  MatchResolvers = { },

  Snapshot = {
    byId: _byId,
    match: match,
    select: select
  };

  Tokens = {
    prefixes: prefixes,
    encoding: encoding,
    operators: operators,
    whitespace: whitespace,
    identifier: identifier,
    attributes: attributes,
    combinators: combinators,
    pseudoclass: pseudoclass,
    pseudoparms: pseudoparms,
    quotedvalue: quotedvalue
  };

  Dom.emit = emit;

  Dom.byId = byId;
  Dom.match = match;
  Dom.select = select;
  Dom.compile = compile;

  Dom.Snapshot = Snapshot;
  Dom.Operators = Operators;
  Dom.Selectors = Selectors;
  Dom.Tokens = Tokens;

  Dom.caching = function(x) { return x; };
  Dom.shortcuts = function(x) { return x; };

  Dom.registerOperator =
    function(symbol, resolver) {
      Operators[symbol] || (Operators[symbol] = resolver);
    };

  Dom.registerSelector =
    function(name, rexp, func) {
      Selectors[name] || (Selectors[name] = {
        Expression: rexp,
        Callback: func
      });
    };

  switchContext(doc, true);

})(this);
