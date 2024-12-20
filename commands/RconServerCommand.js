// commands/RconServerCommand.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export class RconServerCommand {
    constructor(allowedRoleId) {
        this.name = 'rconserver';
        this.description = 'Execute an RCON command on a specified server (by index).';
        this.requiredRoles = [allowedRoleId]; // requires a specific role
    }

    getSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption(option =>
                option.setName('server')
                    .setDescription('The index of the server (e.g. 0, 1, 2...)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('command')
                    .setDescription('The RCON command to execute on the selected server')
                    .setRequired(true)
            );
    }

    async execute(interaction, rconManager) {
        const serverIndexString = interaction.options.getString('server', true);
        const command = interaction.options.getString('command', true);
        const serverIndex = parseInt(serverIndexString, 10);

        if (isNaN(serverIndex)) {
            await interaction.reply({ content: 'Invalid server index. Please provide a valid number.', ephemeral: true });
            return;
        }

        const server = rconManager.servers.find(s => s.index === serverIndex);
        if (!server) {
            await interaction.reply({ content: `No server found at index ${serverIndex}.`, ephemeral: true });
            return;
        }

        try {
            const result = await rconManager.executeRconCommand(server.index, command);

            const embed = new EmbedBuilder()
                .setTitle(`RCON Command on ${server.name}`)
                .setColor(0x00AA00)
                .addFields({
                    name: `Command: \`${command}\``,
                    value: result.trim() === '' ? 'No output.' : `\`\`\`${result}\`\`\``
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(`Error executing RCON command on ${server.name}:`, err);

            const embed = new EmbedBuilder()
                .setTitle(`Error executing RCON command on ${server.name}`)
                .setColor('#FF0000')
                .addFields({ name: 'Error', value: `${err.message}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}