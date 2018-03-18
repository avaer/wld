const path = require('path');
const fs = require('fs');
const url = require('url');
const {URL} = url;
const child_process = require('child_process');
const os = require('os');

const parse5 = require('parse5');
const {Node, fromAST, toAST, traverseAsync} = require('html-el');
const selector = require('selector-lite');
const fetch = require('window-fetch');
const tmp = require('tmp');
const yarnPath = require.resolve('yarn/bin/yarn.js');

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

    return traverseAsync(html, async el => {
      if (el.tagName === 'LINK') {
        const rel = el.getAttribute('rel');
        if (rel === 'directory') {
          const name = el.getAttribute('name');
          const src = el.getAttribute('src');
          if (name && src) {
            if (opts.ondirectory) {
              const boundUrl = await opts.ondirectory(name, src, bindings);
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
                  const boundUrl = await opts.onhostscript(name, src, mode, scriptString, null, bindings);
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
                      const boundUrl = await opts.onhostscript(name, src, mode, scriptString, null, bindings);
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
                  return new Promise((accept, reject) => {
                    tmp.dir((err, p) => {
                      if (!err) {
                        accept(p);
                      } else {
                        reject(err);
                      }
                    }, {
                      keep: true,
                    });
                  })
                    .then(p => {
                      return new Promise((accept, reject) => {
                        const npmInstall = child_process.spawn(
                          'node',
                          [
                            yarnPath,
                            'add',
                            src,
                            '--production',
                            '--mutex', 'file:' + path.join(os.tmpdir(), '.intrakit-yarn-lock'),
                          ],
                          {
                            cwd: p,
                            env: process.env,
                          }
                        );
                        // npmInstall.stdout.pipe(process.stderr);
                        npmInstall.stderr.pipe(process.stderr);
                        npmInstall.on('exit', code => {
                          if (code === 0) {
                            accept();
                          } else {
                            reject(new Error('npm install error: ' + code));
                          }
                        });
                        npmInstall.on('error', err => {
                          reject(err);
                        });
                      })
                        .then(() => new Promise((accept, reject) => {
                          const packageJsonPath = path.join(p, 'package.json');
                          fs.lstat(packageJsonPath, (err, stats) => {
                            if (!err) {
                              fs.readFile(packageJsonPath, 'utf8', (err, s) => {
                                if (!err) {
                                  const j = JSON.parse(s);
                                  const {dependencies} = j;
                                  const moduleName = Object.keys(dependencies)[0];
                                  accept(moduleName);
                                } else {
                                  reject(err);
                                }
                              });
                            } else {
                              reject(err);
                            }
                          });
                        }))
                        .then(moduleName => new Promise((accept, reject) => {
                          const packageJsonPath = path.join(p, 'node_modules', moduleName, 'package.json');
                          fs.readFile(packageJsonPath, 'utf8', (err, s) => {
                            if (!err) {
                              const j = JSON.parse(s);
                              const {main: mainPath} = j;
                              const mainScriptPath = path.join(p, 'node_modules', moduleName, mainPath);
                              fs.readFile(mainScriptPath, 'utf8', (err, scriptString) => {
                                if (!err) {
                                  opts.onhostscript(name, src, mode, null, null, bindings)
                                    .then(accept, reject);
                                } else {
                                  reject(err);
                                }
                              });
                            } else {
                              reject(err);
                            }
                          });
                        }));
                    });
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
