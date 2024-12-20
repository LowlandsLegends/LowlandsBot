// commands/RconCommand.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export class RconCommand {
    constructor(allowedRoleId) {
        this.name = 'rconcommand';
        this.description = 'Execute an RCON command on all servers.';
        this.requiredRoles = [allowedRoleId]; // requires a specific role
    }

    getSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption(option =>
                option.setName('command')
                    .setDescription('The RCON command to execute')
                    .setRequired(true)
            );
    }

    async execute(interaction, rconManager) {
        const command = interaction.options.getString('command', true);
        const fields = [];

        for (const server of rconManager.servers) {
            try {
                const result = await rconManager.executeRconCommand(server.index, command);
                fields.push({
                    name: server.name,
                    value: result.trim() === '' ? 'No output.' : `\`\`\`${result}\`\`\``
                });
            } catch (err) {
                console.error(`Error executing RCON command on ${server.name}:`, err);
                fields.push({
                    name: server.name,
                    value: `Error: ${err.message}`
                });
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`RCON Command: \`${command}\``)
            .setColor('#FF0000') // Set color to red
            .addFields(fields)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}