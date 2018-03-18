class Node {
  constructor(nodeName = null) {
    this.nodeName = nodeName;
    this.parentNode = null;
  }

  get parentElement() {
    if (this.parentNode && this.parentNode.nodeType === Node.ELEMENT_NODE) {
      return this.parentNode;
    } else {
      return null;
    }
  }
  set parentElement(parentElement) {}

  get nextSibling() {
    if (this.parentNode) {
      const selfIndex = this.parentNode.childNodes.indexOf(this);
      const nextIndex = selfIndex + 1;
      if (nextIndex < this.parentNode.childNodes.length) {
        return this.parentNode.childNodes[nextIndex];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  set nextSibling(nextSibling) {}
  get previousSibling() {
    if (this.parentNode) {
      const selfIndex = this.parentNode.childNodes.indexOf(this);
      const prevIndex = selfIndex - 1;
      if (prevIndex >= 0) {
        return this.parentNode.childNodes[prevIndex];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  set previousSibling(previousSibling) {}

  get nextElementSibling() {
    if (this.parentNode) {
      const selfIndex = this.parentNode.childNodes.indexOf(this);
      for (let i = selfIndex + 1; i < this.parentNode.childNodes.length; i++) {
        const childNode = this.parentNode.childNodes[i];
        if (childNode.nodeType === Node.ELEMENT_NODE) {
          return childNode;
        }
      }
      return null;
    } else {
      return null;
    }
  }
  set nextElementSibling(nextElementSibling) {}
  get previousElementSibling() {
    if (this.parentNode) {
      const selfIndex = this.parentNode.childNodes.indexOf(this);
      for (let i = selfIndex - 1; i >= 0; i--) {
        const childNode = this.parentNode.childNodes[i];
        if (childNode.nodeType === Node.ELEMENT_NODE) {
          return childNode;
        }
      }
      return null;
    } else {
      return null;
    }
  }
  set previousElementSibling(previousElementSibling) {}
}
Node.ELEMENT_NODE = 1;
Node.TEXT_NODE = 3;
Node.PROCESSING_INSTRUCTION_NODE = 7;
Node.COMMENT_NODE = 8;
Node.DOCUMENT_NODE = 9;
Node.DOCUMENT_TYPE_NODE = 10;
Node.DOCUMENT_FRAGMENT_NODE = 11;
class HTMLElement extends Node {
  constructor(tagName = 'DIV', attrs = [], value = '', location = null) {
    super(null);

    this.tagName = tagName;
    this.attrs = attrs;
    this.value = value;
    this.location = location;

    this.childNodes = [];
  }

  get nodeType() {
    return Node.ELEMENT_NODE;
  }
  set nodeType(nodeType) {}

  getAttribute(name) {
    const attr = this.attrs.find(attr => attr.name === name);
    return attr && attr.value;
  }
  setAttribute(name, value) {
    const attr = this.attrs.find(attr => attr.name === name);
    if (!attr) {
      const attr = {
        name: name,
        value,
      };
      this.attrs.push(attr);
    } else {
      const oldValue = attr.value;
      attr.value = value;
    }
  }
  removeAttribute(name) {
    const index = this.attrs.findIndex(attr => attr.name === name);
    if (index !== -1) {
      const oldValue = this.attrs[index].value;
      this.attrs.splice(index, 1);
    }
  }

  get firstChild() {
    return this.childNodes.length > 0 ? this.childNodes[0] : null;
  }
  set firstChild(firstChild) {}
  get lastChild() {
    return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1] : null;
  }
  set lastChild(lastChild) {}

  get firstElementChild() {
    for (let i = 0; i < this.childNodes.length; i++) {
      const childNode = this.childNodes[i];
      if (childNode.nodeType === Node.ELEMENT_NODE) {
        return childNode;
      }
    }
    return null;
  }
  set firstElementChild(firstElementChild) {}
  get lastElementChild() {
    for (let i = this.childNodes.length - 1; i >= 0; i--) {
      const childNode = this.childNodes[i];
      if (childNode.nodeType === Node.ELEMENT_NODE) {
        return childNode;
      }
    }
    return null;
  }
  set lastElementChild(lastElementChild) {}

  get id() {
    return this.getAttribute('id') || '';
  }
  set id(id) {
    id = id + '';
    this.setAttribute('id', id);
  }

  get className() {
    return this.getAttribute('class') || '';
  }
  set className(className) {
    className = className + '';
    this.setAttribute('class', className);
  }
}
class Text extends Node {
  constructor(value) {
    super('#text');

    this.value = value;
  }

  get nodeType() {
    return Node.TEXT_NODE;
  }
  set nodeType(nodeType) {}

  /* inspect() {
    return JSON.stringify(this.value);
  } */
}
class Comment extends Node {
  constructor(value) {
    super('#comment');

    this.value = value;
  }

  get nodeType() {
    return Node.COMMENT_NODE;
  }
  set nodeType(nodeType) {}

  /* inspect() {
    return `<!--${this.value}-->`;
  } */
}

const fromAST = (node, parentNode = null) => {
  if (node.nodeName === '#text') {
    const text = new Text(node.value);
    text.parentNode = parentNode;
    return text;
  } else if (node.nodeName === '#comment') {
    const comment = new Comment(node.data);
    comment.parentNode = parentNode;
    return comment;
  } else {
    const tagName = node.tagName && node.tagName.toUpperCase();
    const {attrs, value, __location} = node;
    const location = __location ? {
      line: __location.line,
      col: __location.col,
    } : null;
    const element = new HTMLElement(
      tagName,
      attrs,
      value,
      location,
    );
    element.parentNode = parentNode;
    if (node.childNodes) {
      element.childNodes = node.childNodes.map(childNode => fromAST(childNode, element));
    }
    return element;
  }
};
const traverse = (node, fn) => {
  const _recurse = node => {
    const result = fn(node);
    if (result !== undefined) {
      return result;
    } else if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const result = _recurse(node.childNodes[i]);
        if (result !== undefined) {
          return result;
        }
      }
    }
  };
  return _recurse(node);
};
const traverseAsync = async (node, fn) => {
  const _recurse = async node => {
    const result = await fn(node);
    if (result !== undefined) {
      return result;
    } else if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const result = await _recurse(node.childNodes[i]);
        if (result !== undefined) {
          return result;
        }
      }
    }
  };
  return await _recurse(node);
};

module.exports = {
  Node,
  HTMLElement,
  Text,
  Comment,
  fromAST,
  traverse,
  traverseAsync,
};
