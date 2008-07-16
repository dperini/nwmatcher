/*
 * Copyright (C) 2007-2008 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast selector engine not using XPath
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 0.99.7
 * Created: 20070722
 * Release: 20080712
 *
 * License:
 *	http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *	http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

window.NW=window.NW||{};

NW.Dom=function(){

	// version string
	var version='0.99.7',

	// the selecting functions
	// used to test a collection
	compiledSelectors={},

	// the matching functions
	// used to test an element
	compiledMatchers={},

	// selection matched elements
	cachedResults={
		from:[],
		items:[]
	},

	// caching levels
	// DOM frequently modified (caching comlpetely disabled)
	DYNAMIC=0,
	// DOM may be modified but we catch it (moderate caching)
	RELAXED=1,
	// DOM will not be modified from now on (aggressive caching)
	STATIC=2,

	// attribute names may be passed case insensitive
	// accepts chopped attributes like "class" and "for"
	// but I don't know if this is good for every token
	camelProps=[
		'htmlFor','className','tabIndex','accessKey','maxLength',
		'readOnly','longDesc','frameBorder','isMap','useMap','noHref','noWrap',
		'colSpan','rowSpan','cellPadding','cellSpacing','marginWidth','marginHeight'
	],

	// nth pseudo selector (CSS3)
	nth_pseudo=/\:(nth)\-/,
	// child pseudo selector (CSS3)
	child_pseudo=/\:(nth|first|last|only)\-/,
	// of-type pseudo selectors (CSS3)
	oftype_pseudo=/\-(of-type)/,

	// trim leading whitespaces
	TR=/^\s+|\s+$/g,

	// precompiled Regular Expressions
	E={
		// nth child pseudos
		npseudos:/^\:(nth-)?(child|first|last|only)?-?(child)?-?(of-type)?(\((?:even|odd|[^\)]*)\))?(.*)/,
		// simple pseudos
		spseudos:/^\:([\w]+)?(\(.*\))?(?:\s+|$)(.*)/,
		// E > F
		children:/^\s*\>\s*(.*)/,
		// E + F
		adjacent:/^\s*\+\s*(.*)/,
		// E ~ F
		relative:/^\s*\~\s*(.*)/,
		// E F
		ancestor:/^(\s+)(.*)/,
		// attribute
		A:/^\[([\w-]+)(\~|\^|\*|\$|\!|\|)?(\=)?"?([^\"\]]+)?"?\](.*)/,
		// class
		C:/^\.([\w-]+)(.*)/,
		// id
		I:/^\#([\w-]+)(.*)/,
		// tag
		T:/^([\w-]+)(.*)/,
		// all
		X:/^\*(.*)/
	},

	// initial optimizations
	// by single/multi tokens
	// only for select method
	O={
		// all with whitespaces
		// maybe the worst case
		// being "\r\n\t * \r\n"
		'X':/(^\s*\*\s*)$/,
		// single class, id, tag
		'C':/^\.([\w-]+)$/,
		'I':/^\#([\w-]+)$/,
		'T':/^([\w]+)$/,
		// starts with a tag name
		'N':/^([\w]+)(\#|\.|\[)?/
	},

	// convert nodeList to array
	toArray=
		function(a){
			var i=-1,n,r=[];
			while((n=a[++i])){
				r[r.length]=n;
			}
			return r;
		},

	// compile a selector
	compileSelector=
		function(s,j,q){
			var a,b,i,m,t;
			while(s){
				// * match all
				if((m=s.match(E.X))){
					// always matching
					j='if(e){'+j+'}';
				}
				// #Foo Id case sensitive
				else if((m=s.match(E.I))){
					j='if(e&&e.id=="'+m[1]+'"){'+j+'}';
				}
				// Foo Tag case insensitive (?)
				else if((m=s.match(E.T))){
					j='if(e&&e.nodeName.toLowerCase()=="'+m[1].toLowerCase()+'"){'+j+'}';
				}
				// .Foo Class case sensitive
				else if((m=s.match(E.C))){
					j='if(e&&(" "+e.className+" ").indexOf(" '+m[1]+' ")>-1){'+j+'}';
					//j='if(((" "+e.className).replace(/\\s+/g," ")+" ").indexOf(" '+m[1]+' ")>-1){'+j+'}';
				}
				// [attr] [attr=value] [attr="value"] and !=, *=, ~=, |=, ^=, $=
				else if((m=s.match(E.A))){
					// fix common misCased attribute names
					for(i=0;i<camelProps.length;++i){
						if(camelProps[i].toLowerCase().indexOf(m[1])===0){
							m[1]=camelProps[i];
							break;
						}
					}
					j='if(e&&'+
						// change behavior for [class!=madeup]
						//(m[2]=='!'?'e.'+m[1]+'&&':'')+
						// match attributes or property
						(m[2]&&m[3]&&m[4]&&m[2]!='!'?
							(m[2]=='~'?'(" "+':(m[2]=='|'?'("-"+':''))+'e.'+m[1]+
								(m[2]=='|'||m[2]=='~'?'.replace(/\s+/g," ")':'')+
							(m[2]=='~'?'+" ")':(m[2]=='|'?'+"-")':''))+
							 	(m[2]=='!'||m[2]=='|'||m[2]=='~'?'.indexOf("':'.match(/')+
							(m[2]=='^'?'^':m[2]=='~'?' ':m[2]=='|'?'-':'')+m[4]+
							(m[2]=='$'?'$':m[2]=='~'?' ':m[2]=='|'?'-':'')+
								(m[2]=='|'||m[2]=='~'?'")>-1':'/)'):
							(m[3]&&m[4]?'e.'+m[1]+(m[2]=='!'?'!':'=')+'="'+m[4]+'"':'e.'+m[1]))+
					'){'+j+'}';
				}
				// E + F (F adiacent sibling of E)
				else if((m=s.match(E.adjacent))){
					j='if(e){while((e=e.previousSibling)&&e.nodeType!=1);if(e){'+j+'}}';
				}
				// E ~ F (F relative sibling of E)
				else if((m=s.match(E.relative))){
					j='if(e){while((e=e.previousSibling))if(e.nodeType==1){'+j+';break;}}';
				}
				// E > F (F children of E)
				else if((m=s.match(E.children))){
					j='if(e&&(e=e.parentNode)){'+j+'}';
				}
				// E F (E ancestor of F)
				else if((m=s.match(E.ancestor))){
					j='if(e){while((e=e.parentNode)){'+j+';break;}}';
				}
				// CSS3 :root, :empty, :enabled, :disabled, :checked, :target
				// CSS2 :active, :focus, :hover (no way yet)
				// CSS1 :link, :visited
				else if((m=s.match(E.spseudos))){
					switch(m[1]){
						// CSS3 part of structural pseudo-classes
						case 'not':
							j=compileGroup(m[2].replace(/\((.*)\)/,'$1'),'',q)+'else{'+j+'}';
							break;
						case 'root':
							j='if(e&&e==(e.ownerDocument||e.document||e).documentElement){'+j+'}';
							break;
						case 'empty':
							j='if(e&&e.getElementsByTagName("*").length===0&&(e.childNodes.length===0||e.childNodes[0].nodeValue.replace(/\\s+/g,"").length===0)){'+j+'}';
							break;
						case 'contains':
							j='if(e&&(e.textContent||e.innerText||"").indexOf("'+m[2].replace(/\(|\)/g,'')+'")!=-1){'+j+'}';
							break;
						// CSS3 part of UI element states
						case 'enabled':
							j='if(e&&!e.disable){'+j+'}';
							break;
						case 'disabled':
							j='if(e&&e.disable){'+j+'}';
							break;
						case 'checked':
							j='if(e&&e.checked){'+j+'}';
							break;
						// CSS3 target element
						case 'target':
							j='if(e&&e.id==location.href.match(/#([_-\w]+)$/)[1]){'+j+'}';
							break;
						// CSS1 & CSS2 link
						case 'link':
							j='if(e&&e.nodeName.toUpperCase()=="A"&&e.href){'+j+'}';
							break;
						case 'visited':
							j='if(e&&e.visited){'+j+'}';
							break;
						// CSS1 & CSS2 user action
						case 'active':
							// IE, FF3 have native method, others may have it emulated,
							// this may be done in the event manager setting activeElement
							j='if(e&&d.activeElement&&e===d.activeElement){'+j+'}';
							break;
						case 'focus':
							// IE, FF3 have native method, others may have it emulated,
							// this may be done in the event manager setting focusElement
							j='if(e&&((e.hasFocus&&e.hasFocus())||(d.focusElement&&d.focusElement===e))){'+j+'}';
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
				else if((m=s.match(E.npseudos))){
					if(m[5]){
						// remove the ( ) grabbed above
						m[5]=m[5].replace(/\(|\)/g,'');
						if(m[5]=='even'){a=2;b=0;}
						else if(m[5]=='odd'){a=2;b=1;}
						else{
							// assumes correct "an+b" format
							a=m[5].match(/^-/)?-1:m[5].match(/^n/)?1:0;
							a=a||((t=m[5].match(/(-?\d{1,})n/))?parseInt(t[1],10):0);
							b=b||((t=m[5].match(/(-?\d{1,})$/))?parseInt(t[1],10):0);
						}
						// handle 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
						t=(m[5]=='even'||m[5]=='odd'||a>b?b>=0?'%'+a+'==='+b:'==='+(a+b):a<0?'<='+b:'==='+b);
						// boolean indicating select (true) or match (false) method
						if(q){
							// add function for select method (q=true)
							// requires prebuilt arrays get[Childs|Twins]
							j='if(e&&s.'+(m[4]?'Twin':'Child')+'Indexes[NW.Dom.getIndex(c,e)+1]'+t+'){'+j+'}';
						}else{
							// add function for "match" method (q=false)
							// this will not be in a loop, this is faster
							// for "match" but slower for "select" and it
							// also doesn't require prebuilt node arrays
							j='if((n=e)){'+
								'u=1'+(m[4]?',t=e.nodeName;':';')+
								'while((n=n.'+(m[2]=='last'?'next':'previous')+'Sibling)){'+
									'if(n.node'+(m[4]?'Name==t':'Type==1')+'){++u;}'+
								'}'+
								'if(u'+t+'){'+j+'}'+
							'}';

						}
					}else{
						// handle 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
						if(q){
							// add function for select method (q=true)
							t=(m[4]?'Twin':'Child');
							j='n=NW.Dom.getIndex(c,e)+1;'+
								'if(e&&'+
								(m[2]=='first'?
									's.'+t+'Indexes[n]===1':
									m[2]=='only'?
										's.'+t+'Lengths[s.'+t+'Parents[n]]'+(m[4]?'[e.nodeName]':'')+'===1':
										m[2]=='last'?
											's.'+t+'Indexes[n]===s.'+t+'Lengths[s.'+t+'Parents[n]]'+(m[4]?'[e.nodeName]':''):'')+
							'){'+j+'}';
						}else{
							// add function for match method (q=false)
							j='if(n=e){'+
								(m[4]?'t=e.nodeName;':'')+
								'while((n=n.'+(m[2]=='first'?'previous':'next')+'Sibling)&&'+
									'n.node'+(m[4]?'Name!=t':'Type!=1')+');'+
								'if(!n&&(n=e)){'+
									(m[2]=='first'||m[2]=='last'?
										'{'+j+'}':
										'while((n=n.'+(m[2]=='first'?'next':'previous')+'Sibling)&&'+
												'n.node'+(m[4]?'Name!=t':'Type!=1')+');'+
										'if(!n){'+j+'}')+
								'}'+
							'}';
						}
					}
				}
				else{
					throw new Error('NW.Dom.compileSelector: syntax error, unknown selector rule "'+s+'"');
				}
				s=m[m.length-1];
			}
			return j;
		},

	// compile a comma separated group of selector
	compileGroup=
		// @s css selector to match (string)
		// @q query method to be used (boolean)
		function(s,q){
			var i=0,j='',k,d={},n='',p=s.split(',');
			// for each selector
			for(;i<p.length;++i){
				k=p[i].replace(TR,'');
				// avoid repeating the same functions
				if(!d[k]){
					d[k]=k;
					// insert corresponding mode function
					if(q){
						j=compileSelector(k,'{r[r.length]=c[k];',q)+'}'+j;
					}else{
						j=compileSelector(k,'{return true;',q)+'}'+j.replace('break;','');
					}
				}
			}

			if(s.match(nth_pseudo)){
				n=',j,u,t,a';
			}else if(s.match(child_pseudo)){
				n=',t';
			}

			if(q){
				// for select method
				return new Function('c,s','var k=-1,e,r=[],n'+n+';while((e=c[++k])){'+j+'}return r;');
			}else{
				// for match method
				return new Function('e','var n,u;'+j.replace('break;','')+'return false;');
			}
		},

	IE=typeof document.fileSize!='undefined',

	// snapshot of elements contained in rootElement
	// also contains maps to make nth lookups faster
	// updated by each select/match if DOM changes
	Snapshot={
		Elements:[],
		ChildIndexes:[],
		ChildLengths:[],
		ChildParents:[],
		TwinIndexes:[],
		TwinLengths:[],
		TwinParents:[],
		isValid:false,
		HtmlSrc:''
	},

	// DYNAMIC | RELAXED | STATIC
	cachingLevel=RELAXED,

	// get element index in a node array
	getIndex=
		function(a,e,i){
			// ie only (too slow in opera)
			if(IE){
				getIndex=function(a,e){
					return e.sourceIndex||-1;
				};
			// gecko, webkit have native array indexOf
			}else if(a.indexOf){
				getIndex=function(a,e){
					return a.indexOf(e);
				};
			// other browsers will use this replacement
			}else{
				getIndex=function(a,e,i){
					i=a.length;
					while(--i>=0){
						if(e==a[i]){
							break;
						}
					}
					return i;
				};
			}
			// we overwrite the function first time
			// to avoid browser sniffing in loops
			return getIndex(a,e);
		},

	// build a twin index map
	// indexes by child position
	// (f)rom (t)ag
	getTwins=
		function(f,c){
			var k=0,e,r,p,s,x,
				h=[f],b=[0],i=[0],l=[0];
			while((e=c[k++])){
				h[k]=e;
				l[k]=0;
				p=e.parentNode;
				r=e.nodeName;
				if(s!=p){
					x=getIndex(h,s=p);
				}
				b[k]=x;
				l[x]=l[x]||{};
				l[x][r]=l[x][r]||0;
				i[k]=++l[x][r];
			}
			Snapshot.TwinParents=b;
			Snapshot.TwinIndexes=i;
			Snapshot.TwinLengths=l;
		},

	// build a child index map
	// indexes by tag position
	// (f)rom (t)ag
	getChilds=
		function(f,c){
			var	k=0,e,p,s,x,
				h=[f],b=[0],i=[0],l=[0];
			while((e=c[k++])){
				h[k]=e;
				l[k]=0;
				p=e.parentNode;
				if(s!=p){
					x=getIndex(h,s=p);
				}
				b[k]=x;
				i[k]=++l[x];
			}
			Snapshot.ChildParents=b;
			Snapshot.ChildIndexes=i;
			Snapshot.ChildLengths=l;
		},

	// check if cached snapshot has changed
	getCache=
		function(f){
			var d,s=Snapshot,c=s.Elements;
			if(c.length>0){
				d=c[0].ownerDocument||c[0].document;
				// DOM is say not to change but
				// will do a simple check anyway
				if(cachingLevel==STATIC&&
					(c.length==s.ChildIndexes.length||
					 c.length==s.TwinIndexes.length)){
					s.isValid=true;
				// DOM is say not to change, but may be
				}else if(cachingLevel==RELAXED&&
					s.HtmlSrc==d.body.innerHTML){
					s.isValid=true;
				}else{
					if(cachingLevel==RELAXED){
						s.HtmlSrc=d.body.innerHTML;
					}
					cachedResults={
						from:[],
						items:[]
					};
					s.isValid=false;
				}
			}else{
				cachedResults={
					from:[],
					items:[]
				};
				s.isValid=false;
			}
			Snapshot=s;
		};

	// ********** begin public methods **********
	return {

		// set required caching level
		// also invalidate current map
		setCache:
			function(l){
				cachingLevel=(l%3);
				this.expireCache();
			},

		// expose the private method
		expireCache:
			function(){
				Snapshot.isValid=false;
			},

		getIndex:getIndex,

		// (e)lement match (s)elector return boolean true/false
		match:
			function(e,s){
				// make sure an element node was passed
				if(!(e&&e.nodeType&&e.nodeType==1)){
					return false;
				}
				if(typeof s=='string'&&s.length>0){
					// cache compiled matchers
					if(!compiledMatchers[s]){
						compiledMatchers[s]=compileGroup(s,false);
					}
					// result of compiled matcher
					return compiledMatchers[s](e);
				}else{
					throw new Error('NW.Dom.match: "'+s+'" is not a valid CSS selector.');
				}
				return false;
			},

		// elements matching (s)elector optionally starting (f)rom node
		select:
			function(s,f){
				var i=-1,c=[],m,n,r=[];
				if(!(f&&f.nodeType&&(f.nodeType==1||f.nodeType==9))){
					f=document;
				}
				if(typeof s=='string'&&s.length>0){

					// BEGIN REDUCE/OPTIMIZE
					// * (all elements selector)
					if((m=s.match(O.X))){
						// fix IE comments as element
						r=f.getElementsByTagName('*');
						while((n=r[++i])){
							if(n.nodeType==1){
								c[c.length]=n;
							}
						}
						return c;
					}
					// #Foo Id (single id selector)
					else if((m=s.match(O.I))){
						return [f.getElementById(m[1])];
					}
					// Foo Tag (single tag selector)
					else if((m=s.match(O.T))){
						return toArray(f.getElementsByTagName(m[1]));
					}
					// END REDUCE/OPTIMIZE

					// collection of all nodes
					c=toArray(f.getElementsByTagName('*'));

					// save current collection
					Snapshot.Elements=c;

					if(s.match(child_pseudo)){
						// check requested caching level
						if(cachingLevel==DYNAMIC){
							Snapshot.isValid=false;
						}else{
							getCache(c);
						}
						// check if storage synchronized
						if(Snapshot.isValid===false){
							if(s.match(oftype_pseudo)){
								// special of-type pseudo selectors
								getTwins(f,c);
							}else{
								// normal nth/child pseudo selectors
								getChilds(f,c);
							}
						}
					}
					// cache compiled selectors
					if(!compiledSelectors[s]){
						compiledSelectors[s]=compileGroup(s,true);
					}

					if(cachingLevel==DYNAMIC){
						// caching of results disabled
						return compiledSelectors[s](c,Snapshot);
					}else{
						// caching of results enabled
						if(!(cachedResults.items[s]&&cachedResults.from[s]==f)){
							cachedResults.items[s]=compiledSelectors[s](c,Snapshot);
							cachedResults.from[s]=f;
						}
						return cachedResults.items[s];
					}
				}
				else{
					throw new Error('NW.Dom.select: "'+s+'" is not a valid CSS selector.');
				}
				return [];
			}

	};
	// *********** end public methods ***********
}();
