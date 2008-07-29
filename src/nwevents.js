/*
 * Copyright (C) 2005-2008 Diego Perini
 * All rights reserved.
 *
 * nwevents.js - Javascript Event Manager
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.09
 * Created: 20051016
 * Release: 20080718
 *
 * License:
 *  http://javascript.nwbox.com/NWEvents/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWEvents/nwevents.js
 */

window.NW || (window.NW = {});

NW.Event = function() {

  var version = '1.09',

  // event collections
  Handlers = {},
  Delegates = {},
  Listeners = {},

  // event phases constants
  CAPTURING_PHASE = 1,
  AT_TARGET = 2,
  BUBBLING_PHASE = 3,

  // for simple delegation
  Patterns = {
    'all': /^[\.\-\#\w]+$/,
    'tagName': /^([^#\.]+)/,
    'id': /#([^\.]+)/,
    'className': /\.([^#]+)/
  },

  // synthetic propagation status
  forcedPropagation = false,

  // fix IE event properties to
  // best fit with w3c standards
  fixEvent =
    function(object, event, capture) {
      // needed for DOM0 events
      event || (event = getContext(object).event);
      // bound element (listening the event)
      event.currentTarget = object;
      // fired element (triggering the event)
      event.target = event.srcElement || object;
      // add preventDefault and stopPropagation methods
      event.preventDefault = preventDefault;
      event.stopPropagation = stopPropagation;
      // bound and fired element are the same AT-TARGET
      event.eventPhase = capture && (event.target == object) ? CAPTURING_PHASE :
                 (event.target == object ? AT_TARGET : BUBBLING_PHASE);
      // related element (routing of the event)
      event.relatedTarget =
        event[(event.target == event.fromElement ? 'to' : 'from') + 'Element'];
      // set time event was fixed
      event.timeStamp=+new Date();
      return event;
    },

  // prevent default action
  preventDefault =
    function() {
      this.returnValue = false;
    },

  // stop event propagation
  stopPropagation =
    function() {
      this.cancelBubble = true;
    },

  // get context for element
  getContext =
    function(object) {
      return (object.ownerDocument || object.document || object).parentWindow || window;
    },

  // check collection for registered event,
  // match object, type, handler and capture
  isRegistered =
    function(array, object, type, handler, capture) {
      var i, l, found = false;
      if (array && array.objects) {
        for (i = 0, l = array.objects.length; l > i; i++) {
          if (array.objects[i] === object &&
            array.funcs[i] === handler &&
            array.parms[i] === capture) {
            found = i;
            break;
          }
        }
      }
      return found;
    },

  // handle listeners chain for event type
  handleListeners =
    function(event) {
      var i, l, objects, funcs, parms,
        result = true, type = event.type;
      if (forcedPropagation) {
        if (/focus|blur|change|reset|submit/i.test(event.type) && !event.propagated) {
          if (event.preventDefault) {
            event.preventDefault();
          } else {
            event.returnValue = false;
          }
          return false;
        }
      }
      if (Listeners[type] && Listeners[type].objects) {
        // make a copy of the Listeners[type] array
        // since it can be modified run time by the
        // events deleting themselves or adding new
        objects = Listeners[type].objects.slice();
        funcs = Listeners[type].funcs.slice();
        parms = Listeners[type].parms.slice();
        // process chain in fifo order
        for (i = 0, l = objects.length; l > i; i++) {
          // element match current target ? 
          if (objects[i] === this
            && (
              (event.eventPhase == BUBBLING_PHASE && parms[i] === false) ||
              (event.eventPhase == CAPTURING_PHASE && parms[i] === true) ||
              !event.propagated
            )
          ) {
            // a synthetic event during the AT_TARGET phase ?
            if (event.propagated && event.target === this) {
              event.eventPhase = AT_TARGET;
            }
            // execute registered function in element scope
            if (funcs[i].call(this, event) === false) {
              result = false;
              break;
            }
          }
        }
      }
      return result;
    },

  // handle delegates chain for event type
  handleDelegates =
    function(event) {
      var i, l, objects, funcs, parms,
        result = true, type = event.type;
      if (Delegates[type] && Delegates[type].objects) {
        // make a copy of the Delegates[type] array
        // since it can be modified run time by the
        // events deleting themselves or adding new
        objects = Delegates[type].objects.slice();
        funcs = Delegates[type].funcs.slice();
        parms = Delegates[type].parms.slice();
        // process chain in fifo order
        for (i = 0, l = objects.length; l > i; i++) {
          // if event.target matches one of the registered objects and
          // if "this" element matches one of the registered delegates
          if (match(event.target, objects[i]) && parms[i] === this) {
            // execute registered function in element scope
            if (funcs[i].call(event.target, event) === false) {
              result = false;
              break;
            }
          }
        }
      }
      return result;
    },

  // use a simple selector match or a full
  // CSS3 selector engine if it is available
  match =
    function(element, selector) {
      var j, matched = false,
        match, id, tagName, className,
        name = element.nodeName.toLowerCase(),
        klass = (' ' + element.className + ' ').replace(/\s\s+/g,' ');
      if (typeof selector == 'string') {
        if (NW.Dom && typeof NW.Dom.match == 'function') {
          // use nwmatcher as full CSS3 selector engine
          if (NW.Dom.match(element, selector)) {
            matched = true;
          }
        } else if (selector.match(Patterns.all)) {
          // use a simple selector match (id, tag, class)
          match = selector.match(Patterns.tagName);
          tagName = match ? match[1] : '*';
          match = selector.match(Patterns.id);
          id = match ? match[1] : null;
          match = selector.match(Patterns.className);
          className = match ? match[1] : null;
          if ((!id || id == element.target.id) &&
            (!tagName || tagName == '*' || tagName == name) &&
            (!className || klass.indexOf(' ' + className + ' ') >- 1)) {
            matched = true;
          }
        }
      } else {
        // a selector matcher object
        if (selector != element) {
          // match on property/values
          for (j in selector) {
            if (j == 'nodeName') {
              // handle upper/lower case tagName
              if (selector[j].toLowerCase() == name) {
                matched = true;
                break;
              }
            } else if (j == 'className') {
              // handle special className matching
              if (klass.indexOf(' ' + selector[j] + ' ') >- 1) {
                matched = true;
                break;
              }
            } else {
              // handle matching other properties
              if (selector[j] === element[j]) {
                matched = true;
                break;
              }
            }
          }
        }
      }
      // return boolean true/false
      return matched;
    },

  // create a synthetic event
  synthesize =
    function(object, type, capture) {
      return {
        type: type,
        target: object,
        bubbles: true,
        cancelable: true,
        currentTarget: object,
        relatedTarget: null,
        timeStamp: +new Date(),
        preventDefault: preventDefault,
        stopPropagation: stopPropagation,
        eventPhase: capture ? CAPTURING_PHASE : BUBBLING_PHASE
      };
    },

  // propagate events traversing the
  // ancestors path in both directions
  propagate =
    function(event) {
      var result = true, target = event.target || event.srcElement;
      target['__' + event.type] = false;
      // remove the trampoline event
      NW.Event.removeHandler(target, event.type, arguments.callee, false);
      // execute the capturing phase
      result && (result = propagatePhase(target, event.type, true));
      // execute the bubbling phase
      result && (result = propagatePhase(target, event.type, false));
      // execute existing native method
      result && target[event.type] && target[event.type]();
      return result;
    },

  // propagate event capturing or bubbling phase
  propagatePhase =
    function(object, type, capture) {
      var i, l,
        result = true,
        node = object, ancestors = [],
        event = synthesize(object, type, capture);
      // add synthetic flag
      event.propagated=true;
      // collect ancestors
      while(node) {
        ancestors.push(node);
        node = node.parentNode;
      }
      // capturing, reverse ancestors collection
      if (capture) ancestors.reverse();
      // execute registered handlers in fifo order
      for (i = 0, l = ancestors.length; l > i; i++) {
        // set currentTarget to current ancestor 
        event.currentTarget = ancestors[i];
        // set eventPhase to the requested phase
        event.eventPhase = capture ? CAPTURING_PHASE : BUBBLING_PHASE;
        // execute listeners bound to this ancestor and set return value
        if (handleListeners.call(ancestors[i], event) === false || event.returnValue === false) {
          result = false;
          break;
        }
      }
      // remove synthetic flag
      delete event.propagated;
      return result;
    },

  // propagate activation events (W3 generic)
  propagateActivation =
    function(event) {
      var result = true, target = event.target;
      result && (result = propagatePhase(target, event.type, true));
      result && (result = propagatePhase(target, event.type, false));
      result || event.preventDefault();
      return result;
    },

  // propagate activation events (IE specific)
  propagateIEActivation =
    function(event) {
      var result = true, target = event.srcElement;
      if (event.type == 'beforedeactivate') {
        result && (result = propagatePhase(target, 'blur', true));
        result && (result = propagatePhase(target, 'blur', false));
      }
      if (event.type == 'beforeactivate') {
        result && (result = propagatePhase(target, 'focus', true));
        result && (result = propagatePhase(target, 'focus', false));
      }
      result || (event.returnValue = false);
      return result;
    },

  // propagate form action events
  propagateFormAction =
    function(event) {
      var target = event.target || event.srcElement, type = target.type;
      if (/file|text|password/.test(type) && event.keyCode == 13) {
          type = 'submit';
          target = target.form;
      } else if (/select-(one|multi)/.test(type)) {
          type = 'change';
      } else if (/reset|submit/.test(type)) {
          target = target.form;
      }
      if (target && !target['__' + type]) {
        target['__' + type] = true;
        NW.Event.appendHandler(target, type, propagate, false);
      }
    },

  // enable event propagation
  enablePropagation =
    function(object) {
      var win = getContext(object), doc = win.document;
      if (!forcedPropagation) {
        forcedPropagation = true;
        // deregistration on page unload
        NW.Event.appendHandler(win, 'unload',
          function(event) {
            NW.Event.removeListener(win, event.type, arguments.callee, false);
            disablePropagation(object);
          },false
        );
        // register capturing click and keyup event handlers
        NW.Event.appendHandler(doc, 'click', propagateFormAction, true);
        NW.Event.appendHandler(doc, 'keyup', propagateFormAction, true);
        if (doc.addEventListener) {
          // register capturing focus and blur event handlers
          NW.Event.appendHandler(doc, 'focus', propagateActivation, true);
          NW.Event.appendHandler(doc, 'blur', propagateActivation, true);
        } else if (doc.attachEvent) {
          // register emulated capturing focus and blur event handlers (for IE)
          NW.Event.appendHandler(doc, 'beforeactivate', propagateIEActivation, true);
          NW.Event.appendHandler(doc, 'beforedeactivate', propagateIEActivation, true);
        }
      }
    },

  // disable event propagation
  disablePropagation =
    function(object) {
      var win = getContext(object), doc = win.document;
      if (forcedPropagation) {
        forcedPropagation = false;
        // deregister capturing click and keyup event handlers
        NW.Event.removeHandler(doc, 'click', propagateFormAction, true);
        NW.Event.removeHandler(doc, 'keyup', propagateFormAction, true);
        if (doc.removeEventListener) {
          // deregister capturing focus and blur event handlers
          NW.Event.removeHandler(doc, 'blur', propagateActivation, true);
          NW.Event.removeHandler(doc, 'focus', propagateActivation, true);
        } else if (doc.detachEvent) {
          // deregister emulated capturing focus and blur event handlers (for IE)
          NW.Event.removeHandler(doc, 'beforeactivate', propagateIEActivation, true);
          NW.Event.removeHandler(doc, 'beforedeactivate', propagateIEActivation, true);
        }
      }
    };

  return {

    // control the type of registration
    // for event listeners (DOM0 / DOM2)
    EVENTS_W3C: true,

    // block any further event processing
    stop:
      function(event) {
        if (event.preventDefault) {
          event.preventDefault();
        } else {
          event.returnValue = false;
        }
        if (event.stopPropagation) {
          event.stopPropagation();
        } else {
          event.cancelBubble = true;
        }
        return false;
      },

    // programatically dispatch native or custom events
    dispatch:
      function(object, type, capture) {
        var event, result, win = getContext(object), doc = win.document;
        if (object.fireEvent) {
          // IE event model
          event = doc.createEventObject();
          event.type = type;
          event.target = object;
          event.eventPhase = 0;
          event.currentTarget = object;
          event.cancelBubble= !!capture;
          event.returnValue= undefined;
          // dispatch event type to object
          result = object.fireEvent('on' + type, fixEvent(object, event, capture));
        } else {
          // W3C event model
          if (/mouse|click/.test(type)) {
            event = doc.createEvent('MouseEvents');
            event.initMouseEvent(type, true, true, win, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
          } else if (/key(down|press|out)/.test(type)) {
            event = doc.createEvent('KeyEvents');
            event.initKeyEvent(type, true, true, win, false, false, false, false, 0, 0);
          } else {
            event = doc.createEvent('HTMLEvents');
            event.initEvent(type, true, true);
          }
          // dispatch event type to object
          result = object.dispatchEvent(event);
        }
        return result;
      },

    // append an event handler
    appendHandler:
      function(object, type, handler, capture) {
        var key;
        Handlers[type] || (Handlers[type] = {
          objects: [],
          funcs: [],
          parms: [],
          wraps: []
        });
        // if handler is not already registered
        if ((key = isRegistered(Handlers[type], object, type, handler, capture)) === false) {
          // append handler to the chain
          Handlers[type].objects.push(object);
          Handlers[type].funcs.push(handler);
          Handlers[type].parms.push(capture);
          if (object.addEventListener && NW.Event.EVENTS_W3C) {
            // use DOM2 event registration
            object.addEventListener(type, handler, capture || false);
          } else if (object.attachEvent && NW.Event.EVENTS_W3C) {
            // append wrapper function to fix IE scope
            key = Handlers[type].wraps.push(
              function(event) {
                return handler.call(object, fixEvent(object, event, capture));
              }
            );
            // use MSIE event registration
            object.attachEvent('on' + type, Handlers[type].wraps[key - 1]);
          } else {
            // if first handler for this event type
            if (Handlers[type].objects.length === 0) {
              // save previous handler if existing
              if(typeof object['on' + type] == 'function') {
                Handlers[type].objects.push(object);
                Handlers[type].funcs.push(object['on' + type]);
                Handlers[type].parms.push(capture);
              }
              // use DOM0 event registration
              o['on' + type] =
                function(event) {
                  return handler.call(this, fixEvent(this, event, capture));
                };
            }
          }
        }
        return this;
      },

    // remove an event handler
    removeHandler:
      function(object, type, handler, capture) {
        var key;
        // if handler is found to be registered
        if (Handlers[type] && (key = isRegistered(Handlers[type], object, type, handler, capture)) !== false) {
          // remove handler from the chain
          Handlers[type].objects.splice(key, 1);
          Handlers[type].funcs.splice(key, 1);
          Handlers[type].parms.splice(key, 1);
          if (object.removeEventListener && NW.Event.EVENTS_W3C) {
            // use DOM2 event deregistration
            object.removeEventListener(type, handler, capture || false);
          } else if (object.detachEvent && NW.Event.EVENTS_W3C) {
            // use MSIE event deregistration
            object.detachEvent('on' + type, Handlers[type].wraps[key]);
            // remove wrapper function from the chain
            Handlers[type].wraps.splice(key, 1);
          } else {
            // if last handler for this event type
            if (Handlers[type].objects.length == 1) {
              // use DOM0 event deregistration
              objects['on' + type] = Handlers[type].objects[0];
              // remove last handler from the chain
              Handlers[type].objects.splice(0, 1);
              Handlers[type].funcs.splice(0, 1);
              Handlers[type].parms.splice(0, 1);
            }
          }
          // if no more registered handlers of type
          if (Handlers[type].objects.length === 0) {
            // remove chain type from collection
            delete Handlers[type];
          }
        }
        return this;
      },

    // append an event listener
    appendListener:
      function(object, type, handler, capture) {
        var key;
        Listeners[type] || (Listeners[type] = {
          objects: [],
          funcs: [],
          parms: [],
          wraps: []
        });
        // if listener is not already registered
        if ((key = isRegistered(Listeners[type], object, type, handler, capture)) === false) {
          if (!forcedPropagation) {
            enablePropagation(object);
          }
          // append listener to the chain
          Listeners[type].objects.push(object);
          Listeners[type].funcs.push(handler);
          Listeners[type].parms.push(capture);
          if (object.addEventListener) {
            object.addEventListener(type, handleListeners, capture || false);
          } else if (object.attachEvent) {
            key = Listeners[type].wraps.push(
              function(event) {
                return handleListeners.call(object, fixEvent(object, event, capture));
              }
            );
            object.attachEvent('on' + type, Listeners[type].wraps[key - 1]);
          }
        }
        return this;
      },

    // remove an event listener
    removeListener:
      function(object, type, handler, capture) {
        var key;
        // if listener is found to be registered
        if (Listeners[type] && (key = isRegistered(Listeners[type], object, type, handler, capture)) !== false) {
          // remove listener from the chain
          Listeners[type].objects.splice(key, 1);
          Listeners[type].funcs.splice(key, 1);
          Listeners[type].parms.splice(key, 1);
          if (object.removeEventListener) {
            object.removeEventListener(type, handleListeners, capture || false);
          } else if (object.detachEvent) {
            object.detachEvent('on' + type, Listeners[type].wraps[key]);
            Listeners[type].wraps.splice(key, 1);
          }
          if (Listeners[type].objects.length === 0) {
            delete Listeners[type];
          }
        }
        return this;
      },

    // append an event delegate
    appendDelegate:
      function(object, type, handler, delegate) {
        var key;
        // if not user specified the delegated element
        // will default to root element (documentElement) 
        delegate = delegate || document.documentElement;
        Delegates[type] || (Delegates[type] = {
          objects: [],
          funcs: [],
          parms: []
        });
        // if delegate is not already registered
        if ((key = isRegistered(Delegates[type], object, type, handler, delegate)) === false) {
          // append delegate to the chain
          Delegates[type].objects.push(object);
          Delegates[type].funcs.push(handler);
          Delegates[type].parms.push(delegate);
          // if first delegate for this event type
          if (Delegates[type].objects.length == 1) {
            // append the real event lisyener for this chain
            NW.Event.appendListener(delegate, type, handleDelegates, true);
          }
        }
        return this;
      },

    // remove an event delegate
    removeDelegate:
      function(object, type, handler, delegate) {
        var key;
        // if not user specified the delegated element
        // will default to root element (documentElement) 
        delegate = delegate || document.documentElement;
        // if delegate is found to be registered
        if (Delegates[type] && (key = isRegistered(Delegates[type], object, type, handler, delegate)) !== false) {
          // remove delegate from the chain
          Delegates[type].objects.splice(key, 1);
          Delegates[type].funcs.splice(key, 1);
          Delegates[type].parms.splice(key, 1);
          // if last delegate for this event type
          if (Delegates[type].objects.length === 0) {
            delete Delegates[type];
            // remove the real event listener for this chain
            NW.Event.removeListener(delegate, type, handleDelegates, true);
          }
        }
        return this;
      }
  };

}();
