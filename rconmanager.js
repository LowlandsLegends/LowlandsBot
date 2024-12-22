// RconManager.js
import { Rcon } from 'rcon-client';
import EventEmitter from 'events';

class RCONManager extends EventEmitter {
    constructor() {
        super();
        this.credentials = {
            rcon_ip: process.env.RCON_IP,
            rcon_pw: process.env.RCON_PASSWORD,
        };
        this.servers = [
            { index: 0, name: "The Island", port: 7779 },
            { index: 1, name: "Abberation", port: 7788 },
            { index: 2, name: "Extinction", port: 7791 },
        ];
        this.rconClients = {};
        this.reconnectDelays = {}; // To track reconnection delays for each server
        this.maxReconnectDelay = 60000; // Maximum delay of 60 seconds
    }

    async init() {
        for (const server of this.servers) {
            this.reconnectDelays[server.index] = 5000; // Start with 5 seconds
            this.connectRCON(server);
        }
    }

    async connectRCON(server) {
        if (!this.credentials.rcon_ip || !this.credentials.rcon_pw) {
            throw new Error('RCON IP or Password not set.');
        }

        try {
            const rconClient = await Rcon.connect({
                host: this.credentials.rcon_ip,
                port: server.port,
                password: this.credentials.rcon_pw,
                timeout: 5000, // 5 seconds timeout
            });

            this.rconClients[server.index] = rconClient;
            console.log(`Connected to RCON server: ${server.name}`);

            // Reset reconnection delay on successful connection
            this.reconnectDelays[server.index] = 5000;

            // Handle 'end' event
            rconClient.on('end', () => {
                console.warn(`RCON connection to ${server.name} ended. Attempting to reconnect...`);
                this.scheduleReconnect(server);
            });

            // Handle 'error' event
            rconClient.on('error', (error) => {
                console.error(`RCON error on server ${server.name}:`, error);
                if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                    console.log(`Reconnecting to RCON server ${server.name} due to ${error.code}...`);
                    this.scheduleReconnect(server);
                } else {
                    // Handle other types of errors if necessary
                    console.log(`Unhandled RCON error on server ${server.name}:`, error);
                }
            });
        } catch (error) {
            console.error(`Failed to connect to RCON for server: ${server.name}`, error);
            this.scheduleReconnect(server);
        }
    }

    scheduleReconnect(server) {
        // Avoid multiple reconnection attempts
        if (this.rconClients[server.index]) {
            this.rconClients[server.index].removeAllListeners();
            delete this.rconClients[server.index];
        }

        // Use exponential backoff for reconnection delays
        const delay = this.reconnectDelays[server.index] || 5000;
        console.log(`Scheduling reconnection to ${server.name} in ${delay / 1000} seconds...`);

        setTimeout(() => {
            console.log(`Reconnecting to RCON server: ${server.name}`);
            this.connectRCON(server);
            // Double the delay for next time, up to the maximum
            this.reconnectDelays[server.index] = Math.min(delay * 2, this.maxReconnectDelay);
        }, delay);
    }

    async executeRconCommand(serverIndex, command) {
        const rconClient = this.rconClients[serverIndex];

        if (!rconClient) {
            throw new Error(`RCON client for server index ${serverIndex} not initialized.`);
        }

        try {
            const response = await rconClient.send(command);
            return response;
        } catch (error) {
            console.error(`Error executing command "${command}" on server index ${serverIndex}:`, error);
            // Optionally, you can trigger a reconnect here if certain errors occur
            if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                const server = this.servers.find(s => s.index === serverIndex);
                if (server) {
                    this.scheduleReconnect(server);
                }
            }
            throw error;
        }
    }

    async sendMessage(serverIndex, username, message) {
        const command = `ServerChat "${username}: ${message}"`;
        return await this.executeRconCommand(serverIndex, command);
    }

    async getLatestChat(serverIndex) {
        try {
            const chat = await this.executeRconCommand(serverIndex, 'GetChat');
            const lines = chat.split(/\r?\n/).filter(line => line.trim() !== '');

            if (lines.length === 0) {
                return null;
            }

            const lastLine = lines[lines.length - 1].trim();

            if (lastLine.startsWith('SERVER')) {
                return null;
            }

            const colonIndex = lastLine.indexOf(':');
            if (colonIndex === -1) {
                return null;
            }

            const username = lastLine.substring(0, colonIndex).trim();
            const message = lastLine.substring(colonIndex + 1).trim();

            return { serverIndex, username, message };
        } catch (error) {
            console.error(`Error getting latest chat on server index ${serverIndex}:`, error);
            return null;
        }
    }

    // Optionally, add a method to gracefully close all connections
    async closeAll() {
        for (const serverIndex in this.rconClients) {
            try {
                await this.rconClients[serverIndex].end();
                console.log(`Closed RCON connection for server index ${serverIndex}`);
            } catch (error) {
                console.error(`Error closing RCON connection for server index ${serverIndex}:`, error);
            }
            delete this.rconClients[serverIndex];
        }
    }
}

export default RCONManager;
