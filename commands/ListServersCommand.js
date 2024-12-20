// commands/ListServersCommand.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export class ListServersCommand {
    constructor() {
        this.name = 'listservers';
        this.description = 'List all available servers and their indexes.';
    }

    getSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description);
    }

    async execute(interaction, rconManager) {
        // Fetch player list for each server
        const fields = [];

        for (const s of rconManager.servers) {
            let playerListResult;
            try {
                playerListResult = await rconManager.executeRconCommand(s.index, 'listplayers');
            } catch (err) {
                console.error(`Error executing 'listplayers' command on ${s.name}:`, err);
                playerListResult = `Error retrieving players: ${err.message}`;
            }

            // Add a field for this server
            fields.push({
                name: `${s.name} - ${s.index}`,
                value: playerListResult.trim() === '' ? 'No players online.' : playerListResult,
                inline: false
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('Available Servers and Current Players')
            .setColor('#FF0000') // Red color
            .addFields(fields)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: false });
    }
}