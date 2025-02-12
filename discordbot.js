// discordbot.js
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { CommandHandler } from './handlers/CommandHandler.js';
import { RconCommand } from './commands/RconCommand.js';
import { RconServerCommand } from './commands/RconServerCommand.js';
import { ListServersCommand } from './commands/ListServersCommand.js';
import { ActivityType } from 'discord.js';
import { ChangeKitAmountCommand } from './commands/ChangeKitAmountCommand.js';
import { ListServersLiveCommand } from './commands/ListServersLiveCommand.js';
import cron from 'node-cron'

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_KEY;
const allowedRoleId = '1319503680340361246';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

class DiscordBot {
    static developmentMode = false;
    constructor(rconManager) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMessageReactions, // Add this intent
                GatewayIntentBits.MessageContent // If you need to access message content
            ],
            partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
        });

        this.rconManager = rconManager;
        this.webhookUrl = process.env.WEBHOOK_URL_CHAT;
        this.webhookUrlLog = process.env.WEBHOOK_URL_LOG;
        this.channelId = process.env.CHANNEL_ID;
        this.lastMessages = {};

        // Initialize command handler
        this.commandHandler = new CommandHandler(this.client, {
            token: DiscordBot.developmentMode ? process.env.DISCORD_TOKEN_BETA : process.env.DISCORD_TOKEN,
            clientId: DiscordBot.developmentMode ? process.env.CLIENT_ID_BETA : process.env.CLIENT_ID,
            guildId: process.env.GUILD_ID,
            rconManager: this.rconManager
        });

        // Register commands
        this.commandHandler.registerCommand(new RconCommand(allowedRoleId));
        this.commandHandler.registerCommand(new RconServerCommand(allowedRoleId));
        this.commandHandler.registerCommand(new ListServersCommand());
        this.commandHandler.registerCommand(new ChangeKitAmountCommand(allowedRoleId));
        this.commandHandler.registerCommand(new ListServersLiveCommand(allowedRoleId));
    }

    async init() {
        await this.loginDiscord();
        await this.commandHandler.registerWithDiscord();
        this.commandHandler.setupInteractionListener();
        if (!DiscordBot.developmentMode){
            this.setupMessageListener();
            this.startChatFetchCycle();
            this.startPresenceUpdateCycle();
            await this.scheduleDailyDinoWipe();
        } else {
            console.log('Bot running in development mode. ChatFetchCycle, PresenceUpdateCycle And DailyDinoWipe Suspended')
        }
    }

    async loginDiscord() {
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            throw new Error('DISCORD_TOKEN is not set.');
        }

        try {
            await this.client.login(token);
            console.log(`Logged in as ${this.client.user.tag}!`);
        } catch (error) {
            console.error('Failed to login to Discord:', error);
        }
    }

    startChatFetchCycle() {
        setInterval(() => {
            for (const server of this.rconManager.servers) {
                this.fetchAndStoreChat(server);
            }
        }, 1000);
    }

    async sendAdminLogToDiscord(server, username, message) {
        console.log(`Admin command detected from ${server.name}, sending to discord log channel...`);
        const payload = {
            content: `**[${server.name}]:\n\`\`\`${username}:** ${message}\`\`\``,
        };

        const response = await fetch(this.webhookUrlLog, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to send webhook message for ${server.name}: ${response.status} ${response.statusText} - ${errorText}`);
        } else {
            console.log(`Sent Admin log from ${server.name} to Discord.`);
        }
    }

    async fetchAndStoreChat(server) {
        try {
            const chatData = await this.rconManager.getLatestChat(server.index);
            if (!chatData) return;

            const { username, message } = chatData;

            if (this.lastMessages[server.index] === message) {
                console.log(`Duplicate message from ${server.name}: ${message}`);
                return;
            }

            this.lastMessages[server.index] = message;

            // Check if admin command
            if (username.includes('Admin')) {
                console.log("Admin Command detected Sending To Discord")
                await this.sendAdminLogToDiscord(server, username, message);
                return; 
            }

            const content = `**[${server.name}] ${username}:** ${message}`;
            const payload = { content };

            console.log('Sending message to Discord webhook:', JSON.stringify(payload));

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to send webhook message: ${response.status} ${response.statusText} - ${errorText}`);
            } else {
                console.log(`Sent message from ${username} on ${server.name} to Discord.`);
            }

            await this.storeMessageInSupabase(server.index, username, message);
            await this.sendMessageToOtherServers(server.index, username, message);
        } catch (error) {

            // Check if it's a timeout error
            if (error.message && error.message.includes('Timeout')) {
                // Attempt a reconnect or simply skip this iteration
                console.log(`Attempting to reconnect to ${server.name} due to timeout...`);
                console.error(`Error fetching chat from server ${server.name}:`, error);
                await this.rconManager.connectRCON(server);

                // Optional: Add a short delay before next attempt if desired
                await new Promise(res => setTimeout(res, 5000));

            }
        }
    }

    async sendMessageToAllServers(username, message) {
        console.log(`Sending message to all servers: ${username}: ${message}`);
        for (const server of this.rconManager.servers) {
            try {
                await this.rconManager.sendMessage(server.index, username, message);
                console.log(`Sent message to ${server.name}: ${username}: ${message}`);
            } catch (error) {
                console.error(`Error sending message to server ${server.name}:`, error);
            }
        }
    }

    async sendMessageToOtherServers(originServerIndex, username, message) {
        console.log(`Sending message to other servers from ${originServerIndex}: ${username}: ${message}`);
        for (const server of this.rconManager.servers) {
            if (server.index !== originServerIndex) {
                try {
                    await this.rconManager.sendMessage(server.index, username, message);
                    console.log(`Sent message to ${server.name}: ${username}: ${message}`);
                } catch (error) {
                    console.error(`Error sending message to server ${server.name}:`, error);
                }
            }
        }
    }

    async storeMessageInSupabase(serverIndex, username, message) {
        const { error: insertError } = await supabaseAdmin
            .from('chat_messages')
            .insert({
                server_index: serverIndex,
                username: username,
                message: message
            });

        if (insertError) {
            console.error(`Error inserting message into supabase: ${insertError.message}`);
            return;
        }

        // Maintain only 100 messages
        const { count, error: countError } = await supabaseAdmin
            .from('chat_messages')
            .select('id', { count: 'exact', head: true });

        if (countError) {
            console.error(`Error counting messages in supabase: ${countError.message}`);
            return;
        }

        if (count > 100) {
            const { data: oldMessages, error: selectError } = await supabaseAdmin
                .from('chat_messages')
                .select('id')
                .order('id', { ascending: true })
                .limit(count - 100);

            if (selectError) {
                console.error(`Error selecting old messages: ${selectError.message}`);
                return;
            }

            if (oldMessages && oldMessages.length > 0) {
                const idsToDelete = oldMessages.map(msg => msg.id);
                const { error: deleteError } = await supabaseAdmin
                    .from('chat_messages')
                    .delete()
                    .in('id', idsToDelete);

                if (deleteError) {
                    console.error(`Error deleting old messages: ${deleteError.message}`);
                } else {
                    console.log(`Deleted ${idsToDelete.length} old messages to maintain only 100 in the table.`);
                }
            }
        }
    }
    setupMessageListener() {
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || message.channel.id !== this.channelId) return;

            const username = message.author.username;
            const content = message.content;

            console.log(`Received message from Discord user ${username}: ${content}`);

            // Send the message to all servers
            await this.sendMessageToAllServers(username, content);

            // Store the Discord message in Supabase as well
            const discordServerIndex = 5;
            await this.storeMessageInSupabase(discordServerIndex, username, content);
        });
    }
    startPresenceUpdateCycle() {
        // Update presence every 60 seconds (adjust as needed)
        setInterval(async () => {
            await this.updateBotPresenceWithPlayerCounts();
        }, 20000);
    }

    async updateBotPresenceWithPlayerCounts() {
        try {
            let totalPlayers = 0;
            for (const s of this.rconManager.servers) {
                let playerListResult;
                try {
                    playerListResult = await this.rconManager.executeRconCommand(s.index, 'listplayers');
                } catch (err) {
                    console.error(`Error executing 'listplayers' on ${s.name}:`, err);
                    continue;
                }

                const playerCount = this.getPlayerCountFromList(playerListResult);
                totalPlayers += playerCount;
            }

            // Set the bot's activity (presence)
            this.client.user.setPresence({
                activities: [{ name: `${totalPlayers} players online`, type: ActivityType.Watching }],
                status: 'online'
            });

        } catch (error) {
            console.error('Error updating bot presence:', error);
        }
    }

    getPlayerCountFromList(playerListResult) {
        if (!playerListResult || playerListResult.trim() === '' || playerListResult.includes('No Players Connected')) {
            return 0;
        }
        const lines = playerListResult.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.length;
    }

    async dailyDinoWipe() {
        try {
            for (const server of this.rconManager.servers) {
                console.log(`Wiping Wild dinos for ${this.rconManager.server.name}`)
                await this.rconManager.executeRconCommand(server.index, "broadcast Destroying All Wild Dinos in 1< Minute")
                await this.rconManager.executeRconCommand(server.index, "destroywilddinos")
            }
        } catch (error) {
            console.error('Error Destroying Wild Dinos', error)
        }
    }

    async scheduleDailyDinoWipe() {
        const notifyDinoWipeTimes =[{ cron: '0 23 * * *', timeLeft: "1 hour" }, { cron: '30 23 * * *', timeLeft: "30 minutes" },
            { cron: '45 23 * * *', timeLeft: "15 minutes" }, { cron: '50 23 * * *', timeLeft: "10 minutes" },
            { cron: '55 23 * * *', timeLeft: "5 minutes" }
            ];
        
        try {
            notifyDinoWipeTimes.forEach((obj) => {
                cron.schedule(obj.cron, async () =>{
                    console.log(`Notifying for dino wipe in ${obj.timeLeft}`)
                    for (const server of this.rconManager.servers){
                        await this.rconManager.executeRconCommand(server.index, `Wild Dino Wipe in ${obj.timeLeft}`)
                    }
                })
            })
            console.log("Succesfully Registered Daily Dino Wipe")

        } catch (error) {
            console.error('Error In Schedule Dino Wipe Function: ', error)
        }
        cron.schedule('59 23 * * *', async () => {
            console.log('Running daily dino wipe at 23:59...');
            await this.dailyDinoWipe();
        });


    }
}

export default DiscordBot;