const fs = require('fs');
const path = require('path');

console.log("🚀 Starting Pitch90 SEO Build Process...");

// 1. Define the Master Tournament Schedule
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
    if (match.group !== currentGroup) {
        matchCardsHTML += `\n<section class="group-section" aria-labelledby="header-${match.group.replace(' ', '-').toLowerCase()}">`;
        matchCardsHTML += `\n<h2 id="header-${match.group.replace(' ', '-').toLowerCase()}" class="group-header">${match.group}</h2>\n`;
        currentGroup = match.group;
    }

    matchCardsHTML += `
        <a href="/match/${match.date}/${match.slug}" class="match-card" aria-label="${match.home.name} vs ${match.away.name}">
            <div class="team-block">
                <img src="https://flagcdn.com/w40/${match.home.code}.png" class="team-flag" alt="${match.home.name} Flag">
                <span class="team-name">${match.home.name}</span>
            </div>
            
            <div class="score-block">
                <span class="score-time" style="font-size: 0.75rem;">VS</span>
                <span class="score-main">v</span>
            </div>
            
            <div class="team-block away">
                <span class="team-name">${match.away.name}</span>
                <img src="https://flagcdn.com/w40/${match.away.code}.png" class="team-flag" alt="${match.away.name} Flag">
            </div>
        </a>
    `;
});

matchCardsHTML += `\n</section>`;

// 4. Inject the generated cards into the template
const finalHTML = htmlTemplate.replace('[[INJECT_MATCHES_HERE]]', matchCardsHTML);

// 5. Create the "public" folder
const outputDir = path.join(__dirname, 'public');
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir, { recursive: true });
}

// 6. Write the brand new index.html into the 'public' folder
fs.writeFileSync(path.join(outputDir, 'index.html'), finalHTML);

// --- 7. THE TRUE SSG FIX ---
// Physically build the directories for every single match so Vercel never gives a 404!
if (fs.existsSync(path.join(__dirname, 'match.html'))) {
    schedule.forEach(match => {
        // Create the physical folder path
        const matchDir = path.join(outputDir, 'match', match.date, match.slug);
        fs.mkdirSync(matchDir, { recursive: true });
        
        // Drop a copy of match.html inside that folder as 'index.html'
        fs.copyFileSync(path.join(__dirname, 'match.html'), path.join(matchDir, 'index.html'));
    });
    console.log("✅ Physically generated dynamic match directories!");
}

// --- 8. SSG FIX FOR STANDINGS PAGE ---
if (fs.existsSync(path.join(__dirname, 'standings.html'))) {
    const standingsDir = path.join(outputDir, 'standings');
    fs.mkdirSync(standingsDir, { recursive: true });
    
    // Drop a copy of standings.html inside that folder as 'index.html'
    fs.copyFileSync(path.join(__dirname, 'standings.html'), path.join(standingsDir, 'index.html'));
    console.log("✅ Physically generated the /standings directory!");
}

console.log("✅ Successfully generated hardcoded website in the /public folder!");
