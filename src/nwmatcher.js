/*
 * Copyright (C) 2007-2008 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast selector engine not using XPath
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 0.99.7
 * Created: 20070722
 * Release: 20080718
 *
 * License:
 *	http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *	http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

window.NW || (window.NW = {});

NW.Dom = function() {

	var version = '0.99.7',

	// the selecting functions
	// used to test a collection
	compiledSelectors = { },

	// the matching functions
	// used to test an element
	compiledMatchers = { },

	// selection matched elements
	cachedResults = {
		from: [ ],
		items: [ ]
	},

	// caching levels
	// DOM frequently modified (caching completely disabled)
	DYNAMIC = 0,
	// DOM may be modified but we catch it (moderate caching)
	RELAXED = 1,
	// DOM will not be modified from now on (aggressive caching)
	STATIC = 2,

	// attribute names may be passed case insensitive
	// accepts chopped attributes like "class" and "for"
	// but I don't know if this is good for every token
	camelProps =
		[
			'htmlFor', 'className', 'tabIndex', 'accessKey', 'maxLength',
			'readOnly', 'longDesc', 'frameBorder', 'isMap', 'useMap', 'noHref', 'noWrap',
			'colSpan', 'rowSpan', 'cellPadding', 'cellSpacing', 'marginWidth', 'marginHeight'
		],

	// nth pseudo selector (CSS3)
	nth_pseudo = /\:(nth)\-/,
	// child pseudo selector (CSS3)
	child_pseudo = /\:(nth|first|last|only)\-/,
	// of-type pseudo selectors (CSS3)
	oftype_pseudo = /\-(of-type)/,

	// trim leading whitespaces
	TR = /^\s+|\s+$/g,

	// precompiled Regular Expressions
	Patterns = {
		// nth child pseudos
		npseudos: /^\:(nth-)?(child|first|last|only)?-?(child)?-?(of-type)?(\((?:even|odd|[^\)]*)\))?(.*)/,
		// simple pseudos
		pseudos: /^\:([\w]+)?(\(.*\))?(?:\s+|$)(.*)/,
		// E > F
		children: /^\s*\>\s*(.*)/,
		// E + F
		adjacent: /^\s*\+\s*(.*)/,
		// E ~ F
		relative: /^\s*\~\s*(.*)/,
		// E F
		ancestor: /^(\s+)(.*)/,
		// attribute
		attribute: /^\[([\w-]+)(\~|\^|\*|\$|\!|\|)?(\=)?"?([^\"\]]+)?"?\](.*)/,
		// class
		className: /^\.([\w-]+)(.*)/,
		// id
		id: /^\#([\w-]+)(.*)/,
		// tag
		tagName: /^([\w-]+)(.*)/,
		// all
		all: /^\*(.*)/
	},

	// initial optimizations
	// by single/multi tokens
	// only for select method
	Optimizations = {
		// all with whitespaces
		// maybe the worst case
		// being "\r\n\t * \r\n"
		all: /(^\s*\*\s*)$/,
		// single class, id, tag
		className: /^\.([\w-]+)$/,
		id: /^\#([\w-]+)$/,
		tagName: /^([\w]+)$/
	},

	// convert nodeList to array (implementation from Prototype)
	toArray = 
		function(iterable) {
			var length = iterable.length, array = new Array(length);
			while (length--) array[length] = iterable[length];
			return array;
		},

	// compile a CSS3 string selector into
	// ad-hoc javascript matching function
	compileSelector =
		// selector string, function source,
		// and select (true) or match (false)
		function(selector, source, select) {

			var match, t;

			while(selector) {
				// * match all
				if ((match = selector.match(Patterns.all))) {
					// always matching
					source = 'if(e){' + source + '}';
				}
				// #Foo Id case sensitive
				else if ((match = selector.match(Patterns.id))) {
					source = 'if(e&&e.id=="' + match[1] + '"){' + source + '}';
				}
				// Foo Tag case insensitive (?)
				else if ((match = selector.match(Patterns.tagName))) {
					source = 'if(e&&e.nodeName.toLowerCase()=="' + match[1].toLowerCase() + '"){' + source + '}';
				}
				// .Foo Class case sensitive
				else if ((match = selector.match(Patterns.className))) {
					source = 'if(e&&(" "+e.className+" ").indexOf(" ' + match[1] + ' ")>-1){' + source + '}';
					//source = 'if(((" "+e.className).replace(/\\s+/g," ") + " ").indexOf(" ' + match[1] + ' ")>-1){' + source + '}';
				}
				// [attr] [attr=value] [attr="value"] and !=, *=, ~=, |=, ^=, $=
				else if ((match = selector.match(Patterns.attribute))) {
					// fix common misCased attribute names
					for (var i = 0; i < camelProps.length; ++i) {
						if (camelProps[i].toLowerCase().indexOf(match[1]) == 0) {
							match[1] = camelProps[i];
							break;
						}
					}
					source = 'if(e&&' +
						// change behavior for [class!=madeup]
						//(match[2] == '!' ? 'e.' + match[1] + '&&' : '') +
						// match attributes or property
						(match[2] && match[3] && match[4] && match[2] != '!' ?
							(match[2] == '~' ? '(" "+' : (match[2] == '|' ? '("-"+' : '')) + 'e.' + match[1] +
								(match[2] == '|' || match[2] == '~' ? '.replace(/\s+/g," ")' : '') +
							(match[2] == '~' ? '+" ")' : (match[2] == '|' ? '+"-")' : '')) +
							 	(match[2] == '!' || match[2] == '|' || match[2] == '~' ? '.indexOf("' : '.match(/') +
							(match[2] == '^' ? '^' : match[2] == '~' ? ' ' : match[2] == '|' ? '-' : '') + match[4] +
							(match[2] == '$' ? '$' : match[2] == '~' ? ' ' : match[2] == '|' ? '-' : '') +
								(match[2] == '|' || match[2] == '~' ? '")>-1' : '/)') :
							(match[3] && match[4] ? 'e.' + match[1] + (match[2] == '!' ? '!' : '=') + '="' + match[4] + '"' : 'e.' + match[1])) +
					'){' + source + '}';
				}
				// E + F (F adiacent sibling of E)
				else if ((match = selector.match(Patterns.adjacent))) {
					source = 'if(e){while((e=e.previousSibling)&&e.nodeType!=1);if(e){' + source + '}}';
				}
				// E ~ F (F relative sibling of E)
				else if ((match = selector.match(Patterns.relative))) {
					source = 'if(e){while((e=e.previousSibling))if(e.nodeType==1){' + source + ';break;}}';
				}
				// E > F (F children of E)
				else if ((match = selector.match(Patterns.children))) {
					source = 'if(e&&(e=e.parentNode)){' + source + '}';
				}
				// E F (E ancestor of F)
				else if ((match = selector.match(Patterns.ancestor))) {
					source = 'if(e){while(e.parentNode.nodeType==1){e=e.parentNode;' + source + ';break;}}';
				}
				// CSS3 :root, :empty, :enabled, :disabled, :checked, :target
				// CSS2 :active, :focus, :hover (no way yet)
				// CSS1 :link, :visited
				else if ((match = selector.match(Patterns.pseudos))) {
					switch (match[1]) {
						// CSS3 part of structural pseudo-classes
						case 'not':
							source = compileGroup(match[2].replace(/\((.*)\)/, '$1'), '' , select) + 'else{' + source + '}';
							break;
						case 'root':
							source = 'if(e&&e==(e.ownerDocument||e.document||e).documentElement){' + source + '}';
							break;
						case 'empty':
							source = 'if(e&&e.getElementsByTagName("*").length==0&&(e.childNodes.length==0||e.childNodes[0].nodeValue.replace(/\\s+/g,"").length==0)){' + source + '}';
							break;
						case 'contains':
							source = 'if(e&&(e.textContent||e.innerText||"").indexOf("' + match[2].replace(/\(|\)/g, '') + '")!=-1){' + source + '}';
							break;
						// CSS3 part of UI element states
						case 'enabled':
							source = 'if(e&&!e.disable){' + source + '}';
							break;
						case 'disabled':
							source = 'if(e&&e.disable){' + source + '}';
							break;
						case 'checked':
							source = 'if(e&&e.checked){' + source + '}';
							break;
						// CSS3 target element
						case 'target':
							source = 'if(e&&e.id==location.href.match(/#([_-\w]+)$/)[1]){' + source + '}';
							break;
						// CSS1 & CSS2 link
						case 'link':
							source = 'if(e&&e.nodeName.toUpperCase()=="A"&&e.href){' + source + '}';
							break;
						case 'visited':
							source = 'if(e&&e.visited){' + source + '}';
							break;
						// CSS1 & CSS2 user action
						case 'active':
							// IE, FF3 have native method, others may have it emulated,
							// this may be done in the event manager setting activeElement
							source = 'if(e&&d.activeElement&&e===d.activeElement){' + source + '}';
							break;
						case 'focus':
							// IE, FF3 have native method, others may have it emulated,
							// this may be done in the event manager setting focusElement
							source = 'if(e&&((e.hasFocus&&e.hasFocus())||(d.focusElement&&d.focusElement===e))){' + source + '}';
							break;
						case 'hover':
							// not implemented (TODO)
							// track mouseover/mouseout and set hoverElement to current
							break;
						default:
							break;
					}
				}
				// :first-child, :last-child, :only-child,
				// :first-child-of-type, :last-child-of-type, :only-child-of-type,
				// :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
				else if ((match = selector.match(Patterns.npseudos))) {

					var a, b;

					if (match[5]) {
						// remove the ( ) grabbed above
						match[5] = match[5].replace(/\(|\)/g, '');

						if (match[5] == 'even') a = 2, b = 0;
						else if (match[5] == 'odd') a = 2, b = 1;
						else {
							// assumes correct "an+b" format
							a = match[5].match(/^-/) ? -1 : match[5].match(/^n/) ? 1 : 0;
							a = a || ((t = match[5].match(/(-?\d{1,})n/)) ? parseInt(t[1], 10) : 0);
							b = b || ((t = match[5].match(/(-?\d{1,})$/)) ? parseInt(t[1], 10) : 0);
						}
						// handle 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
						t = match[5] == 'even' ||
							match[5] == 'odd' ||
							a > b ?
								b >= 0 ?
									'%' + a + '===' + b :
									'===' + (a + b) :
								a < 0 ?
									'<=' + b :
									'===' + b;
						// boolean indicating select (true) or match (false) method
						if (select) {
							// add function for select method (select=true)
							// requires prebuilt arrays get[Childs|Twins]
							source = 'if(e&&s.' + (match[4] ? 'Twin' : 'Child') + 'Indexes[NW.Dom.getIndex(c,e)+1]' + t + '){' + source + '}';
						} else {
							// add function for "match" method (select=false)
							// this will not be in a loop, this is faster
							// for "match" but slower for "select" and it
							// also doesn't require prebuilt node arrays
							source = 'if((n=e)){' +
								'u=1' + (match[4] ? ',t=e.nodeName;' : ';') +
								'while((n=n.' + (match[2] == 'last' ? 'next' : 'previous') + 'Sibling)){' +
									'if(n.node' + (match[4] ? 'Name==t' : 'Type==1') + '){++u;}' +
								'}' +
								'if(u' + t + '){' + source + '}' +
							'}';
						}
					} else {
						// handle 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
						if (select) {
							// add function for select method (select=true)
							t = match[4] ? 'Twin' : 'Child';
							source = 'n=NW.Dom.getIndex(c,e)+1;' +
								'if(e&&' +
								(match[2] == 'first' ?
									's.' + t + 'Indexes[n]===1' :
									match[2] == 'only' ?
										's.' + t + 'Lengths[s.' + t + 'Parents[n]]' + (match[4] ? '[e.nodeName]' : '') + '===1' :
											match[2] == 'last' ?
											's.' + t + 'Indexes[n]===s.' + t + 'Lengths[s.' + t + 'Parents[n]]' + (match[4] ? '[e.nodeName]' : '') :
											'') +
								'){' + source + '}';

						} else {
							// add function for match method (select=false)
							source = 'if(n=e){' +
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
				}
				else {
					throw new Error('NW.Dom.compileSelector: syntax error, unknown selector rule "' + selector + '"');
				}
				selector = match[match.length - 1];
			}
			return source;
		},

	// compile a comma separated group of selector
	compileGroup=
		// selector string for the compiled function,
		// boolean for select (true) or match (false)
		function(selector, select){
			var i = 0, source = '', k, d = {}, n = '',
				parts = selector.split(',');
			// for each selector
			for ( ; i < parts.length; ++i) {
				k = parts[i].replace(TR, '');
				// avoid repeating the same functions
				if (!d[k]) {
					d[k] = k;
					// insert corresponding mode function
					if (select) {
						source = compileSelector(k, '{r[r.length]=c[k];', select) + '}' + source;
					} else {
						source = compileSelector(k, '{return true;', select) + '}' + source.replace('break;', '');
					}
				}
			}

			if (selector.match(nth_pseudo)) {
				n = ',j,u,t,a';
			} else if (selector.match(child_pseudo)) {
				n = ',t';
			}

			if (select) {
				// for select method
				return new Function('c,s', 'var k=-1,e,r=[],n' + n + ';while((e=c[++k])){' + source + '}return r;');
			} else {
				// for match method
				return new Function('e', 'var n,u;' + source.replace('break;', '') + 'return false;');
			}
		},

	IE = typeof document.fileSize != 'undefined',

	// snapshot of elements contained in rootElement
	// also contains maps to make nth lookups faster
	// updated by each select/match if DOM changes
	Snapshot = {
		Elements: [],
		ChildIndexes: [],
		ChildLengths: [],
		ChildParents: [],
		TwinIndexes: [],
		TwinLengths: [],
		TwinParents: [],
		isValid: false,
		HtmlSrc: ''
	},

	// DYNAMIC | RELAXED | STATIC
	cachingLevel = RELAXED,

	// get element index in a node array
	getIndex =
		function(array, element) {
			// ie only (too slow in opera)
			if (IE) {
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
			var	k = 0, e, p, s, x,
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

	// check if cached snapshot has changed
	getCache =
		function(f) {
			var document, snapshot = Snapshot, elements = snapshot.Elements;
			if (elements.length) {
				document = elements[0].ownerDocument || elements[0].document;
				// DOM is say not to change but
				// will do a simple check anyway
				if (cachingLevel == STATIC &&
					(elements.length == snapshot.ChildIndexes.length ||
					 elements.length == snapshot.TwinIndexes.length)) {
					snapshot.isValid = true;
				// DOM is say not to change, but may be
				} else if (cachingLevel==RELAXED &&
					snapshot.HtmlSrc == document.body.innerHTML) {
					snapshot.isValid = true;
				} else {
					if (cachingLevel == RELAXED) {
						snapshot.HtmlSrc = document.body.innerHTML;
					}
					cachedResults = {
						from: [],
						items: []
					};
					snapshot.isValid = false;
				}
			} else {
				cachedResults = {
					from: [],
					items: []
				};
				snapshot.isValid = false;
			}
			Snapshot = snapshot;
		};

	// ********** begin public methods **********
	return {

		// set required caching level
		// also invalidate current map
		setCache:
			function(level) {
				cachingLevel = (level % 3);
				this.expireCache();
			},

		// expose the private method
		expireCache:
			function() {
				Snapshot.isValid = false;
			},

		getIndex: getIndex,

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
				} else {
					throw new Error('NW.Dom.match: "' + selector + '" is not a valid CSS selector.');
				}
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
						return [from.getElementById(match[1])];
					}
					// Foo Tag (single tag selector)
					else if ((match = selector.match(Optimizations.tagName))) {
						return toArray(from.getElementsByTagName(match[1]));
					}
					// END REDUCE/OPTIMIZE

					// collection of all nodes
					elements = toArray(from.getElementsByTagName('*'));

					// save current collection
					Snapshot.Elements = elements;

					if (selector.match(child_pseudo)) {
						// check requested caching level
						if (cachingLevel == DYNAMIC) {
							Snapshot.isValid = false;
						} else {
							getCache(elements);
						}
						// check if storage synchronized
						if (Snapshot.isValid === false) {
							if (selector.match(oftype_pseudo)) {
								// special of-type pseudo selectors
								getTwins(from, elements);
							} else {
								// normal nth/child pseudo selectors
								getChilds(from, elements);
							}
						}
					}

					// cache compiled selectors
					if (!compiledSelectors[selector]) {
						compiledSelectors[selector] = compileGroup(selector, true);
					}

					if (cachingLevel == DYNAMIC) {
						// caching of results disabled
						return compiledSelectors[selector](elements, Snapshot);
					} else {
						// caching of results enabled
						if (!(cachedResults.items[selector] && cachedResults.from[selector] == from)) {
							cachedResults.items[selector] = compiledSelectors[selector](elements, Snapshot);
							cachedResults.from[selector] = from;
						}
						return cachedResults.items[selector];
					}

				} else {
					throw new Error('NW.Dom.select: "' + selector + '" is not a valid CSS selector.');
				}

				return [];
			}

	};
	// *********** end public methods ***********
}();
