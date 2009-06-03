(function(D){
  
  // TODO: all of this needs tests
  var match = D.match;
  
  function walkElements(property, element, expr) {
    var i = 0, isIndex = typeof expr == 'number';
    if (typeof expr == "undefined") {
      isIndex = true;
      expr = 0;
    }
    while (element = element[property]) {
      if (element.nodeType != 1) continue;
      if (isIndex) {
        if (i++ == expr) {
          return element;
        }
      }
      else if (match(element, expr)) {
        return element;
      }
    }
  }
  
  /**
   * @method up
   * @param {HTMLElement} element element to walk from
   * @param {String | Number} expr CSS expression or an index
   * @return {HTMLElement | undefined}
   */
  function up(element, expr) {
    return walkElements('parentNode', element, expr);
  }
  /**
   * @method next
   * @param {HTMLElement} element element to walk from
   * @param {String | Number} expr CSS expression or an index
   * @return {HTMLElement | undefined}
   */
  function next(element, expr) {
    return walkElements('nextSibling', element, expr);
  }
  /**
   * @method previous
   * @param {HTMLElement} element element to walk from
   * @param {String | Number} expr CSS expression or an index
   * @return {HTMLElement | undefined}
   */
  function previous(element, expr) {
    return walkElements('previousSibling', element, expr);
  }
  /**
   * @method down
   * @param {HTMLElement} element element to walk from
   * @param {String | Number} expr CSS expression or an index
   * @return {HTMLElement | undefined}
   */
  function down(element, expr) {
    // TODO: implement index-based matching
    if (match(element, expr)) return element;
    if (element.childNodes) {
      for (var i=0, l=element.childNodes.length; i<l; i++) {
        var child = element.childNodes[i];
        if (child.nodeType === 1) {
          var result = match(child, expr);
          if (result) return child;
          return down(child, expr);
        }
      }
    }
  }
  D.up = up;
  D.down = down;
  D.next = next;
  D.previous = previous;
})(NW.Dom);