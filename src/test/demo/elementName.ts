const indexOf = Array.prototype.indexOf;

export function createGetElementName(rootDom: HTMLElement) {
  const elements = new WeakMap<HTMLElement, string>();
  const elementNames = new Set();

  return function(node: HTMLElement) {
    let elementName = elements.get(node);
    if (!elementName) {
      let querySelector = node.tagName;
      node.classList.forEach(className => {
        if (!className.startsWith("svelte-")) {
          querySelector += `.${className}`;
        }
      });
      const matchingElements = rootDom.querySelectorAll(querySelector);
      expect(matchingElements.length).toBeGreaterThan(0);
      if (matchingElements.length === 1) {
        expect(matchingElements[0]).toBe(node);
        elementName = querySelector;
      } else {
        const index = indexOf.call(matchingElements, node);
        expect(index).not.toBe(-1);
        elementName = `${querySelector} #${index}`;
      }
      expect(elementNames.has(elementName)).toBeFalsy();
      elementNames.add(elementName);
      elements.set(node, elementName);
    }
    return elementName;
  };
}
