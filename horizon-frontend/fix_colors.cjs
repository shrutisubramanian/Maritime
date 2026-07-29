const fs = require('fs');
const config = require('./tailwind.config.js').default;
const colors = config.theme.extend.colors;
let out = '@theme {\n';
for (const [k, v] of Object.entries(colors)) {
  out += '  --color-' + k + ': ' + v + ';\n';
}
out += '}\n';
let css = fs.readFileSync('src/index.css', 'utf8');
css = css.replace('@config "../tailwind.config.js";', out);
fs.writeFileSync('src/index.css', css);
console.log('Colors injected!');
