import { Rcon } from 'rcon-client';

class RCONManager {
    constructor() {
        this.credentials = {
            rcon_ip: process.env.RCON_IP,
            rcon_pw: process.env.RCON_PASSWORD,
        };
        this.servers = [
            { index: 0, name: "The Island", port: 7779 },
            { index: 1, name: "The Center", port: 7791 },
            { index: 2, name: "Scorched Earth", port: 7782 },
            { index: 3, name: "Aberration", port: 7788 },
        ];
        this.rconClients = {};
    }

    async init() {
        for (const server of this.servers) {
            await this.connectRCON(server);
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
            });

            this.rconClients[server.index] = rconClient;
            console.log(`Connected to RCON server: ${server.name}`);

            rconClient.on('end', async () => {
                console.warn(`RCON connection to ${server.name} lost. Reconnecting...`);
                await this.connectRCON(server);
            });
        } catch (error) {
            console.error(`Failed to connect to RCON for server: ${server.name}`, error);
            setTimeout(() => this.connectRCON(server), 5000);
        }
    }

    async executeRconCommand(serverIndex, command) {
        const rconClient = this.rconClients[serverIndex];

        if (!rconClient) {
            throw new Error(`RCON client for server index ${serverIndex} not initialized.`);
        }

        try {
            const response = await rconClient.send(command);
            console.log(`Executed command on server index ${serverIndex}: "${command}"`);
            return response;
        } catch (error) {
            console.error(`Error executing command "${command}" on server index ${serverIndex}:`, error);
            throw error;
        }
    }

    async sendMessage(serverIndex, username, message) {
        const command = `ServerChat "${username}: ${message}"`;
        return await this.executeRconCommand(serverIndex, command);
    }

    async getLatestChat(serverIndex) {
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
    }
}

export default RCONManager;
