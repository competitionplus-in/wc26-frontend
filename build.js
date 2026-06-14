const fs = require('fs');
const path = require('path');

console.log("🚀 Starting Pitch90 SEO Build Process...");

// 1. Define the Master Tournament Schedule
// This guarantees Vercel always builds successfully.
const schedule = [
    {
        date: "2026-06-11",
        slug: "mexico-vs-south-africa",
        group: "Group A",
        home: { name: "MEX", code: "mx" },
        away: { name: "RSA", code: "za" }
    },
    {
        date: "2026-06-12",
        slug: "canada-vs-bosnia",
        group: "Group B",
        home: { name: "CAN", code: "ca" },
        away: { name: "BIH", code: "ba" }
    },
    {
        date: "2026-06-12",
        slug: "usa-vs-paraguay",
        group: "Group D",
        home: { name: "USA", code: "us" },
        away: { name: "PAR", code: "py" }
    }
];

// 2. Read the template file
const templatePath = path.join(__dirname, 'template.html');
let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

// 3. Generate the Hardcoded SEO Match Cards
let matchCardsHTML = '';
let currentGroup = '';

schedule.forEach(match => {
    // Generate Group Headers dynamically
    if (match.group !== currentGroup) {
        matchCardsHTML += `\n<section class="group-section" aria-labelledby="header-${match.group.replace(' ', '-').toLowerCase()}">`;
        matchCardsHTML += `\n<h2 id="header-${match.group.replace(' ', '-').toLowerCase()}" class="group-header">${match.group}</h2>\n`;
        currentGroup = match.group;
    }

    // 🏆 SEO MAGIC: Generate the Clean URL and hardcode the team names!
    matchCardsHTML += `
        <a href="/match/${match.date}/${match.slug}" class="match-card" aria-label="${match.home.name} vs ${match.away.name}">
            <div class="team-block">
                <img src="https://flagcdn.com/w40/${match.home.code}.png" class="team-flag" alt="${match.home.name} Flag">
                <span class="team-name">${match.home.name}</span>
            </div>
            
            <div class="score-block">
                <span class="score-time" style="font-size: 0.75rem;">VS</span>
                <span class="score-main">0 - 0</span>
            </div>
            
            <div class="team-block away">
                <span class="team-name">${match.away.name}</span>
                <img src="https://flagcdn.com/w40/${match.away.code}.png" class="team-flag" alt="${match.away.name} Flag">
            </div>
        </a>
    `;
});

// Close the final section tag
matchCardsHTML += `\n</section>`;

// 4. Inject the generated cards into the template
const finalHTML = htmlTemplate.replace('', matchCardsHTML);

// 5. Write the brand new, SEO-perfect index.html file
fs.writeFileSync(path.join(__dirname, 'index.html'), finalHTML);

console.log("✅ Successfully generated hardcoded index.html!");