import { db } from "./db";
import { teams, events, eventCasters, streamSessions, tips, follows, castingPartnerships, partnershipInvitations, partnershipEvents, markers, chatMessages, stages } from "@shared/schema";

export async function seedDatabase() {
  try {
    // Check if database already has data - if so, skip seeding to preserve user data
    const existingEvents = await db.select().from(events).limit(1);
    const existingTeams = await db.select().from(teams).limit(1);
    
    if (existingEvents.length > 0 || existingTeams.length > 0) {
      console.log("Database already contains data - skipping seeding to preserve user data");
      return;
    }
    
    console.log("Database is empty - seeding with sample teams and events...");

    // NFL teams
    const nflTeams = [
      { league: "nfl" as const, city: "Kansas City", name: "Chiefs", slug: "kansas-city-chiefs" },
      { league: "nfl" as const, city: "Buffalo", name: "Bills", slug: "buffalo-bills" },
      { league: "nfl" as const, city: "Dallas", name: "Cowboys", slug: "dallas-cowboys" },
      { league: "nfl" as const, city: "New York", name: "Giants", slug: "new-york-giants" },
      { league: "nfl" as const, city: "Green Bay", name: "Packers", slug: "green-bay-packers" },
      { league: "nfl" as const, city: "Pittsburgh", name: "Steelers", slug: "pittsburgh-steelers" },
      { league: "nfl" as const, city: "New England", name: "Patriots", slug: "new-england-patriots" },
      { league: "nfl" as const, city: "San Francisco", name: "49ers", slug: "san-francisco-49ers" },
    ];

    // NBA teams
    const nbaTeams = [
      { league: "nba" as const, city: "Los Angeles", name: "Lakers", slug: "los-angeles-lakers" },
      { league: "nba" as const, city: "Golden State", name: "Warriors", slug: "golden-state-warriors" },
      { league: "nba" as const, city: "Boston", name: "Celtics", slug: "boston-celtics" },
      { league: "nba" as const, city: "Miami", name: "Heat", slug: "miami-heat" },
      { league: "nba" as const, city: "Chicago", name: "Bulls", slug: "chicago-bulls" },
      { league: "nba" as const, city: "Phoenix", name: "Suns", slug: "phoenix-suns" },
    ];

    // MLB teams
    const mlbTeams = [
      { league: "mlb" as const, city: "New York", name: "Yankees", slug: "new-york-yankees" },
      { league: "mlb" as const, city: "Los Angeles", name: "Dodgers", slug: "los-angeles-dodgers" },
      { league: "mlb" as const, city: "Boston", name: "Red Sox", slug: "boston-red-sox" },
      { league: "mlb" as const, city: "Houston", name: "Astros", slug: "houston-astros" },
    ];

    // Golf players (represented as teams for tournament field)
    const golfPlayers = [
      { league: "soccer" as const, city: "Scottie", name: "Scheffler", slug: "scottie-scheffler" },
      { league: "soccer" as const, city: "Jon", name: "Rahm", slug: "jon-rahm" },
      { league: "soccer" as const, city: "Rory", name: "McIlroy", slug: "rory-mcilroy" },
      { league: "soccer" as const, city: "Viktor", name: "Hovland", slug: "viktor-hovland" },
      { league: "soccer" as const, city: "Xander", name: "Schauffele", slug: "xander-schauffele" },
      { league: "soccer" as const, city: "Patrick", name: "Cantlay", slug: "patrick-cantlay" },
      { league: "soccer" as const, city: "Collin", name: "Morikawa", slug: "collin-morikawa" },
      { league: "soccer" as const, city: "Max", name: "Homa", slug: "max-homa" },
    ];

    // F1 Teams/Drivers
    const f1Teams = [
      { league: "soccer" as const, city: "Red Bull Racing", name: "Max Verstappen", slug: "red-bull-verstappen" },
      { league: "soccer" as const, city: "Red Bull Racing", name: "Sergio Perez", slug: "red-bull-perez" },
      { league: "soccer" as const, city: "Ferrari", name: "Charles Leclerc", slug: "ferrari-leclerc" },
      { league: "soccer" as const, city: "Ferrari", name: "Carlos Sainz", slug: "ferrari-sainz" },
      { league: "soccer" as const, city: "Mercedes", name: "Lewis Hamilton", slug: "mercedes-hamilton" },
      { league: "soccer" as const, city: "Mercedes", name: "George Russell", slug: "mercedes-russell" },
      { league: "soccer" as const, city: "McLaren", name: "Lando Norris", slug: "mclaren-norris" },
      { league: "soccer" as const, city: "McLaren", name: "Oscar Piastri", slug: "mclaren-piastri" },
    ];

    // Tennis players
    const tennisPlayers = [
      { league: "soccer" as const, city: "Novak", name: "Djokovic", slug: "novak-djokovic" },
      { league: "soccer" as const, city: "Carlos", name: "Alcaraz", slug: "carlos-alcaraz" },
      { league: "soccer" as const, city: "Daniil", name: "Medvedev", slug: "daniil-medvedev" },
      { league: "soccer" as const, city: "Jannik", name: "Sinner", slug: "jannik-sinner" },
      { league: "soccer" as const, city: "Iga", name: "Swiatek", slug: "iga-swiatek" },
      { league: "soccer" as const, city: "Aryna", name: "Sabalenka", slug: "aryna-sabalenka" },
      { league: "soccer" as const, city: "Coco", name: "Gauff", slug: "coco-gauff" },
      { league: "soccer" as const, city: "Jessica", name: "Pegula", slug: "jessica-pegula" },
    ];

    const allTeams = [...nflTeams, ...nbaTeams, ...mlbTeams, ...golfPlayers, ...f1Teams, ...tennisPlayers];

    // Insert teams
    const insertedTeams = await db.insert(teams).values(allTeams).returning();
    console.log(`Successfully seeded ${allTeams.length} teams`);

    // Create sample live events
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Find team IDs for events
    const chiefs = insertedTeams.find(t => t.slug === "kansas-city-chiefs");
    const bills = insertedTeams.find(t => t.slug === "buffalo-bills");
    const lakers = insertedTeams.find(t => t.slug === "los-angeles-lakers");
    const warriors = insertedTeams.find(t => t.slug === "golden-state-warriors");
    
    // Golf players
    const scheffler = insertedTeams.find(t => t.slug === "scottie-scheffler");
    const rahm = insertedTeams.find(t => t.slug === "jon-rahm");
    const mcilroy = insertedTeams.find(t => t.slug === "rory-mcilroy");
    const hovland = insertedTeams.find(t => t.slug === "viktor-hovland");
    
    // F1 drivers
    const verstappen = insertedTeams.find(t => t.slug === "red-bull-verstappen");
    const leclerc = insertedTeams.find(t => t.slug === "ferrari-leclerc");
    const hamilton = insertedTeams.find(t => t.slug === "mercedes-hamilton");
    const norris = insertedTeams.find(t => t.slug === "mclaren-norris");
    
    // Tennis players
    const djokovic = insertedTeams.find(t => t.slug === "novak-djokovic");
    const alcaraz = insertedTeams.find(t => t.slug === "carlos-alcaraz");
    const swiatek = insertedTeams.find(t => t.slug === "iga-swiatek");
    const gauff = insertedTeams.find(t => t.slug === "coco-gauff");

    const sampleEvents = [
      // NFL Game
      {
        homeTeamId: chiefs!.id,
        awayTeamId: bills!.id,
        startTime: oneHourAgo,
        title: "AFC Championship Game",
        description: "High-stakes playoff matchup between two powerhouse teams",
        status: "live" as const,
        sport: "football" as const,
        tags: ["playoff", "championship", "prime-time"],
        language: "en",
      },
      
      // NBA Game
      {
        homeTeamId: lakers!.id,
        awayTeamId: warriors!.id,
        startTime: twoHoursAgo,
        title: "Lakers vs Warriors - Rivalry Night",
        description: "Classic California rivalry with playoff implications",
        status: "live" as const,
        sport: "basketball" as const,
        tags: ["rivalry", "california", "prime-time"],
        language: "en",
      },

      // Golf Tournament - Final Round
      {
        homeTeamId: scheffler!.id,
        awayTeamId: rahm!.id,
        startTime: thirtyMinutesAgo,
        title: "The Masters Tournament - Final Round",
        description: "Final round action at Augusta National with Scheffler leading by 2 strokes",
        status: "live" as const,
        sport: "golf" as const,
        tags: ["major", "augusta", "final-round"],
        language: "en",
      },

      // Golf Tournament - Leaders Group
      {
        homeTeamId: mcilroy!.id,
        awayTeamId: hovland!.id,
        startTime: thirtyMinutesAgo,
        title: "The Masters - Chasing Pack",
        description: "McIlroy and Hovland battling to catch the leaders",
        status: "live" as const,
        sport: "golf" as const,
        tags: ["major", "augusta", "chasing-pack"],
        language: "en",
      },

      // F1 Race
      {
        homeTeamId: verstappen!.id,
        awayTeamId: leclerc!.id,
        startTime: oneHourAgo,
        title: "Monaco Grand Prix - Race",
        description: "The most prestigious race of the F1 calendar around the streets of Monaco",
        status: "live" as const,
        sport: "racing" as const,
        tags: ["f1", "monaco", "street-circuit"],
        language: "en",
      },

      // F1 Race - Midfield Battle
      {
        homeTeamId: hamilton!.id,
        awayTeamId: norris!.id,
        startTime: oneHourAgo,
        title: "Monaco GP - Midfield Battle",
        description: "Hamilton and Norris fighting for crucial championship points",
        status: "live" as const,
        sport: "racing" as const,
        tags: ["f1", "monaco", "midfield"],
        language: "en",
      },

      // Tennis - Men's Final
      {
        homeTeamId: djokovic!.id,
        awayTeamId: alcaraz!.id,
        startTime: twoHoursAgo,
        title: "Wimbledon Men's Final",
        description: "Epic showdown between the defending champion and rising star",
        status: "live" as const,
        sport: "tennis" as const,
        tags: ["grand-slam", "wimbledon", "final"],
        language: "en",
      },

      // Tennis - Women's Final
      {
        homeTeamId: swiatek!.id,
        awayTeamId: gauff!.id,
        startTime: twoHoursAgo,
        title: "Wimbledon Women's Final",
        description: "Youth vs experience in a thrilling women's championship match",
        status: "live" as const,
        sport: "tennis" as const,
        tags: ["grand-slam", "wimbledon", "final"],
        language: "en",
      },
    ];

    // Insert sample events
    await db.insert(events).values(sampleEvents);
    console.log(`Successfully seeded ${sampleEvents.length} live events`);
    
    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}