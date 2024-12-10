import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

class DiscordBot {
    constructor(rconManager) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.rconManager = rconManager;
        this.webhookUrl = process.env.WEBHOOK_URL;
        this.channelId = process.env.CHANNEL_ID;
        this.lastMessages = {};
    }

    async init() {
        await this.loginDiscord();
        this.setupMessageListener();
        this.startChatFetchCycle();
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

    setupMessageListener() {
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || message.channel.id !== this.channelId) return;

            const username = message.author.username;
            const content = message.content;

            console.log(`Received message from Discord user ${username}: ${content}`);

            // Send the message to all servers
            await this.sendMessageToAllServers(username, content);

            // Store the Discord message in Supabase as well
            // For Discord-origin messages, you can decide on a server_index. 
            // If you don't have a meaningful server index, you could use a special index like 0 or -1.
            const discordServerIndex = 5;
            await this.storeMessageInSupabase(discordServerIndex, username, content);
        });
    }

    startChatFetchCycle() {
        setInterval(() => {
            console.log('Starting chat fetch cycle for all servers.');
            for (const server of this.rconManager.servers) {
                this.fetchAndStoreChat(server);
            }
        }, 1000);
    }

    async fetchAndStoreChat(server) {
        try {
            const chatData = await this.rconManager.getLatestChat(server.index);

            if (!chatData) {
                console.log(`No new chat messages from ${server.name}`);
                return;
            }

            const { username, message } = chatData;

            if (this.lastMessages[server.index] === message) {
                console.log(`Duplicate message from ${server.name}: ${message}`);
                return;
            }

            this.lastMessages[server.index] = message;

            const content = `**[${server.name}] ${username}:** ${message}`;

            const payload = {
                content,
            };

            console.log('Sending message to Discord webhook:', JSON.stringify(payload));

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to send webhook message: ${response.status} ${response.statusText} - ${errorText}`);
            } else {
                console.log(`Sent message from ${username} on ${server.name} to Discord.`);
            }

            // Store the in-game message in Supabase
            await this.storeMessageInSupabase(server.index, username, message);

            await this.sendMessageToOtherServers(server.index, username, message);

        } catch (error) {
            console.error(`Error fetching chat from server ${server.name}:`, error);
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
        // Insert the message into Supabase
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

        // Maintain only 100 messages in the table
        const { count, error: countError } = await supabaseAdmin
            .from('chat_messages')
            .select('id', { count: 'exact', head: true });

        if (countError) {
            console.error(`Error counting messages in supabase: ${countError.message}`);
            return;
        }

        if (count > 100) {
            // Delete oldest messages to keep only the latest 100
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
}

export default DiscordBot;