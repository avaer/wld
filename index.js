const fs = require('fs');
const util = require('util');
const parse5 = require('parse5');
const selector = require('selector-lite');

if (require.main === module) {
  const fileName = process.argv[2];
  if (fileName) {
    fs.readFile(fileName, err => {
      if (!err) {
        const document = parse5.parse(fileName); // XXX need to spit out actual HTMLElement objects
        const html = document.childNodes.find(el => el.tagName === 'html');
        const links = selector.find(html, 'link', true);
        console.log('got links', links);
      } else {
        throw err;
      }
    });
  } else {
    console.warn('usage: wld <fileName>');
    process.exit(1);
  }
}
