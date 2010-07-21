(function(){
	NW.Dom.configure({
		/* Disable complex selectors nested in :not() pseudo-classes to comply with specs
		See <http://www.w3.org/TR/2001/CR-css3-selectors-20011113/#negation> */
		SIMPLENOT: true,
		VERBOSITY: true,
		USE_QSAPI: false
	});
	var getClass = Object.prototype.toString, STRING_CLASS = "[object String]",
	//NOTE: This is NOT the same as Prototype's `$$` function...
	$$ = NW.Dom.select,
	match = NW.Dom.match,
	/* Enabling this option runs benchmarks on the following selectors:
	*
	*  E[foo^="bar"]
	*  E[foo$="bar"]
	*  E[foo*="bar"]
	*  E:first-child
	*  E:last-child
	*  E:only-child
	*  E > F
	*  E + F
	*  E ~ F
	*
	------------------------*/
	RUN_BENCHMARKS = false;
	//Prototype's `$` function
	function $(element){
		if(arguments.length > 1){
			var index = 0, length = arguments.length, elements = [];
			for(; index < length; index++){
				elements[elements.length] = $(arguments[index]);
			}
			return elements;
		}
		if(getClass.call(element) === STRING_CLASS){
			element = document.getElementById(element);
		}
		return element;
	}
	Scotch.Runner("NWMatcher", {
		"Basic Selectors": {
			"*": function(){
				//Universal selector
				//Collect all nodes, excluding comments (IE)
				var allElements = document.getElementsByTagName("*"), allNodes = [],
				index = 0, length = allElements.length, node;
				for(; index < length; index++){
					if((node = allElements[index]).tagName !== "!"){
						allNodes[allNodes.length] = node;
					}
				}
				this.assert($$("*")).identicalToArray(allNodes, "Comment nodes should be ignored.");
			},
			"E": function(){
				//Type selector
				//No need to call `slice` on the nodeList...`equalToArray/List` uses vanilla looping and doesn't compare type
				this.assert($$("li")).equalToList(document.getElementsByTagName("li"));
				this.assert($$("strong")[0]).identicalTo($("strong"));
				this.assert($$("nonexistent")).identicalToArray([]);
			},
			"#id": function(){
				//ID selector
				this.assert($$("#fixtures")[0]).identicalTo($("fixtures"));
				this.assert($$("nonexistent")).identicalToArray([]);
				this.assert($$("#troubleForm")[0]).identicalTo($("troubleForm"));
			},
			".class": function(){
				//Class selector
				this.assert($$(".first")).identicalToArray($('p', 'link_1', 'item_1'));
				this.assert($$(".second")).identicalToArray([]);
			},
			"E#id": function(){
				this.assert($$("strong#strong")[0]).identicalTo($("strong"));
				this.assert($$("p#strong")).identicalToArray([]);
			},
			"E.class": function(){
				var secondLink = $("link_2");
				this.assert($$('a.internal')).identicalToArray($('link_1', 'link_2'));
				this.assert($$('a.internal.highlight')[0]).identicalTo(secondLink);
				this.assert($$('a.highlight.internal')[0]).identicalTo(secondLink);
				this.assert($$('a.highlight.internal.nonexistent')).identicalToArray([]);
			},
			"#id.class": function(){
				var secondLink = $('link_2');
				this.assert($$('#link_2.internal')[0]).identicalTo(secondLink);
				this.assert($$('.internal#link_2')[0]).identicalTo(secondLink);
				this.assert($$('#link_2.internal.highlight')[0]).identicalTo(secondLink);
				this.assert($$('#link_2.internal.nonexistent')).identicalToArray([]);
			},
			"E#id.class": function(){
				var secondLink = $('link_2');
				this.assert($$('a#link_2.internal')[0]).identicalTo(secondLink);
				this.assert($$('a.internal#link_2')[0]).identicalTo(secondLink);
				this.assert($$('li#item_1.first')[0]).identicalTo($("item_1"));
				this.assert($$('li#item_1.nonexistent')).identicalToArray([]);
				this.assert($$('li#item_1.first.nonexistent')).identicalToArray([]);
			}
		},
		"Attribute Selectors": {
			"[foo]": function(){
				this.assert($$('[href]', document.body)).identicalToArray($$('a[href]', document.body));
				this.assert($$('[class~=internal]')).identicalToArray($$('a[class~="internal"]'));
				this.assert($$('[id]')).identicalToArray($$('*[id]'));
				this.assert($$('[type=radio]')).identicalToArray($('checked_radio', 'unchecked_radio'));
				this.assert($$('[type=checkbox]')).identicalToArray($$('*[type=checkbox]'));
				this.assert($$('[title]')).identicalToArray($('with_title', 'commaParent'));
				this.assert($$('#troubleForm [type=radio]')).identicalToArray($$('#troubleForm *[type=radio]'));
				this.assert($$('#troubleForm [type]')).identicalToArray($$('#troubleForm *[type]'));
			},
			"E[foo]": function(){
				this.assert($$('h1[class]')).identicalToArray($$('#fixtures h1'), "h1[class]");
				this.assert($$('h1[CLASS]')).identicalToArray($$('#fixtures h1'), "h1[CLASS]");
				this.assert($$('li#item_3[class]')[0]).identicalTo($('item_3'), "li#item_3[class]");
				this.assert($$('#troubleForm2 input[name="brackets[5][]"]')).identicalToArray($('chk_1', 'chk_2'));
				//Brackets in attribute value
				this.assert($$('#troubleForm2 input[name="brackets[5][]"]:checked')[0]).identicalTo($('chk_1'));
				//Space in attribute value
				this.assert($$('cite[title="hello world!"]')[0]).identicalTo($('with_title'));
				//Namespaced attributes
				this.assert($$('[xml:lang]')).identicalToArray([document.documentElement, $("item_3")]);
				this.assert($$('*[xml:lang]')).identicalToArray([document.documentElement, $("item_3")]);
			},
			'E[foo="bar"]': function(){
				this.assert($$('a[href="#"]')).identicalToArray($('link_1', 'link_2', 'link_3'));
				this.assert($$('a[href=#]')).identicalToArray($('link_1', 'link_2', 'link_3'));
				this.assert($$('#troubleForm2 input[name="brackets[5][]"][value=2]')[0]).identicalTo($('chk_2'));
			},
			'E[foo~="bar"]': function(){
				this.assert($$('a[class~="internal"]')).identicalToArray($('link_1', 'link_2'), "a[class~=\"internal\"]");
				this.assert($$('a[class~=internal]')).identicalToArray($('link_1', 'link_2'), "a[class~=internal]");
				this.assert($$('a[class~=external][href="#"]')[0]).identicalTo($('link_3'), 'a[class~=external][href="#"]');
			},
			'E[foo|="en"]': function(){
				this.assert($$('*[xml:lang|="es"]')[0]).identicalTo($('item_3'));
				this.assert($$('*[xml:lang|="ES"]')[0]).identicalTo($('item_3'));
			},
			'E[foo^="bar"]': function(){
				this.assert($$('div[class^=bro]')).identicalToArray($('father', 'uncle'), 'matching beginning of string');
				this.assert($$('#level1 *[id^="level2_"]')).identicalToArray($('level2_1', 'level2_2', 'level2_3'));
				this.assert($$('#level1 *[id^=level2_]')).identicalToArray($('level2_1', 'level2_2', 'level2_3'));
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 *[id^=level2_]');
						}, 1000, '[^=]');
					});
				}
			},
			'E[foo$="bar"]': function(){
				this.assert($$('div[class$=men]')).identicalToArray($('father', 'uncle'), 'matching end of string');
				this.assert($$('#level1 *[id$="_1"]')).identicalToArray($('level2_1', 'level3_1'));
				this.assert($$('#level1 *[id$=_1]')).identicalToArray($('level2_1', 'level3_1'));
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 *[id$=_1]');
						}, 1000, '[$=]');
					});
				}
			},
			'E[foo*="bar"]': function(){
				this.assert($$('div[class*="ers m"]')).identicalToArray($('father', 'uncle'), 'matching substring');
				this.assert($$('#level1 *[id*="2"]')).identicalToArray($('level2_1', 'level3_2', 'level2_2', 'level2_3'));
				this.assert($$('#level1 *[id*=2]')).identicalToArray($('level2_1', 'level3_2', 'level2_2', 'level2_3'));
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 *[id*=_2]');
						}, 1000, '[*=]');
					});
				}
			}
		},
		"Structural pseudo-classes": {
			"E:first-child": function(){
				this.assert($$('#level1>*:first-child')[0]).identicalTo($('level2_1'));
				this.assert($$('#level1 *:first-child')).identicalToArray($('level2_1', 'level3_1', 'level_only_child'));
				this.assert($$('#level1>div:first-child')).identicalToArray([]);
				this.assert($$('#level1 span:first-child')).identicalToArray($('level2_1', 'level3_1'));
				this.assert($$('#level1:first-child')).identicalToArray([]);
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 *:first-child');
						}, 1000, ':first-child');
					});
				}
			},
			"E:last-child": function(){
				this.assert($$('#level1>*:last-child')[0]).identicalTo($('level2_3'));
				this.assert($$('#level1 *:last-child')).identicalToArray($('level3_2', 'level_only_child', 'level2_3'));
				this.assert($$('#level1>div:last-child')[0]).identicalTo($('level2_3'));
				this.assert($$('#level1 div:last-child')[0]).identicalTo($('level2_3'));
				this.assert($$('#level1>span:last-child')).identicalToArray([]);
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 *:last-child');
						}, 1000, ':last-child');
					});
				}
			},
			"E:nth-child(n)": function(){
				this.assert($$('#p *:nth-child(3)')[0]).identicalTo($('link_2'));
				this.assert($$('#p a:nth-child(3)')[0]).identicalTo($('link_2'), 'nth-child');
				this.assert($$('#list > li:nth-child(n+2)')).identicalToArray($('item_2', 'item_3'));
				this.assert($$('#list > li:nth-child(-n+2)')).identicalToArray($('item_1', 'item_2'));
			},
			"E:nth-of-type(n)": function(){
				this.assert($$('#p a:nth-of-type(2)')[0]).identicalTo($('link_2'), 'nth-of-type');
				this.assert($$('#p a:nth-of-type(1)')[0]).identicalTo($('link_1'), 'nth-of-type');
			},
			"E:nth-last-of-type(n)": function(){
				this.assert($$('#p a:nth-last-of-type(1)')[0]).identicalTo($('link_2'), 'nth-last-of-type');
			},
			"E:first-of-type": function(){
				this.assert($$('#p a:first-of-type')[0]).identicalTo($('link_1'), 'first-of-type');
			},
			"E:last-of-type": function(){
				this.assert($$('#p a:last-of-type')[0]).identicalTo($('link_2'), 'last-of-type');
			},
			"E:only-child": function(){
				this.assert($$('#level1 *:only-child')[0]).identicalTo($('level_only_child'));
				//Shouldn't return anything
				this.assert($$('#level1>*:only-child')).identicalToArray([]);
				this.assert($$('#level1:only-child')).identicalToArray([]);
				this.assert($$('#level2_2 :only-child:not(:last-child)')).identicalToArray([]);
				this.assert($$('#level2_2 :only-child:not(:first-child)')).identicalToArray([]);
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 *:only-child');
						}, 1000, ':only-child');
					});
				}
			},
			"E:empty": function(){
				if(document.createEvent){
					$('level3_1').innerHTML = "";
					this.assert($$('#level1 *:empty')).identicalToArray($('level3_1', 'level3_2', 'level2_3'), '#level1 *:empty');
					this.assert($$('#level_only_child:empty')).identicalToArray([], 'newlines count as content!');
				}else{
					$('level3_1').innerHTML = "";
					this.assert($$('#level3_1:empty')[0]).identicalTo($('level3_1'), 'IE forced empty content!');
					this.info("IE forced empty content!");
				}
				//Shouldn't return anything
				this.assert($$('span:empty > *')).identicalToArray([]);
			}
		},
		"E:not(s)": function(){
			this.assert($$('a:not([href="#"])')).identicalToArray([]);
			this.assert($$('div.brothers:not(.brothers)')).identicalToArray([]);
			this.assert($$('a[class~=external]:not([href="#"])')).identicalToArray([], 'a[class~=external][href!="#"]');
			this.assert($$('#p a:not(:first-of-type)')[0]).identicalTo($('link_2'), 'first-of-type');
			this.assert($$('#p a:not(:last-of-type)')[0]).identicalTo($('link_1'), 'last-of-type');
			this.assert($$('#p a:not(:nth-of-type(1))')[0]).identicalTo($('link_2'), 'nth-of-type');
			this.assert($$('#p a:not(:nth-last-of-type(1))')[0]).identicalTo($('link_1'), 'nth-last-of-type');
			this.assert($$('#p a:not([rel~=nofollow])')[0]).identicalTo($('link_2'), 'attribute 1');
			this.assert($$('#p a:not([rel^=external])')[0]).identicalTo($('link_2'), 'attribute 2');
			this.assert($$('#p a:not([rel$=nofollow])')[0]).identicalTo($('link_2'), 'attribute 3');
			this.assert($$('#p a:not([rel$="nofollow"]) > em')[0]).identicalTo($('em'), 'attribute 4');
			this.assert($$('#list li:not(#item_1):not(#item_3)')[0]).identicalTo($('item_2'), 'adjacent :not clauses');
			this.assert($$('#grandfather > div:not(#uncle) #son')[0]).identicalTo($('son'));
			this.assert($$('#p a:not([rel$="nofollow"]) em')[0]).identicalTo($('em'), 'attribute 4 + all descendants');
			this.assert($$('#p a:not([rel$="nofollow"])>em')[0]).identicalTo($('em'), 'attribute 4 (without whitespace)');
		},
		"UI element states pseudo-classes": {
			"E:disabled": function(){
				this.assert($$('#troubleForm > p > *:disabled')[0]).identicalTo($('disabled_text_field'));
			},
			"E:checked": function(){
				this.assert($$('#troubleForm *:checked')).identicalToArray($('checked_box', 'checked_radio'));
			}
		},
		"Combinators": {
			"E F": function(){
				//Descendant
				this.assert($$('#fixtures a *')).identicalToArray($('em2', 'em', 'span'));
				this.assert($$('div#fixtures p')[0]).identicalTo($("p"));
			},
			"E > F": function(){
				//Child
				this.assert($$('p.first > a')).identicalToArray($('link_1', 'link_2'));
				this.assert($$('div#grandfather > div')).identicalToArray($('father', 'uncle'));
				this.assert($$('#level1>span')).identicalToArray($('level2_1', 'level2_2'));
				this.assert($$('#level1 > span')).identicalToArray($('level2_1', 'level2_2'));
				this.assert($$('#level2_1 > *')).identicalToArray($('level3_1', 'level3_2'));
				this.assert($$('div > #nonexistent')).identicalToArray([]);
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level1 > span');
						}, 1000);
					});
				}
			},
			"E + F": function(){
				//Adjacent sibling
				this.assert($$('div.brothers + div.brothers')[0]).identicalTo($("uncle"));
				this.assert($$('div.brothers + div')[0]).identicalTo($('uncle'));
				this.assert($$('#level2_1+span')[0]).identicalTo($('level2_2'));
				this.assert($$('#level2_1 + span')[0]).identicalTo($('level2_2'));
				this.assert($$('#level2_1 + *')[0]).identicalTo($('level2_2'));
				this.assert($$('#level2_2 + span')).identicalToArray([]);
				this.assert($$('#level3_1 + span')[0]).identicalTo($('level3_2'));
				this.assert($$('#level3_1 + *')[0]).identicalTo($('level3_2'));
				this.assert($$('#level3_2 + *')).identicalToArray([]);
				this.assert($$('#level3_1 + em')).identicalToArray([]);
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level3_1 + span');
						}, 1000);
					});
				}
			},
			"E ~ F": function(){
				//General sibling
				this.assert($$('h1 ~ ul')[0]).identicalTo($('list'));
				this.assert($$('#level2_2 ~ span')).identicalToArray([]);
				this.assert($$('#level3_2 ~ *')).identicalToArray([]);
				this.assert($$('#level3_1 ~ em')).identicalToArray([]);
				this.assert($$('div ~ #level3_2')).identicalToArray([]);
				this.assert($$('div ~ #level2_3')).identicalToArray([]);
				this.assert($$('#level2_1 ~ span')[0]).identicalTo($('level2_2'));
				this.assert($$('#level2_1 ~ *')).identicalToArray($('level2_2', 'level2_3'));
				this.assert($$('#level3_1 ~ #level3_2')[0]).identicalTo($('level3_2'));
				this.assert($$('span ~ #level3_2')[0]).identicalTo($('level3_2'));
				if(RUN_BENCHMARKS){
					this.wait(500, function(){
						this.benchmark(function(){
							$$('#level2_1 ~ span');
						}, 1000);
					});
				}
			}
		},
		"NW.Dom.match": function(){
			var element = $('dupL1');
			//Assertions
			this.assert(match(element, 'span')).True();
			this.assert(match(element, "span#dupL1")).True();
			this.assert(match(element, "div > span")).True("child combinator");
			this.assert(match(element, "#dupContainer span")).True("descendant combinator");
			this.assert(match(element, "#dupL1")).True("ID only");
			this.assert(match(element, "span.span_foo")).True("class name 1");
			this.assert(match(element, "span.span_bar")).True("class name 2");
			this.assert(match(element, "span:first-child")).True("first-child pseudoclass");
			//Refutations
			this.refute(match(element, "span.span_wtf")).True("bogus class name");
			this.refute(match(element, "#dupL2")).True("different ID");
			this.refute(match(element, "div")).True("different tag name");
			this.refute(match(element, "span span")).True("different ancestry");
			this.refute(match(element, "span > span")).True("different parent");
			this.refute(match(element, "span:nth-child(5)")).True("different pseudoclass");
			//Misc.
			this.refute(match($('link_2'), 'a[rel^=external]')).True();
			this.assert(match($('link_1'), 'a[rel^=external]')).True();
			this.assert(match($('link_1'), 'a[rel^="external"]')).True();
			this.assert(match($('link_1'), "a[rel^='external']")).True();
		},
		"Equivalent Selectors": function(){
			this.assert($$('div.brothers')).identicalToArray($$('div[class~=brothers]'));
			this.assert($$('div.brothers')).identicalToArray($$('div[class~=brothers].brothers'));
			this.assert($$('div:not(.brothers)')).identicalToArray($$('div:not([class~=brothers])'));
			this.assert($$('li ~ li')).identicalToArray($$('li:not(:first-child)'));
			this.assert($$('ul > li')).identicalToArray($$('ul > li:nth-child(n)'));
			this.assert($$('ul > li:nth-child(even)')).identicalToArray($$('ul > li:nth-child(2n)'));
			this.assert($$('ul > li:nth-child(odd)')).identicalToArray($$('ul > li:nth-child(2n+1)'));
			this.assert($$('ul > li:first-child')).identicalToArray($$('ul > li:nth-child(1)'));
			this.assert($$('ul > li:last-child')).identicalToArray($$('ul > li:nth-last-child(1)'));
			/* Opera 10 does not accept values > 128 as a parameter to :nth-child
			See <http://operawiki.info/ArtificialLimits> */
			this.assert($$('ul > li:nth-child(n-128)')).identicalToArray($$('ul > li'));
			this.assert($$('ul>li')).identicalToArray($$('ul > li'));
			this.assert($$('#p a:not([rel$="nofollow"])>em')).identicalToArray($$('#p a:not([rel$="nofollow"]) > em'));
		},
		"Multiple Selectors": function(){
			//The next two assertions should return document-ordered lists of matching elements --Diego Perini
			this.assert($$('#list, .first,*[xml:lang="es-us"] , #troubleForm')).identicalToArray($('p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'));
			this.assert($$('#list, .first, *[xml:lang="es-us"], #troubleForm')).identicalToArray($('p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'));
			this.assert($$('form[title*="commas,"], input[value="#commaOne,#commaTwo"]')).identicalToArray($('commaParent', 'commaChild'));
			this.assert($$('form[title*="commas,"], input[value="#commaOne,#commaTwo"]')).identicalToArray($('commaParent', 'commaChild'));
		}
	});
}());