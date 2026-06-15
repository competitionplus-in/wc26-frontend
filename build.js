const fs = require('fs');
const path = require('path');

console.log("🚀 Starting Pitch90 Automated SEO Build Process...");

// Wrap in an async IIFE to allow awaiting the API fetch in standard Node.js
(async () => {
    try {
        console.log("📡 Fetching official World Cup 2026 schedule from API-Football...");
        
        // Fetch all matches for the 2026 World Cup (League 1, Season 2026)
        const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
            headers: { "x-apisports-key": "fc1ea35d48fc5ae55648b58d99be224d" }
        });

        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        const data = await response.json();

        if (!data.response || data.response.length === 0) {
            throw new Error("No matches returned from the API. Check your API key or endpoint parameters.");
        }

        // Helper function to create clean URL slugs (e.g., "South Africa" -> "south-africa")
        const createSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        // 1. Dynamically Map the API Data into the Pitch90 Schedule format
        const schedule = data.response.map(match => {
            const dateStr = match.fixture.date.substring(0, 10); // Extracts "YYYY-MM-DD"
            const homeName = match.teams.home.name;
            const awayName = match.teams.away.name;
            const matchSlug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;

            return {
                date: dateStr,
                slug: matchSlug,
                group: match.league.round, // E.g., "Group A" or "Round of 16"
                home: {
                    name: homeName.substring(0, 3).toUpperCase(), // Extracts first 3 letters for abbreviation (e.g., "MEX")
                    fullName: homeName,
                    logo: match.teams.home.logo // Uses official API-Football PNGs
                },
                away: {
                    name: awayName.substring(0, 3).toUpperCase(),
                    fullName: awayName,
                    logo: match.teams.away.logo
                }
            };
        });

        console.log(`✅ Successfully mapped ${schedule.length} matches from the API!`);

        // 2. Read the template file
        const templatePath = path.join(__dirname, 'template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        // 3. Generate the Dynamic SEO Match Cards
        let matchCardsHTML = '';
        let currentGroup = '';

        schedule.forEach(match => {
            // Create a new section header whenever the group/round changes
            if (match.group !== currentGroup) {
                const groupId = createSlug(match.group);
                matchCardsHTML += `\n<section class="group-section" aria-labelledby="header-${groupId}">`;
                matchCardsHTML += `\n<h2 id="header-${groupId}" class="group-header">${match.group}</h2>\n`;
                currentGroup = match.group;
            }

            matchCardsHTML += `
                <a href="/match/${match.date}/${match.slug}" class="match-card" aria-label="${match.home.fullName} vs ${match.away.fullName}">
                    <div class="team-block">
                        <img src="${match.home.logo}" class="team-flag" alt="${match.home.fullName} Logo">
                        <span class="team-name">${match.home.name}</span>
                    </div>
                    
                    <div class="score-block">
                        <span class="score-time" style="font-size: 0.75rem;">VS</span>
                        <span class="score-main">v</span>
                    </div>
                    
                    <div class="team-block away">
                        <span class="team-name">${match.away.name}</span>
                        <img src="${match.away.logo}" class="team-flag" alt="${match.away.fullName} Logo">
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
        // Physically build the directories for every single match
        if (fs.existsSync(path.join(__dirname, 'match.html'))) {
            schedule.forEach(match => {
                const matchDir = path.join(outputDir, 'match', match.date, match.slug);
                fs.mkdirSync(matchDir, { recursive: true });
                fs.copyFileSync(path.join(__dirname, 'match.html'), path.join(matchDir, 'index.html'));
            });
            console.log("✅ Physically generated dynamic match directories!");
        }

        // --- 8. SSG FIX FOR STANDINGS PAGE ---
        if (fs.existsSync(path.join(__dirname, 'standings.html'))) {
            const standingsDir = path.join(outputDir, 'standings');
            fs.mkdirSync(standingsDir, { recursive: true });
            fs.copyFileSync(path.join(__dirname, 'standings.html'), path.join(standingsDir, 'index.html'));
            console.log("✅ Physically generated the /standings directory!");
        }

        // --- 9. SSG FIX FOR STATS PAGE ---
        if (fs.existsSync(path.join(__dirname, 'stats.html'))) {
            const statsDir = path.join(outputDir, 'stats');
            fs.mkdirSync(statsDir, { recursive: true });
            fs.copyFileSync(path.join(__dirname, 'stats.html'), path.join(statsDir, 'index.html'));
            console.log("✅ Physically generated the /stats directory!");
        }

        console.log("✅ Successfully generated API-driven website in the /public folder!");

    } catch (error) {
        console.error("❌ Build Failed:", error.message);
        process.exit(1); // Fails the Vercel build process safely if the API is down
    }
})();
