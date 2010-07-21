/*! Scotch JavaScript unit testing library (CLI version) 0.3.1
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

	Scotch.Logger = (function(){
		var newlines = /\n/g, stripSpace = Scotch.Utility.stripSpace, print = global.print, Prototype;
		function Logger(){
			if(!(this instanceof Logger)){
				return new Logger();
			}
			print("=== Scotch JavaScript unit testing library, version 0.3.1 ===");
		}
		Prototype = Logger.prototype;
		function setup(name){
			print("Running tests: `" + name + "`...");
		}
		function start(testName){
			print("\nTest: `" + testName + "`");
		}
		function message(text){
			print("Message(s): " + stripSpace(text).replace(newlines, "; "));
		}
		function finish(status, summary){
			print("Result: " + status);
			this.message(summary);
		}
		function summary(text){
			print("\n=== " + text + " ===");
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
