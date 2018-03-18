const fs = require('fs');
const util = require('util');
const parse5 = require('parse5');
const selector = require('selector-lite');
const {fromAST} = require('./html-el');

if (require.main === module) {
  const fileName = process.argv[2];
  if (fileName) {
    fs.readFile(fileName, 'utf8', (err, htmlString) => {
      if (!err) {
        const documentAst = parse5.parse(htmlString, {
          locationInfo: true,
        });
        documentAst.tagName = 'document';
        const document = fromAST(documentAst);
        const html = document.childNodes.find(el => el.tagName === 'HTML');
        const links = selector.find(html, 'link');
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const rel = link.getAttribute('rel');
          if (rel === 'directory') {
            const src = link.getAttribute('src');
            console.log('got directory', src); // XXX
          } else if (rel === 'hostScript') {
            const src = link.getAttribute('src');
            console.log('got host script', src); // XXX
          } else {
            console.warn(`${fileName}:${link.location.line}:${link.location.col}: ignoring unknown link`);
          }
        }
      } else {
        throw err;
      }
    });
  } else {
    console.warn('usage: wld <fileName>');
    process.exit(1);
  }
}
