const fs = require('fs');

const originalHtml = fs.readFileSync('original_landing.html', 'utf8');
const reactCode = fs.readFileSync('src/pages/Landing/index.tsx', 'utf8');

const classMatchesOriginal = [...originalHtml.matchAll(/class="([^"]+)"/g)].map(m => m[1]);
const classNameMatchesReact = [...reactCode.matchAll(/className="([^"]+)"/g)].map(m => m[1]);

// Let's filter out the ones I explicitly changed for responsiveness
const normalize = (c) => c.replace(/\b2xl:/g, 'lg:');

let missingInReact = [];
for (let c of classMatchesOriginal) {
    if (c === "dark") continue; // HTML element tag
    const found = classNameMatchesReact.find(rc => normalize(rc) === normalize(c));
    if (!found) {
        missingInReact.push(c);
    }
}

console.log("Missing classes in React:");
console.log(missingInReact);
