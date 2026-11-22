const fs = require('fs');
let html = fs.readFileSync('original_landing.html', 'utf8');
let bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) {
  console.log('No body found');
  process.exit(1);
}
let body = bodyMatch[1];

// Remove scripts
body = body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

// Replace class= with className=
let jsx = body.replace(/class=\"/g, 'className=\"');

// Replace style attributes
jsx = jsx.replace(/style=\"font-variation-settings:\s*'FILL'\s*1\"/g, 'style={{ fontVariationSettings: \"\'FILL\' 1\" }}');

// Replace self closing tags
jsx = jsx.replace(/<img([^>]+[^\/])>/g, '<img$1/>');
jsx = jsx.replace(/<input([^>]+[^\/])>/g, '<input$1/>');

// Fix <br>
jsx = jsx.replace(/<br>/g, '<br/>');

// Fix comments
jsx = jsx.replace(/<!--[\s\S]*?-->/g, match => '{/* ' + match.replace(/<!--|-->/g, '').trim() + ' */}');

const finalCode = `import React from 'react';\n\nexport default function LandingPage() {\n    return (\n        <>\n${jsx}\n        </>\n    );\n}\n`;

fs.writeFileSync('src/pages/Landing/index.tsx', finalCode);
console.log('Done converting back to exact JSX');
