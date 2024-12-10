// main.js
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables before importing other modules
import RCONManager from './rconmanager.js';
import DiscordBot from './discordbot.js';


(async () => {
    try {
        const rconManager = new RCONManager();
        await rconManager.init();

        const discordBot = new DiscordBot(rconManager);
        await discordBot.init();
    } catch (error) {
        console.error('Error initializing the bot:', error);
    }
})();