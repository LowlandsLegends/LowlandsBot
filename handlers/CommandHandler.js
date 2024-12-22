// handlers/CommandHandler.js
import { REST, Routes } from 'discord.js';

export class CommandHandler {
    /**
     * @param {Client} client - The Discord Client
     * @param {Object} options
     * @param {string} options.token - The Discord bot token
     * @param {string} options.clientId - The application (client) ID
     * @param {string} options.guildId - The guild (server) ID
     * @param {Object} options.rconManager - The RCON Manager instance
     */
    constructor(client, { token, clientId, guildId, rconManager }) {
        this.client = client;
        this.token = token;
        this.clientId = clientId;
        this.guildId = guildId;
        this.rconManager = rconManager;
        this.commands = new Map();
    }

    registerCommand(command) {
        this.commands.set(command.name, command);
    }

    async registerWithDiscord() {
        const rest = new REST({ version: '10' }).setToken(this.token);
        const slashCommands = [];

        for (const cmd of this.commands.values()) {
            // Each command class should have a method that returns a SlashCommandBuilder
            // or a ready-to-JSON slash command. We'll assume `cmd.getSlashCommand()` returns
            // a SlashCommandBuilder instance.
            slashCommands.push(cmd.getSlashCommand().toJSON());
        }

        console.log('Attempting to register slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(this.clientId, this.guildId, this.clientId),
            { body: slashCommands }
        );
        console.log('Successfully registered slash commands.');
    }

    setupInteractionListener() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const command = this.commands.get(interaction.commandName);
            if (!command) return; // Unknown command (shouldn't happen if properly registered)

            // Check required roles if any
            if (command.requiredRoles && command.requiredRoles.length > 0) {
                const memberRoles = interaction.member.roles.cache;
                const hasRequiredRole = command.requiredRoles.some(roleId => memberRoles.has(roleId));
                if (!hasRequiredRole) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                    return;
                }
            }

            try {
                await command.execute(interaction, this.rconManager);
            } catch (error) {
                console.error(`Error executing command ${interaction.commandName}:`, error);
                await interaction.reply({
                    content: 'An error occurred while executing this command.',
                    ephemeral: true
                });
            }
        });
    }
}