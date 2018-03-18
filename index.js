const fs = require('fs');
const parse5 = require('parse5');
const selector = require('selector-lite');

if (require.main === module) {
  const fileName = process.argv[2];
  if (fileName) {
    fs.readFile(fileName, err => {
      if (!err) {
        const document = parse5.parse(fileName);
        console.log('got document', document);
      } else {
        throw err;
      }
    });
  } else {
    console.warn('uage: wld <fileName>');
    process.exit(1);
  }
}
