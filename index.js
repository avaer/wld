const util = require('util');
const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const http = require('http');
const child_process = require('child_process');
const os = require('os');

const express = require('express');
const expressPut = require('express-put')(express);
const parse5 = require('parse5');
const {Node, fromAST, toAST, traverseAsync} = require('html-el');
const selector = require('selector-lite');
const fetch = require('window-fetch');
const windowEval = require('window-eval-native');
const tmp = require('tmp');

const wld = (fileName, opts = {}) =>
  new Promise((accept, reject) => {
    fs.readFile(fileName, 'utf8', (err, htmlString) => {
      if (!err) {
        const documentAst = parse5.parse(htmlString, {
          locationInfo: true,
        });
        documentAst.tagName = 'document';
        const document = fromAST(documentAst);
        accept(document);
      } else {
        reject(err);
      }
    });
  })
  .then(document => {
    const html = document.childNodes.find(el => el.tagName === 'HTML');
    const baseUrl = 'file://' + __dirname + '/';
    const bindings = {};

    const _makeContext = o => {
      const context = {
        window: null,
        require,
        process: new Proxy(process, {
          get(target, key, value) {
            if (key === 'env') {
              return Object.assign({}, target.env, o);
            } else {
              return target[key];
            }
          },
        }),
        console,
      };
      context.window = context;
      return context;
    };
    const _getLocalSrc = src => {
      const p = url.parse(src).pathname;
      return p && path.join('/', p);
    };
    const _setAttribute = (attrs, name, value) => {
      const attr = attrs.find(attr => attr.name === name);
      if (attr) {
        attr.value = value;
      } else {
        attrs.push({
          name,
          value,
        });
      }
    };
    const _formatBindings = bindings => {
      const result = {};
      for (const k in bindings) {
        result['LINK_' + k] = bindings[k].boundUrl;
      }
      return result;
    };

    return traverseAsync(html, async el => {
      if (el.tagName === 'LINK') {
        const rel = el.getAttribute('rel');
        if (rel === 'directory') {
          const name = el.getAttribute('name');
          const src = el.getAttribute('src');
          if (name && src) {
            if (opts.ondirectory) {
              const boundUrl = await opts.ondirectory(name, src);
              if (boundUrl) {
                _setAttribute(el.attrs, 'boundUrl', boundUrl);
                bindings[name] = {
                  localSrc: null,
                  boundUrl,
                  scriptString: null,
                };
              }
            }
          } else {
            console.warn(`${fileName}:${el.location.line}:${el.location.col}: invalid attributes in directory link ${JSON.stringify({name, src})}`);
          }
        } else if (rel === 'hostScript') {
          const name = el.getAttribute('name');
          const src = el.getAttribute('src');
          const type = el.getAttribute('type');
          const mode = (() => {
            if (!type || /^(?:(?:text|application)\/javascript|application\/ecmascript)$/.test(type)) {
              return 'javascript';
            } else if (type === 'application/nodejs') {
              return 'nodejs';
            } else {
              return null;
            }
          })();
          if (name && src && mode) {
            if (/^#[a-z][a-z0-9\-]*$/i.test(src)) {
              const scriptEl = selector.find(html, src, true);
              if (scriptEl && scriptEl.childNodes.length === 1 && scriptEl.childNodes[0].nodeType === Node.TEXT_NODE) {
                const scriptString = scriptEl.childNodes[0].value;

                if (opts.onhostscript) {
                  const boundUrl = await opts.onhostscript(name, src, mode, scriptString);
                  if (boundUrl) {
                    _setAttribute(el.attrs, 'boundUrl', boundUrl);
                    bindings[name] = {
                      localSrc: _getLocalSrc(src),
                      boundUrl,
                      scriptString,
                    };
                  }
                }
              } else {
                console.warn(`${fileName}:${el.location.line}:${el.location.col}: ignoring invalid link script tag reference ${JSON.stringify(src)}`);
              }
            } else {
              if (mode === 'javascript') {
                const url = new URL(src, baseUrl).href;
                await fetch(url)
                  .then(res => {
                    if (res.status >= 200 && res.status < 300) {
                      return res.text();
                    } else {
                      return Promise.reject(new Error('invalid status code: ' + res.status));
                    }
                  })
                  .then(async scriptString => {
                    if (opts.onhostscript) {
                      const boundUrl = await opts.onhostscript(name, src, mode, scriptString);
                      if (boundUrl) {
                        _setAttribute(el.attrs, 'boundUrl', boundUrl);
                        bindings[name] = {
                          localSrc: _getLocalSrc(src),
                          boundUrl,
                          scriptString,
                        };
                      }
                    }
                  });
              } else if (mode === 'nodejs') {
                if (opts.onhostscript) {
                  const boundUrl = await opts.onhostscript(name, src, mode, null);
                  if (boundUrl) {
                    _setAttribute(el.attrs, 'boundUrl', boundUrl);
                    bindings[name] = {
                      localSrc: _getLocalSrc(src),
                      boundUrl,
                      scriptString,
                    };
                  }
                }
              }
            }
          } else {
            console.warn(`${fileName}:${el.location.line}:${el.location.col}: invalid link hostScript arguments ${JSON.stringify({name, src, type})}`);
          }
        } else {
          console.warn(`${fileName}:${el.location.line}:${el.location.col}: ignoring unknown link rel ${JSON.stringify(rel)}`);
        }
      }
    })
      .then(() => {
        return {
          indexHtml: parse5.serialize(toAST(document)),
        };
      });
  });

module.exports = wld;

if (require.main === module) {
  const fileName = process.argv[2];
  if (fileName) {
    process.on('uncaughtException', err => {
      console.warn(err.stack);
    });
    process.on('unhandledRejection', err => {
      console.warn(err.stack);
    });

    wld(fileName)
      .then(o => {
        console.log(o.indexHtml);
      })
      .catch(err => {
        throw err;
      });
  } else {
    console.warn('usage: wld <fileName>');
    process.exit(1);
  }
}
